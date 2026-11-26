import { OAU_PHARMD_COURSE_KNOWLEDGE } from "../../data/oauPharmdCourseKnowledge.js";

const STOP_WORDS = new Set([
  "and", "the", "for", "with", "from", "into", "this", "that",
  "course", "study", "introduction", "general", "basic", "part",
  "semester", "department", "university", "lecture", "notes",
  "document", "pdf", "pharmacy", "science"
]);

const normalize = (value = "") =>
  String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokens = (value = "") =>
  [...new Set(
    normalize(value)
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  )];

const asArray = (value) =>
  Array.isArray(value) ? value : value ? [value] : [];

function getCourseCode(course) {
  return course.code || course.courseCode || course.course_code || "";
}

function getCourseTitle(course) {
  return course.title || course.name || course.courseTitle ||
    course.course_title || "";
}

function getCourseTopics(course) {
  const code = getCourseCode(course).toUpperCase().trim();
  const verifiedKnowledge =
    OAU_PHARMD_COURSE_KNOWLEDGE[code]?.topics || [];

  return [
    ...asArray(course.keywords),
    ...asArray(course.aliases),
    ...asArray(course.topics),
    ...asArray(course.description),
    ...asArray(course.courseContents),
    ...asArray(course.course_contents),
    ...asArray(course.learningOutcomes),
    ...asArray(course.learning_outcomes),
    ...verifiedKnowledge,
  ].join(" ");
}

function containsCode(text, code) {
  const normalizedCode = normalize(code);
  if (!normalizedCode) return false;

  const pattern = normalizedCode
    .split(" ")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s\\-/]+");

  return new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`, "i")
    .test(String(text || "").replace(/[_]/g, " "));
}

function overlapScore(documentTokens, referenceTokens) {
  if (!referenceTokens.length) return 0;

  const matches = referenceTokens.filter((word) =>
    documentTokens.has(word)
  );

  return {
    score: matches.length / referenceTokens.length,
    matches,
  };
}

function extractDocumentText(document = {}) {
  return [
    document.text,
    document.content,
    document.extractedText,
    document.extracted_text,
    document.filename,
    document.name,
    document.title,
  ].filter(Boolean).join("\n");
}

function scoreCourseCandidate(document, course, context = {}) {
  const text = extractDocumentText(document);
  const documentTokens = new Set(tokens(text));

  const code = getCourseCode(course);
  const title = getCourseTitle(course);
  const titleTokens = tokens(title);
  const topicTokens = tokens(getCourseTopics(course));

  const codeMatch = containsCode(text, code);

  const titleEvidence = overlapScore(documentTokens, titleTokens);
  const topicEvidence = overlapScore(documentTokens, topicTokens);

  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 80);
  const headingText = lines
    .filter((line) => line.length < 180)
    .slice(0, 35)
    .join(" ");

  const headingEvidence = overlapScore(
    new Set(tokens(headingText)),
    titleTokens
  );

  const filename = normalize(document.filename || document.name || "");
  const filenameEvidence = overlapScore(
    new Set(tokens(filename)),
    titleTokens
  );

  const documentLevel = Number(
    document.level || document.academicLevel || context.level || 0
  );
  const courseLevel = Number(course.level || course.academicLevel || 0);

  const levelMatch = Boolean(
    documentLevel && courseLevel && documentLevel === courseLevel
  );

  const documentSemester = normalize(
    document.semester || context.semester || ""
  );
  const courseSemester = normalize(course.semester || "");

  const semesterMatch = Boolean(
    documentSemester &&
    courseSemester &&
    documentSemester === courseSemester
  );

  // Course code is useful, but never sufficient by itself.
  const score =
    (codeMatch ? 0.30 : 0) +
    titleEvidence.score * 0.30 +
    topicEvidence.score * 0.30 +
    headingEvidence.score * 0.06 +
    filenameEvidence.score * 0.02 +
    (levelMatch ? 0.01 : 0) +
    (semesterMatch ? 0.01 : 0);

  const independentSignals = [
    codeMatch,
    titleEvidence.score >= 0.4,
    topicEvidence.score >= 0.2,
    headingEvidence.score >= 0.4,
  ].filter(Boolean).length;

  const strongContentEvidence =
    titleEvidence.score >= 0.6 &&
    topicEvidence.score >= 0.25;

  return {
    course,
    score: Math.min(1, score),
    codeMatch,
    titleCoverage: titleEvidence.score,
    topicCoverage: topicEvidence.score,
    headingCoverage: headingEvidence.score,
    filenameCoverage: filenameEvidence.score,
    levelMatch,
    semesterMatch,
    independentSignals,
    strongContentEvidence,
    evidence: {
      matchedTitleTerms: titleEvidence.matches,
      matchedTopicTerms: topicEvidence.matches,
    },
  };
}

function rankCourseCandidates(document, courses = [], context = {}) {
  const ranked = courses
    .map((course) => scoreCourseCandidate(document, course, context))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];

  if (!best) {
    return {
      candidates: [],
      recommendation: null,
      confidence: "none",
      shouldAutoAssign: false,
      reason: "No courses available for comparison.",
    };
  }

  const gap = best.score - (second?.score || 0);

  // High confidence requires multiple independent signals.
  const strongContentMatch =
    best.strongContentEvidence &&
    best.titleCoverage >= 0.8 &&
    best.topicCoverage >= 0.6;

  const shouldAutoAssign =
    best.score >= 0.56 &&
    gap >= 0.15 &&
    best.independentSignals >= 2 &&
    (best.codeMatch || strongContentMatch);

  const confidence = shouldAutoAssign
    ? "high"
    : best.score >= 0.42
      ? "medium"
      : "low";

  return {
    candidates: ranked,
    recommendation: best.course,
    confidence,
    shouldAutoAssign,
    score: best.score,
    gap,
    reason: shouldAutoAssign
      ? "Multiple independent signals support this course."
      : "Evidence is insufficient for automatic assignment.",
  };
}

export {
  normalize,
  tokens,
  containsCode,
  scoreCourseCandidate,
  rankCourseCandidates,
};
