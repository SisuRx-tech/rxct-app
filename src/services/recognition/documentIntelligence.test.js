import assert from "node:assert/strict";
import {
  containsCode,
  rankCourseCandidates,
  scoreCourseCandidate,
} from "./documentIntelligence.js";

assert.equal(containsCode("PCT 502 Lecture Notes", "PCT 502"), true);
assert.equal(containsCode("XPCT 5020", "PCT 502"), false);

const course = {
  code: "PCT 502",
  title: "Pharmaceutical Technology",
  level: 500,
  keywords: [
    "tablets",
    "capsules",
    "granulation",
    "compression",
    "formulation",
    "dosage forms",
  ],
};

const strongDocument = {
  text: `
    PHARMACEUTICAL TECHNOLOGY
    Tablet formulation and manufacture
    Granulation and powder compression
    Capsule production and dosage forms
    Pharmaceutical manufacturing processes
  `,
  level: 500,
};

const inferred = scoreCourseCandidate(strongDocument, course);
assert.ok(inferred.strongContentEvidence);
assert.ok(inferred.score > 0.5);

const codeOnly = rankCourseCandidates(
  { text: "PCT 502" },
  [course]
);
assert.equal(codeOnly.shouldAutoAssign, false);

const unrelated = rankCourseCandidates(
  { text: "Student accommodation receipt and payment record" },
  [course]
);
assert.equal(unrelated.shouldAutoAssign, false);


const microbiology = {
  code: "PHM 502",
  title: "Pharmaceutical Microbiology",
  level: 500,
  keywords: ["bacteria", "fungi", "microorganisms", "sterilization", "antimicrobial"]
};

const competition = rankCourseCandidates(
  strongDocument,
  [microbiology, course]
);
assert.equal(competition.recommendation.code, "PCT 502");
assert.equal(competition.shouldAutoAssign, true);

const nearDuplicate = {
  ...course,
  code: "PCT 504"
};

const ambiguous = rankCourseCandidates(
  strongDocument,
  [course, nearDuplicate]
);
assert.equal(ambiguous.shouldAutoAssign, false);

const codeOnlyWithCompetition = rankCourseCandidates(
  { text: "PCT 502" },
  [course, microbiology]
);
assert.equal(codeOnlyWithCompetition.shouldAutoAssign, false);

console.log("Document intelligence tests passed.");
