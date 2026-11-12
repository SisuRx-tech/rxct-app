import { supabase } from "./supabase";
import { executeRequest } from "./diagnostics/executeRequest";
import { smartSearch } from "./medicines";
import { classifyError } from "./diagnostics/classifyError";

/* ========================================
   STUDY PROFILE DATA
   Medicines use medicine_sections.
   Drug classes use class_content.
   Therapeutic groups use group_content.
======================================== */

const DIRECT_MATCH_SCORE = 0.95;

const hasStudyContent = (record) => Boolean(record?.body?.trim());

// Escapes % and _ so names are matched literally.
const escapeLike = (value) =>
  String(value).trim().replace(/[\\%_]/g, (match) => "\\" + match);

/* ========================================
   SAVED COPIES (offline)
   Version 2 deliberately invalidates the old
   cache, which contained medicine-label
   fallback records in class/group profiles.
======================================== */

const CACHE_KEY = "rxct-profile-cache-v2";
const CACHE_LIMIT = 12;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
};

const writeCache = (key, value) => {
  const all = readCache();

  all[key] = { value, at: Date.now() };

  Object.keys(all)
    .sort((a, b) => all[b].at - all[a].at)
    .slice(CACHE_LIMIT)
    .forEach((old) => delete all[old]);

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    // Storage may be full. The profile still works online.
  }
};

async function withSavedCopy(key, load) {
  const saved = readCache()[key];

  // Reuse recently fetched profiles instead of requesting them again.
  if (saved && Date.now() - saved.at < CACHE_TTL) {
    return saved.value;
  }

  try {
    const value = await load();

    if (value) writeCache(key, value);

    return value;
  } catch (error) {
    if (saved) return { ...saved.value, fromCache: true };

    throw error;
  }
}

/* ========================================
   RELATIONS
======================================== */

async function getGroupOfClass(className) {
  if (!className) return null;

  const { data, error } = await supabase
    .from("drug_class_group_members")
    .select("drug_class_groups(id, name)")
    .ilike("drug_class", escapeLike(className))
    .limit(1);

  if (error) throw error;

  return data?.[0]?.drug_class_groups || null;
}

/* ========================================
   LOOK-UPS
======================================== */

async function lookupMedicine(name) {
  const { data, error } = await supabase
    .from("medicines")
    .select("name")
    .ilike("name", escapeLike(name))
    .limit(1);

  if (error) throw error;

  return data?.[0]?.name || null;
}

async function lookupClass(name) {
  const direct = await supabase
    .from("drug_classes")
    .select("name")
    .ilike("name", escapeLike(name))
    .limit(1);

  if (direct.error) throw direct.error;
  if (direct.data?.[0]) return direct.data[0].name;

  const alias = await supabase
    .from("drug_class_aliases")
    .select("drug_class")
    .ilike("alias", escapeLike(name))
    .limit(1);

  if (alias.error) throw alias.error;

  return alias.data?.[0]?.drug_class || null;
}

async function lookupGroup(name) {
  const direct = await supabase
    .from("drug_class_groups")
    .select("name")
    .ilike("name", escapeLike(name))
    .limit(1);

  if (direct.error) throw direct.error;
  if (direct.data?.[0]) return direct.data[0].name;

  const alias = await supabase
    .from("drug_class_group_aliases")
    .select("drug_class_groups(name)")
    .ilike("alias", escapeLike(name))
    .limit(1);

  if (alias.error) throw alias.error;

  return alias.data?.[0]?.drug_class_groups?.name || null;
}

/* ========================================
   MEDICINE PROFILE
======================================== */

export function getMedicineProfile(name) {
  return executeRequest(
    "getMedicineProfile",
    () =>
      withSavedCopy(`medicine:${name.toLowerCase()}`, async () => {
        const { data, error } = await supabase
          .from("medicines")
          .select(
            "id, name, drug_class, medicine_sections(id, section, body, review_status, sources(name))",
          )
          .ilike("name", escapeLike(name))
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        return { ...data, group: await getGroupOfClass(data.drug_class) };
      }),
    { query: name },
  );
}

/* ========================================
   DRUG CLASS PROFILE
   Only class_content supplies study sections.
   Medicines are returned as members, not as
   fallback content inside those sections.
======================================== */

