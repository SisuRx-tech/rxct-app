// RxCT label importer
//
// Pulls US FDA prescribing information from openFDA and loads it into
// Supabase as medicine sections. Everything lands as review_status
// 'imported'. Nothing here can mark a section as reviewed.
//
// USAGE (from ~/projects/rxct-app)
//
//   1. Preview only, writes nothing to Supabase:
//      node scripts/import-labels.mjs --dry-run
//
//   2. Try one drug for real:
//      node --env-file=.env.import scripts/import-labels.mjs --only=Streptomycin
//
//   3. Import everything:
//      node --env-file=.env.import scripts/import-labels.mjs
//
// .env.import holds the SECRET key. It must never start with VITE_ and
// never be committed. It bypasses RLS, so it only ever runs on your machine.
//
// Safe to rerun: existing sections are skipped, never overwritten, so a
// section you already reviewed cannot be changed by a rerun.

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { DRUGS } from "./drug-list.mjs";

// ------------------------------------------------------------------
// Settings
// ------------------------------------------------------------------

const LABEL_API = "https://api.fda.gov/drug/label.json";

const SOURCE_NAME = "openFDA drug labels (US FDA prescribing information)";

const SOURCE_NOTE =
  "US FDA prescribing information via openFDA. US labelling: brands, doses " +
  "and approved uses can differ from Nigerian practice. Imported text, not " +
  "yet reviewed by RxCT.";

const MAX_CHARS = 15000;
const PAUSE_MS = 500;

// RxCT section -> label fields to try, in order. First one with text wins.
const SECTION_FIELDS = {
  overview: ["mechanism_of_action", "clinical_pharmacology", "description"],
  indications: ["indications_and_usage"],
  adverse_effects: ["adverse_reactions"],
  contraindications: ["contraindications"],
  interactions: ["drug_interactions"],
};

// ------------------------------------------------------------------
// Command line flags
// ------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");

const onlyFlag = process.argv.find((arg) => arg.startsWith("--only="));
const ONLY = onlyFlag ? onlyFlag.slice("--only=".length) : null;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanText(parts) {
  return parts
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shorten(text) {
  if (text.length <= MAX_CHARS) return text;

  const cut = text.slice(0, MAX_CHARS);
  const lastStop = cut.lastIndexOf(". ");
  const body = lastStop > MAX_CHARS * 0.7 ? cut.slice(0, lastStop + 1) : cut;

  return body + "\n\n[Shortened here. Read the full text in the source label.]";
}

// First field in the list that has real text.
function pickText(label, fields) {
  for (const field of fields) {
    const value = label[field];
    if (!Array.isArray(value) || value.length === 0) continue;

    const text = cleanText(value);
    if (text.length >= 40) return text;
  }
  return null;
}

// How many of the five RxCT sections this label can fill.
function richness(label) {
  return Object.values(SECTION_FIELDS).filter((fields) =>
    pickText(label, fields),
  ).length;
}

function sourceFooter(label) {
  const title =
    label.openfda?.brand_name?.[0] ??
    label.openfda?.generic_name?.[0] ??
    "label";

  const date = label.effective_time ?? "unknown date";

  return (
    `\n\nSource label: ${title}, US FDA prescribing information, ` +
    `effective ${date}. ` +
    `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${label.set_id}`
  );
}

function buildSections(label) {
  const sections = {};

  for (const [section, fields] of Object.entries(SECTION_FIELDS)) {
    const text = pickText(label, fields);
    if (!text) continue;

    sections[section] = shorten(text) + sourceFooter(label);
  }

  return sections;
}

// ------------------------------------------------------------------
// openFDA
// ------------------------------------------------------------------

// Newest labels first, exact generic name only. Three is enough to pick
// the most complete one without downloading dozens of large labels.
async function fetchLabels(fdaName) {
  const search = `openfda.generic_name.exact:"${fdaName}"`;
  const url =
    `${LABEL_API}?search=${encodeURIComponent(search)}` +
    `&sort=effective_time:desc&limit=3`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url);

    // openFDA answers 404 when nothing matches.
    if (response.status === 404) return [];

    if (response.ok) {
      const json = await response.json();
      return json.results ?? [];
    }

    if (response.status === 429 || response.status >= 500) {
      await sleep(2000 * attempt);
      continue;
    }

    throw new Error(`openFDA returned ${response.status} for ${fdaName}`);
  }

  throw new Error(`openFDA kept failing for ${fdaName}`);
}

