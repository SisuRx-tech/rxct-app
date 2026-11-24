/* ========================================
   MEDICINE LABEL TEXT
   Turns the raw FDA label text stored in
   medicine_sections.body into something a
   student can actually study.
======================================== */

export const SECTION_ORDER = [
  "overview",
  "indications",
  "contraindications",
  "adverse_effects",
  "interactions",
];

export const SECTION_LABELS = {
  overview: "Overview",
  indications: "Indications",
  contraindications: "Contraindications",
  adverse_effects: "Adverse Effects",
  interactions: "Interactions",
};

// The importer writes these headings on their own line inside "overview".
const OVERVIEW_HEADINGS = {
  DESCRIPTION: "Description",
  "MECHANISM OF ACTION": "Mechanism of Action",
  "PHARMACOLOGICAL PROFILE": "Pharmacological Profile",
  PHARMACOKINETICS: "Pharmacokinetics",
};

const FOOTER_MARKER = "\n\nSource label:";
const SAFE_SOURCE_HOST = "https://dailymed.nlm.nih.gov/";

/* ========================================
   SENTENCE SPLITTING
======================================== */

const DOT = "\u2024";

const ABBREVIATIONS = [
  "e.g.",
  "i.e.",
  "vs.",
  "approx.",
  "dr.",
  "et al.",
  "u.s.",
  "inc.",
  "cf.",
  "fig.",
];

const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const protectAbbreviations = (text) =>
  ABBREVIATIONS.reduce(
    (result, abbreviation) =>
      result.replace(
        new RegExp(escapeRegExp(abbreviation), "gi"),
        (match) => match.replaceAll(".", DOT),
      ),
    text,
  );

