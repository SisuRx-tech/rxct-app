/* ========================================
   SCIENTIFIC NOTATION
   Display-only conversion of plain-text
   notation into proper typography:

     H2O        ->  H₂O
     Cmax       ->  C with "max" as a real subscript
     CLcr, Kd   ->  CL(cr), K(d)
     QTcF       ->  QT with "cF" as a subscript
     GABAA      ->  GABA with "A" as a subscript
     m2         ->  m²
     10^-3      ->  10 with "−3" as a superscript
     A -> B     ->  A → B
     >= / <=    ->  ≥ / ≤

   Subscripts and superscripts are real
   <sub> / <sup> elements (see Scientific.jsx),
   so any letter works, small or capital.
   Unicode subscript letters do not exist for
   most letters and are missing from many cheap
   phone fonts, so letters are never converted
   to Unicode.

   It only ever matches known patterns.
   Doses, strengths and other clinical numbers
   are never touched, drug and gene names such
   as CYP2C9, SN38, Ki-67 and vitamin B12 are
   left alone, and the stored text is never
   modified.

   Complex equations will use KaTeX once the
   content actually contains them.
======================================== */

const SUB_OPEN = "\uE000";
const SUB_CLOSE = "\uE001";
const SUP_OPEN = "\uE002";
const SUP_CLOSE = "\uE003";

const SENTINELS = /[\uE000-\uE003]/g;

const sub = (value) => SUB_OPEN + value + SUB_CLOSE;
const sup = (value) => SUP_OPEN + value + SUP_CLOSE;

const GREEK = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  kappa: "κ",
  mu: "μ",
};

const NOT_ALNUM = "(?![A-Za-z0-9])";

/* ========================================
   FORMULA WHITELIST
   Only these exact formulas get subscript
   digits. A general "looks like a formula"
   rule would break names like CYP2C9.
======================================== */

const FORMULAS = [
  "H2O2",
  "H2O",
  "CO2",
  "N2O",
  "NO2",
  "SO2",
  "NH3",
  "NH4",
  "H2S",
  "H2SO4",
  "HNO3",
  "H3PO4",
  "HCO3",
  "CO3",
  "NO3",
  "PO4",
  "SO4",
  "O2",
  "CaCl2",
  "MgCl2",
  "MgSO4",
  "CaCO3",
  "NaHCO3",
  "KH2PO4",
  "K2HPO4",
  "Mg(OH)2",
  "Al(OH)3",
  "Ca(OH)2",
];

const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const FORMULA_PATTERN = new RegExp(
  "(^|[^A-Za-z0-9])(" +
    [...FORMULAS]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|") +
    ")" +
    NOT_ALNUM,
  "g",
);

/* ========================================
   PHYSIOLOGY: blood gases
======================================== */

const BLOOD_GASES = new Set([
  "SpO",
  "PaO",
  "FiO",
  "SaO",
  "SvO",
  "PvO",
  "PaCO",
  "PvCO",
]);

/* ========================================
   AUC SUBSCRIPTS
======================================== */

function tidyAuc(value) {
  return value
    .replace(/\s+/g, "")
    .replace(/[-−]/g, "–")
    .replace(/infinity|inf/gi, "∞")
    .replace(/tau/gi, "τ");
}

/* ========================================
   MOLECULAR FORMULAS
   Label text writes these spaced out
   ("C 37 H 48 N 6 O 5 S 2") or packed
   ("C37H48N6O5S2"). They are only converted
   after a phrase like "molecular formula is",
   or when the spaced style is unmistakable,
   and every symbol must be a real element.
   That is why CYP2C9 and SN38 stay untouched.
   Salts and hydrates (·HCl, ·2H2O) work too.
======================================== */

const ELEMENTS = new Set(
  (
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co " +
    "Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb " +
    "Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re " +
    "Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es " +
    "Fm Md No Lr"
  ).split(" "),
);

const isSpace = (character) =>
  character === " " || character === "\u00A0";