function chooseBestLabel(labels) {
  const ranked = [...labels].sort(
    (a, b) =>
      richness(b) - richness(a) ||
      (b.effective_time ?? "").localeCompare(a.effective_time ?? ""),
  );

  const best = ranked[0];
  return best && richness(best) > 0 ? best : null;
}

// ------------------------------------------------------------------
// Supabase
// ------------------------------------------------------------------

async function ensureSource(db) {
  const { data: found, error } = await db
    .from("sources")
    .select("id")
    .eq("name", SOURCE_NAME)
    .maybeSingle();

  if (error) throw error;
  if (found) return found.id;

  const { data, error: insertError } = await db
    .from("sources")
    .insert({ name: SOURCE_NAME, license_note: SOURCE_NOTE })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return data.id;
}

async function ensureMedicine(db, name, label) {
  const { data: found, error } = await db
    .from("medicines")
    .select("id")
    .eq("name", name)
    .maybeSingle();

  if (error) throw error;
  if (found) return found.id;

  // New medicine: take the class from the label when it has one.
  const drugClass =
    label.openfda?.pharm_class_epc?.[0]?.replace(/\s*\[EPC\]$/, "") ?? null;

  const { data, error: insertError } = await db
    .from("medicines")
    .insert({ name, drug_class: drugClass })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return data.id;
}

// ignoreDuplicates means an existing row is left exactly as it is.
async function saveSections(db, medicineId, sourceId, sections) {
  const rows = Object.entries(sections).map(([section, body]) => ({
    medicine_id: medicineId,
    section,
    body,
    source_id: sourceId,
  }));

  const { error } = await db.from("medicine_sections").upsert(rows, {
    onConflict: "medicine_id,section,source_id",
    ignoreDuplicates: true,
  });

  if (error) throw error;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  let db = null;

  if (!DRY_RUN) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;

    if (!url || !key) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SECRET_KEY. " +
          "Run with: node --env-file=.env.import scripts/import-labels.mjs",
      );
    }

    db = createClient(url, key, { auth: { persistSession: false } });
  }

  const sourceId = db ? await ensureSource(db) : null;

  const list = ONLY
    ? DRUGS.filter(([name]) => name.toLowerCase() === ONLY.toLowerCase())
    : DRUGS;

  if (list.length === 0) {
    throw new Error(`No drug named "${ONLY}" in scripts/drug-list.mjs`);
  }

  console.log(`${DRY_RUN ? "DRY RUN" : "IMPORT"}: ${list.length} drug(s)\n`);

  const report = [];

  for (let i = 0; i < list.length; i++) {
    const [name, fdaName] = list[i];
    const tag = `[${i + 1}/${list.length}] ${name}`;

    try {
      const labels = await fetchLabels(fdaName);
      const label = chooseBestLabel(labels);

      if (!label) {
        console.log(`${tag}: MISS (no usable label for "${fdaName}")`);
        report.push({ name, fdaName, status: "miss" });
        await sleep(PAUSE_MS);
        continue;
      }

      const sections = buildSections(label);
      const found = Object.keys(sections);
      const status = found.length === 5 ? "full" : "partial";

      if (db) {
        const medicineId = await ensureMedicine(db, name, label);
        await saveSections(db, medicineId, sourceId, sections);
      }

      console.log(
        `${tag}: ${status.toUpperCase()} (${found.length}/5: ${found.join(", ")})`,
      );

      report.push({
        name,
        fdaName,
        status,
        setId: label.set_id,
        effective: label.effective_time,
        sections: found,
        preview: DRY_RUN
          ? Object.fromEntries(
              Object.entries(sections).map(([key, text]) => [
                key,
                text.slice(0, 160),
              ]),
            )
          : undefined,
      });
    } catch (error) {
      console.log(`${tag}: ERROR ${error.message} ${error.cause?.code ?? ""}`);
      report.push({ name, fdaName, status: "error", message: error.message });
    }

    await sleep(PAUSE_MS);
  }

  const count = (status) => report.filter((r) => r.status === status).length;

  console.log("\n----------------------------------------");
  console.log(`Full (5/5):  ${count("full")}`);
  console.log(`Partial:     ${count("partial")}`);
  console.log(`Misses:      ${count("miss")}`);
  console.log(`Errors:      ${count("error")}`);

  await mkdir("scripts/out", { recursive: true });
  const file = `scripts/out/${DRY_RUN ? "preview" : "report"}.json`;
  await writeFile(file, JSON.stringify(report, null, 2));

  console.log(`\nDetails written to ${file}`);
}

main().catch((error) => {
  console.error("\nStopped:", error.message);
  process.exit(1);
});