function splitSentences(text) {
  const pieces = protectAbbreviations(text).split(
    /([.!?])\s+(?=[A-Z0-9(])/,
  );

  const sentences = [];

  for (let index = 0; index < pieces.length; index += 2) {
    const sentence = pieces[index] + (pieces[index + 1] ?? "");

    sentences.push(sentence.replaceAll(DOT, ".").trim());
  }

  return sentences;
}

/* ========================================
   CLEANING
   Only removes things that are clearly
   navigation noise (cross references and
   section numbers). Clinical numbers are
   never touched.
======================================== */

export function cleanLabelText(raw) {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    // numbered sub-headings such as "4.1 Active Bleeding"
    .replace(/(^|[.!?)]\s+)\d{1,2}\.\d{1,2}\s+(?=[A-Z][a-z])/g, "$1")
    // padded cross references such as "( 4.1 )" ending an item
    .replace(
      /\s*\(\s+\d{1,2}(?:\.\d{1,2})?(?:\s*[,;]\s*\d{1,2}(?:\.\d{1,2})?)*\s+\)(?=\s+[A-Z])/g,
      ".",
    )
    // padded cross references inside a sentence
    .replace(
      /\s*\(\s+\d{1,2}(?:\.\d{1,2})?(?:\s*[,;]\s*\d{1,2}(?:\.\d{1,2})?)*\s+\)/g,
      " ",
    )
    // bracketed cross references such as "[see Warnings and Precautions]"
    .replace(/\[\s*see\b[^\]]*\]/gi, " ")
    // a leading numbered heading such as "4 CONTRAINDICATIONS"
    .replace(
      /^\s*\d{1,2}(?:\.\d{1,2})?\s+[A-Z][A-Z ,&/'-]{2,}?(?=\s+[A-Z][a-z])/,
      "",
    )
    // "12 CLINICAL PHARMACOLOGY 12.1 Mechanism..." at the start of a block
    .replace(
      /^\s*\d{1,2}\s+[A-Z][A-Z ,&/'-]{2,}?\s+(?=\d{1,2}\.\d{1,2}\s)/,
      "",
    )
    .replace(/^\s*\d{1,2}\.\d{1,2}\s+(?=[A-Z])/, "")
    // image placeholder text the importer leaves at the end of a section
    .replace(/\s+description formula\s*$/i, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\.(\s*\.)+/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

const comparable = (sentence) =>
  sentence.toLowerCase().replace(/[^a-z0-9]+/g, "");

// FDA labels repeat themselves: a short highlights line, then the same
// point again in full. Keep the longer version.
function dropRepeats(sentences) {
  const keys = sentences.map(comparable);

  return sentences.filter((sentence, index) => {
    const key = keys[index];

    if (key.length < 25) return true;

    return !keys.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      if (other === key) return otherIndex < index;

      return other.length > key.length && other.includes(key);
    });
  });
}

export function toBullets(text) {
  const sentences = splitSentences(cleanLabelText(text)).filter(
    (sentence) => sentence.length >= 12,
  );

  return dropRepeats(sentences);
}

/* ========================================
   SECTION PARSING
======================================== */

function formatEffectiveDate(value) {
  const match = String(value).match(/^(\d{4})(\d{2})(\d{2})$/);

  if (!match) return value;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function splitSourceFooter(body) {
  const text = String(body ?? "");
  const index = text.lastIndexOf(FOOTER_MARKER);

  if (index === -1) return { text, source: null };

  const footer = text.slice(index).trim();

  const match = footer.match(
    /^Source label:\s*(.+?),\s*US FDA prescribing information,\s*effective\s+(.+?)\.\s+(https?:\/\/\S+)$/,
  );

  const source = match
    ? {
        title: match[1],
        effective: formatEffectiveDate(match[2]),
        // Only link to DailyMed. Never trust other hosts from stored text.
        url: match[3].startsWith(SAFE_SOURCE_HOST) ? match[3] : null,
      }
    : null;

  return { text: text.slice(0, index), source };
}

function splitBlocks(text) {
  const blocks = [];
  let current = { title: null, lines: [] };

  for (const line of text.split("\n")) {
    const heading = OVERVIEW_HEADINGS[line.trim()];

    if (heading) {
      blocks.push(current);
      current = { title: heading, lines: [] };
    } else {
      current.lines.push(line);
    }
  }

  blocks.push(current);

  return blocks.map((block) => ({
    title: block.title,
    text: block.lines.join(" "),
  }));
}

/*
  Returns:
  {
    blocks:    [{ title: string | null, bullets: string[] }],
    source:    { title, effective, url } | null,
    truncated: true when the importer shortened the text,
  }
*/
export function parseSectionBody(body) {
  const { text, source } = splitSourceFooter(body);

  const truncated = /\[Shortened here\./.test(text);
  const withoutMarker = text.replace(/\[Shortened here\.[^\]]*\]/, "");

  const blocks = splitBlocks(withoutMarker)
    .map((block) => ({
      title: block.title,
      bullets: toBullets(block.text),
    }))
    .filter((block) => block.bullets.length > 0);

  return { blocks, source, truncated };
}

// A few short, readable bullets for the "At a Glance" panel.
export function keyPoints(bullets, max = 3) {
  const concise = bullets.filter(
    (bullet) => bullet.length >= 20 && bullet.length <= 260,
  );

  return (concise.length > 0 ? concise : bullets)
    .slice(0, max)
    .map((bullet) =>
      bullet.length > 260
        ? bullet.slice(0, 257).trimEnd() + "\u2026"
        : bullet,
    );
}

/* ========================================
   NAMES
   Drug class names arrive in mixed casing
   ("Azole antifungal", "NSAID", "alpha-
   Adrenergic Blocker"). Capitalise each
   word, but never break existing acronyms.
======================================== */

const SMALL_WORDS = new Set([
  "of",
  "and",
  "the",
  "in",
  "for",
  "with",
  "a",
  "an",
  "to",
  "or",
]);

export function formatClassName(name) {
  if (!name) return "";

  return String(name)
    .split(" ")
    .map((word, index) => {
      const match = word.match(/^([^A-Za-z]*)(.*)$/);
      const prefix = match[1];
      const rest = match[2];

      if (!rest) return word;

      if (index > 0 && SMALL_WORDS.has(rest.toLowerCase())) {
        return prefix + rest.toLowerCase();
      }

      const hasInnerCapitals = /[A-Z]/.test(rest.slice(1));
      const body = hasInnerCapitals ? rest : rest.toLowerCase();

      return prefix + body.charAt(0).toUpperCase() + body.slice(1);
    })
    .join(" ");
}