function formatFormula(text) {
  const skipSpaces = (position) => {
    while (isSpace(text[position])) position += 1;
    return position;
  };

  let output = "";
  let cursor = 0;
  let end = 0;
  let tokens = 0;
  let hasDigits = false;

  while (cursor < text.length) {
    let position = skipSpaces(cursor);
    let piece = "";

    // salt or hydrate separator, with an optional coefficient
    if (tokens > 0 && "·•∙".includes(text[position] || "x")) {
      piece += "·";
      position = skipSpaces(position + 1);

      const coefficient = /^\d{1,2}/.exec(text.slice(position));

      if (coefficient) {
        piece += coefficient[0];
        position += coefficient[0].length;
        position = skipSpaces(position);
      }
    }

    const match = /^[A-Z][a-z]?/.exec(text.slice(position));

    if (!match || !ELEMENTS.has(match[0])) break;

    const symbol = match[0];

    position += symbol.length;

    const afterSpaces = skipSpaces(position);
    const digits = /^\d{1,3}/.exec(text.slice(afterSpaces));

    if (digits) {
      piece += symbol + sub(digits[0]);
      position = afterSpaces + digits[0].length;
      hasDigits = true;
    } else {
      piece += symbol;
    }

    output += piece;
    tokens += 1;
    cursor = position;
    end = position;
  }

  if (tokens < 2 || !hasDigits) return text;

  return output + text.slice(end);
}

/* ========================================
   RULES
   Applied in order. Each wraps its result in
   private marker characters that are split
   into <sub> / <sup> parts at the end.
======================================== */

