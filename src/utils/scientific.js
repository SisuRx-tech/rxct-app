/* ========================================
   SCIENTIFIC NOTATION
   Display-only conversion of plain-text
   notation into proper typography:
   H2O -> H₂O, Ca2+ -> Ca²⁺, beta- -> β-.

   It never touches doses, strengths or any
   other clinical number, and the stored
   text is never modified.

   Complex equations will use KaTeX once
   the content actually contains them.
======================================== */

const SUBSCRIPT = {
  0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄",
  5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉",
};

const GREEK = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  kappa: "κ",
  mu: "μ",
};

export function toScientific(text) {
  return String(text ?? "")
    .replace(/\bH2O2\b/g, "H₂O₂")
    .replace(/\bH2O\b/g, "H₂O")
    .replace(/\bCO2\b/g, "CO₂")
    .replace(/\bN2O\b/g, "N₂O")
    .replace(/\bNH4\+/g, "NH₄⁺")
    .replace(/\b(Ca|Mg|Fe|Zn|Cu)2\+/g, "$1²⁺")
    .replace(/\b(Na|K|Li)\+(?!\w)/g, "$1⁺")
    .replace(
      /\bH2(?=[\s-]+(?:[Rr]eceptor|[Bb]locker|[Aa]ntagonist))/g,
      "H₂",
    )
    .replace(
      /\b5-HT([1-7])(?!\d)/g,
      (_, digit) => "5-HT" + SUBSCRIPT[digit],
    )
    .replace(
      /\b(alpha|beta|gamma|delta|kappa|mu)-(?=[A-Za-z0-9])/gi,
      (_, name) => GREEK[name.toLowerCase()] + "-",
    );
}