export function getClassProfile(name) {
  return executeRequest(
    "getClassProfile",
    () =>
      withSavedCopy(`class:${name.toLowerCase()}`, async () => {
        const { data: drugClass, error } = await supabase
          .from("drug_classes")
          .select("id, name, slug, description")
          .ilike("name", escapeLike(name))
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!drugClass) return null;

        const [content, medicines, group] = await Promise.all([
          supabase
            .from("class_content")
            .select("section, body, review_status, sources(name)")
            .eq("class_id", drugClass.id),

          supabase
            .from("medicines")
            .select("id, name")
            .eq("class_id", drugClass.id)
            .order("name"),

          getGroupOfClass(drugClass.name),
        ]);

        if (content.error) throw content.error;
        if (medicines.error) throw medicines.error;

        return {
          ...drugClass,
          // Imported content remains visible. Review status is presented
          // by SourceLine; imported does not mean reviewed or approved.
          content: (content.data || []).filter(hasStudyContent),
          medicines: medicines.data || [],
          group,
        };
      }),
    { query: name },
  );
}

/* ========================================
   THERAPEUTIC GROUP PROFILE
   Only group_content supplies study sections.
   Classes and their medicine counts supply
   the structured Classification section.
======================================== */

export function getGroupProfile(name) {
  return executeRequest(
    "getGroupProfile",
    () =>
      withSavedCopy(`group:${name.toLowerCase()}`, async () => {
        const { data: group, error } = await supabase
          .from("drug_class_groups")
          .select(
            "id, name, slug, description, drug_class_group_members(drug_class)",
          )
          .ilike("name", escapeLike(name))
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!group) return null;

        const [content, classRows] = await Promise.all([
          supabase
            .from("group_content")
            .select("section, body, review_status, sources(name)")
            .eq("group_id", group.id),

          supabase
            .from("drug_classes")
            .select("id, name, medicines(id, name)"),
        ]);

        if (content.error) throw content.error;
        if (classRows.error) throw classRows.error;

        const wanted = new Set(
          (group.drug_class_group_members || []).map((member) =>
            member.drug_class.toLowerCase(),
          ),
        );

        const classes = (classRows.data || [])
          .filter((item) => wanted.has(item.name.toLowerCase()))
          .map((item) => ({
            id: item.id,
            name: item.name,
            medicineCount: item.medicines?.length ?? 0,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          id: group.id,
          name: group.name,
          slug: group.slug,
          description: group.description,
          content: (content.data || []).filter(hasStudyContent),
          classes,
        };
      }),
    { query: name },
  );
}

/* ========================================
   SEARCH
======================================== */

const searchCache = new Map();

async function runSearch(query) {
  const key = query.trim().toLowerCase();

  if (!searchCache.has(key)) {
    searchCache.set(key, await smartSearch(query));
  }

  return searchCache.get(key);
}

const pickDirectMatch = (found) => {
  if (found.kind !== "medicines" || found.didYouMean) return null;

  const [top, second] = found.medicines;

  if (!top || top.score < DIRECT_MATCH_SCORE) return null;
  if (second && second.score >= DIRECT_MATCH_SCORE) return null;

  return top;
};

/* ========================================
   RESOLVE
======================================== */

const PROFILE_LOADERS = {
  medicine: getMedicineProfile,
  class: getClassProfile,
  group: getGroupProfile,
};

const LOOKUPS = {
  medicine: lookupMedicine,
  class: lookupClass,
  group: lookupGroup,
};

export async function resolveQuery(query, kind) {
  const kinds = LOOKUPS[kind] ? [kind] : ["medicine", "class", "group"];

  const results = await Promise.allSettled(
    kinds.map((type) => LOOKUPS[type](query)),
  );

  const names = results.map((result) =>
    result.status === "fulfilled" ? result.value : null,
  );

  const lookupErrors = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);

  const connectionError = lookupErrors.find((error) =>
    ["OFFLINE", "NETWORK", "TIMEOUT", "SERVER"].includes(
      classifyError(error),
    ),
  );

  if (!names.some(Boolean) && connectionError) {
    throw connectionError;
  }

  const index = names.findIndex(Boolean);

  if (index !== -1) {
    const type = kinds[index];
    const data = await PROFILE_LOADERS[type](names[index]);

    if (data) return { type, name: data.name, data };
  }

  const found = await runSearch(query);
  const direct = pickDirectMatch(found);

  if (direct) {
    const data = await getMedicineProfile(direct.name);

    if (data) {
      const viaOtherName =
        direct.matched_term &&
        direct.matched_term.toLowerCase() !== direct.name.toLowerCase();

      return {
        type: "medicine",
        name: data.name,
        data,
        openSection: ["overview", "dosage"].includes(found.intent)
          ? ""
          : found.openSection,
        notice: found.notice,
        matchedNote: viaOtherName
          ? `Showing ${direct.name}, matched from "${direct.matched_term}".`
          : null,
      };
    }
  }

  return { type: "search", found };
}