const RULES = [
  /* ----- molecular formulas (see above) ----- */

  [
    /\b((?:[Mm]olecular|[Ee]mpirical|[Cc]hemical|[Ss]tructural)\s+formula\s*(?:(?:is|=)\s+|of\s+[^.:;,]{1,50}?\s+is\s+|:\s*)?)([A-Z][^,;]{1,80})/g,
    (_, lead, formula) => lead + formatFormula(formula),
  ],
  [
    /\b(?:[A-Z][a-z]?\s\d{1,3}\s?){3,}(?=[\s,.;)]|$)/g,
    (match) => formatFormula(match),
  ],

  /* ----- arrows and comparison signs ----- */

  [/<=>/g, "⇔"],
  [/<-{1,2}>/g, "↔"],
  [/(^|[^<-])-{1,2}>/g, "$1→"],
  [/(^|\s)<-{1,2}(?=\s)/g, "$1←"],
  [/(^|[^<>=])=>/g, "$1⇒"],
  [/>=/g, "≥"],
  [/<=/g, "≤"],

  /* ----- explicit notation: x^2, 10^-3, X_{max}, C_max ----- */

  [
    /\^\{([^}\s]{1,12})\}/g,
    (_, value) => sup(value.replace(/-/g, "−")),
  ],
  [
    /\^(\d{1,3}[+\-−]|[+\-−]?\d{1,3}|[+\-−])(?![A-Za-z0-9])/g,
    (_, value) => sup(value.replace(/-/g, "−")),
  ],
  [
    /([A-Za-z0-9)\]])_\{([^}]{1,16})\}/g,
    (_, before, value) => before + sub(value),
  ],
  [
    /\b([A-Z]{1,4}|t)_([A-Za-z0-9]{1,6}(?:[-–−,/][A-Za-z0-9∞]{1,6})?)(?![A-Za-z0-9_])/g,
    (_, before, value) => before + sub(value),
  ],

  /* ----- 1.5 x 10^6 -> 1.5 × 10^6 ----- */

  [/(\d(?:\.\d+)?)\s*x\s*(?=10\uE002)/g, "$1 × "],

  /* ----- ions and charges ----- */

  [
    /(^|[^A-Za-z0-9])NH4\+/g,
    (_, before) => before + "NH" + sub("4") + sup("+"),
  ],
  [
    /(^|[^A-Za-z0-9])(HCO|NO|SO|PO)(\d)([-−])(?![A-Za-z0-9])/g,
    (_, before, letters, digit) =>
      before + letters + sub(digit) + sup("−"),
  ],
  [
    /\b(Ca|Mg|Fe|Zn|Cu|Mn)([23])\+/g,
    (_, symbol, digit) => symbol + sup(digit + "+"),
  ],
  [/\b(Na|K|Li|H)\+(?![A-Za-z0-9])/g, (_, symbol) => symbol + sup("+")],

  /* ----- blood gases and respiratory ----- */

  [
    /\b([SPF])([paiv])(C?O)2(?![A-Za-z0-9])/g,
    (match, first, second, gas) =>
      BLOOD_GASES.has(first + second + gas)
        ? first + sub(second) + gas + sub("2")
        : match,
  ],
  [
    /\b((?:ET|Et|et)CO)2(?![A-Za-z0-9])/g,
    (_, letters) => letters + sub("2"),
  ],
  [
    /\bV(C?O)2(max)?(?![A-Za-z0-9])/g,
    (_, gas, max) => "V" + gas + sub("2" + (max || "")),
  ],
  [/\bP(C?O)2(?![A-Za-z0-9])/g, (_, gas) => "P" + gas + sub("2")],
  [/\bFEV1(?![A-Za-z0-9])/g, "FEV" + sub("1")],
  [/\bHbA1c\b/g, "HbA" + sub("1c")],
  [/\bQT(c[BF]?)(?![A-Za-z0-9])/g, (_, value) => "QT" + sub(value)],

  /* ----- formulas (whitelist) ----- */

  [
    FORMULA_PATTERN,
    (_, before, formula) =>
      before + formula.replace(/\d+/g, (digits) => sub(digits)),
  ],

  /* ----- receptors and mediators ----- */

  [
    /\b5-HT([1-7][A-F]?(?:\/[1-7][A-F]?)?)(?![A-Za-z0-9])/g,
    (_, value) => "5-HT" + sub(value),
  ],
  [
    /\b(H|M|D|V|AT|NK|CB)([1-5])(?=[\s-]+(?:[Rr]eceptors?|[Aa]ntagonists?|[Aa]gonists?|[Bb]lockers?|[Aa]ntihistamines?|[Mm]uscarinic|[Ss]elective|[Ii]nhibitors?))/g,
    (_, letters, digit) => letters + sub(digit),
  ],
  [
    /\b(alpha|beta)[-\s]?([12])(?=[-\s]*(?:adrenergic|adrenoceptors?|adrenoreceptors?|receptors?|blockers?|blocking|agonists?|antagonists?|selective))/gi,
    (_, name, digit) => GREEK[name.toLowerCase()] + sub(digit),
  ],
  [
    /(^|[\s(/-])([αβ])([12])(?=[-\s]*(?:adrenergic|adrenoceptors?|adrenoreceptors?|receptors?|blockers?|blocking|agonists?|antagonists?|selective))/g,
    (_, before, letter, digit) => before + letter + sub(digit),
  ],
  [/\bP2Y(\d{1,2})(?![A-Za-z0-9])/g, (_, value) => "P2Y" + sub(value)],
  [/\bGABA([AB])(?![A-Za-z0-9])/g, (_, value) => "GABA" + sub(value)],
  [/\bGABA\(([AB])\)/g, (_, value) => "GABA" + sub(value)],
  [
    /\b(PG[A-J]|TX[AB]|LT[A-E])([1-6])(?:(alpha|α))?(?![A-Za-z0-9])/g,
    (_, base, digit, alpha) => base + sub(digit) + (alpha ? "α" : ""),
  ],

  /* ----- pharmacokinetics ----- */

  [
    /\bC(max|min|avg|av|ss|trough|peak|last)(,ss|\/ss)?(?![A-Za-z0-9])/g,
    (_, name, extra) => "C" + sub(name + (extra || "")),
  ],
  [
    /\b([tT])(max|min|last|1\/2(?:[αβγ]|z|λz|el|abs)?|½)(?![A-Za-z0-9])/g,
    (_, letter, value) => letter + sub(value),
  ],
  [
    /\bAUC(0\s?[-–−]\s?(?:inf(?:inity)?|INF|∞|t|last|tau|τ|\d{1,3})|inf(?:inity)?|INF|∞|last|tau|τ|ss|\d{1,3}(?:[-–−]\d{1,3})?)(?![A-Za-z0-9])/g,
    (_, value) => "AUC" + sub(tidyAuc(value)),
  ],
  [
    /\bV(dss|ss|d|z|c|area)(?![A-Za-z0-9])/g,
    (_, value) => "V" + sub(value),
  ],
  [
    /\b(CL|Cl)(cr|r|int|H|h|T|tot|ss)(?![A-Za-z0-9])/g,
    (_, letters, value) => letters + sub(value),
  ],
  [
    /\bK(el|on|off|cat|abs|app|a|e|d|i|m)(?![A-Za-z0-9]|-\d)/g,
    (_, value) => "K" + sub(value),
  ],
  [/\b([VEIR])max(?![A-Za-z0-9])/g, (_, letter) => letter + sub("max")],
  [
    /\b(IC|EC|ED|LD|TD|LC|ID|MIC|MBC)(100|99|95|90|80|75|50|25|20|10|5)(?![A-Za-z0-9])/g,
    (_, letters, value) => letters + sub(value),
  ],

  /* ----- units: mg/m2, cells/mm3 ----- */

  [
    /(^|[\d\s/(])(mm|cm|m)([23])(?![A-Za-z0-9])/g,
    (_, before, unit, digit) => before + unit + sup(digit),
  ],

  /* ----- Greek prefixes: beta-blocker -> β-blocker ----- */

  [
    /\b(alpha|beta|gamma|delta|kappa|mu)-(?=[A-Za-z0-9])/gi,
    (_, name) => GREEK[name.toLowerCase()] + "-",
  ],
];

function applyRules(text) {
  let result = text.replace(SENTINELS, "");

  for (const [pattern, replacement] of RULES) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

/* ========================================
   PARTS
   Returns [{ type: "text" | "sub" | "sup", value }]
======================================== */

const MARKED = /([\uE000\uE002])([^\uE001\uE003]*)[\uE001\uE003]/g;

export function parseScientific(text) {
  const source = String(text ?? "");

  if (!source) return [];

  const marked = applyRules(source);
  const parts = [];

  let last = 0;
  let match;

  MARKED.lastIndex = 0;

  while ((match = MARKED.exec(marked)) !== null) {
    if (match.index > last) {
      parts.push({
        type: "text",
        value: marked.slice(last, match.index).replace(SENTINELS, ""),
      });
    }

    parts.push({
      type: match[1] === SUB_OPEN ? "sub" : "sup",
      value: match[2],
    });

    last = MARKED.lastIndex;
  }

  if (last < marked.length) {
    parts.push({
      type: "text",
      value: marked.slice(last).replace(SENTINELS, ""),
    });
  }

  return parts;
}

/* ========================================
   PLAIN-STRING VERSION
   For places that can only take a string.
   Only digits and + / − become Unicode
   subscripts and superscripts (every phone
   font has those). Anything containing
   letters stays plain, so Cmax stays Cmax
   instead of risking missing glyphs.
======================================== */

const SUBSCRIPT = {
  0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄",
  5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉",
  "+": "₊", "-": "₋", "−": "₋",
};

const SUPERSCRIPT = {
  0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴",
  5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻",
};

export function toScientific(text) {
  return parseScientific(text)
    .map((part) => {
      if (part.type === "text") return part.value;

      const map = part.type === "sub" ? SUBSCRIPT : SUPERSCRIPT;
      const characters = [...part.value];

      return characters.every((character) => map[character])
        ? characters.map((character) => map[character]).join("")
        : part.value;
    })
    .join("");
}