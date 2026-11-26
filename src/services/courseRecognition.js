import { rankCourseCandidates } from "./recognition/documentIntelligence.js";

const STOP_WORDS = new Set([
  "and", "the", "for", "with", "from", "into", "of", "in", "to",
  "a", "an", "on", "or", "by", "this", "that", "these", "those",
  "course", "courses", "lecture", "lectures", "notes", "department",
  "university", "faculty",
]);

const CODE_PATTERN = /\b[A-Z]{2,5}\s*[-/]?\s*\d{3}[A-Z]?\b/g;

function normalize(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value) {
  return normalize(value)
    .split(" ")
    .filter(
      (token) =>
        token.length > 2 && !STOP_WORDS.has(token.toLowerCase()),
    );
}

function courseText(course) {
  return [
    course.code,
    course.title,
    course.courseContents,
    ...(course.learningOutcomes || []),
  ].join(" ");
}

function getDocumentLines(documentText) {
  return String(documentText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getCodeEvidence(code, documentText, courseTitle = '') {
  const normalizedCode = normalize(code);
  const lines = getDocumentLines(documentText);
  const matchingLines = [];

  lines.forEach((line, index) => {
    if (new RegExp(
        `(^|[^a-z0-9])${normalizedCode.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}($|[^a-z0-9])`,
        "i"
      ).test(normalize(line))) {
      matchingLines.push({ line, index });
    }
  });

  if (!matchingLines.length) {
    return {
      found: false,
      contextual: false,
      occurrences: 0,
      nearbyTitleMatches: 0,
    };
  }


  const headerPattern =
    /\b(COURSE CODE|COURSE TITLE|SUBJECT|COURSE|MODULE|LECTURE|NOTES|TOPIC)\b/i;

  let nearbyTitleMatches = 0;
  let contextual = false;

  for (const match of matchingLines) {
    const surroundingLines = lines.slice(
      Math.max(0, match.index - 1),
      Math.min(lines.length, match.index + 2),
    );

    const surroundingText = surroundingLines.join(" ");
    const hasHeaderContext = headerPattern.test(surroundingText);
    const surroundingTokens = new Set(meaningfulTokens(surroundingText));
    const titleTokens = meaningfulTokens(courseTitle);
    const titleMatchCount = titleTokens.filter((token) =>
      surroundingTokens.has(token)
    ).length;
    const hasDescriptiveText = titleMatchCount >= 2;

    nearbyTitleMatches = Math.max(nearbyTitleMatches, titleMatchCount);

    // A code in a heading or beside descriptive course text is stronger
    // evidence than a code appearing only in a reference or bibliography.
    if (
      hasDescriptiveText &&
      (hasHeaderContext || match.index < 8)
    ) {
      contextual = true;
    }
  }

  return {
    found: true,
    contextual,
    occurrences: matchingLines.length,
    nearbyTitleMatches,
  };
}

function scoreCourse(course, documentText) {
  const documentTokens = new Set(meaningfulTokens(documentText));
  const titleTokens = meaningfulTokens(course.title);
  const courseTokens = meaningfulTokens(courseText(course));

  const titleMatches = titleTokens.filter((token) =>
    documentTokens.has(token),
  ).length;

  const contentMatches = courseTokens.filter((token) =>
    documentTokens.has(token),
  ).length;

  const titleScore = titleTokens.length
    ? titleMatches / titleTokens.length
    : 0;

  const contentScore = courseTokens.length
    ? contentMatches / courseTokens.length
    : 0;

  const codeEvidence = getCodeEvidence(course.code, documentText, course.title);

  let score = Math.min(
    0.94,
    titleScore * 0.72 + contentScore * 0.28,
  );

  if (codeEvidence.found) {
    score = codeEvidence.contextual
      ? Math.max(score, 0.98)
      : Math.max(score, 0.84);
  }

  return {
    course,
    score,
    codeMatch: codeEvidence.found,
    codeContextMatch: codeEvidence.contextual,
    codeOccurrences: codeEvidence.occurrences,
    titleMatches,
    titleScore,
    evidence: {
      code: codeEvidence.found,
      contextualCode: codeEvidence.contextual,
      titleMatches,
      titleTokenCount: titleTokens.length,
    },
  };
}

function detectExternalCourseCodes(documentText, courses) {
  const knownCodes = new Set(
    (courses || []).map((course) => normalize(course.code)),
  );

  const lines = getDocumentLines(documentText);
  const candidates = new Map();

  lines.forEach((line, index) => {
    const matches = line.toUpperCase().match(CODE_PATTERN) || [];

    for (const rawCode of matches) {
      const code = normalize(rawCode);

      if (knownCodes.has(code)) continue;

      const surroundingLines = lines.slice(
        Math.max(0, index - 1),
        Math.min(lines.length, index + 2),
      );

      const surroundingText = surroundingLines.join(" ");
      const hasHeaderContext =
        /\b(COURSE CODE|COURSE TITLE|SUBJECT|COURSE|MODULE|LECTURE|NOTES|TOPIC)\b/i
          .test(surroundingText);

      const hasDescriptiveText =
        meaningfulTokens(surroundingText).length >= 2;

      // Preserve plausible external identities, but do not assign them
      // to this catalogue or invent a course title.
      const contextual =
        hasHeaderContext ||
        (index < 8 && hasDescriptiveText);

      if (!contextual) continue;

      const existing = candidates.get(code);

      candidates.set(code, {
        code,
        title: null,
        status: "external-unmapped",
        contextual: true,
        occurrences: (existing?.occurrences || 0) + 1,
      });
    }
  });

  return [...candidates.values()];
}

export function recognizeCourse(documentText, courses) {
  const availableCourses = Array.isArray(courses) ? courses : [];

  const intelligence = rankCourseCandidates(
    { text: documentText },
    availableCourses,
  );

  const intelligenceByCourse = new Map(
    intelligence.candidates.map((candidate) => [
      candidate.course,
      candidate,
    ]),
  );

  const ranked = availableCourses
    .map((course) => {
      const existing = scoreCourse(course, documentText);
      const inferred = intelligenceByCourse.get(course);

      if (!inferred) return existing;

      return {
        ...existing,
        score: inferred.score,
        intelligence: inferred,
      };
    })
    .filter((candidate) => candidate.score >= 0.25)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] || null;
  const second = ranked[1] || null;

  const highConfidence = Boolean(
    best &&
    intelligence.shouldAutoAssign &&
    intelligence.recommendation === best.course
  );

  const externalCandidates = detectExternalCourseCodes(
    documentText,
    availableCourses,
  );

  const recognizedIdentity = best
    ? {
        code: best.course.code,
        title: best.course.title,
        status: "in-catalogue",
        confidence: Math.round(best.score * 100),
      }
    : externalCandidates[0] || null;

  return {
    best,
    suggestions: ranked.slice(0, 5),
    confidence: best ? Math.round(best.score * 100) : 0,
    highConfidence,
    ambiguous: Boolean(best && !highConfidence),
    noMatch: !best,
    secondConfidence: second
      ? Math.round(second.score * 100)
      : 0,

    // Additional identity information for later import-flow integration.
    recognizedIdentity,
    externalCandidates,
    curriculumStatus: best
      ? "in-catalogue"
      : externalCandidates.length
        ? "outside-catalogue"
        : "unresolved",
  };
}

export function formatConfidence(confidence) {
  return `${Math.round(confidence)}% match`;
}
