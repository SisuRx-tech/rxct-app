const STOP_WORDS = new Set([
  "and", "the", "for", "with", "from", "into", "of", "in", "to",
  "a", "an", "on", "or", "by", "this", "that", "these", "those",
]);

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
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token.toLowerCase()));
}

function courseText(course) {
  return [
    course.code,
    course.title,
    course.courseContents,
    ...(course.learningOutcomes || []),
  ].join(" ");
}

function scoreCourse(course, documentText) {
  const normalizedDocument = normalize(documentText);
  const code = normalize(course.code);
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const codeMatch = Boolean(
    code && new RegExp(`(^| )${escapedCode.replace(/\s+/g, "\\s+")}( |$)`)
      .test(normalizedDocument),
  );

  const titleTokens = meaningfulTokens(course.title);
  const documentTokens = new Set(meaningfulTokens(documentText));
  const titleMatches = titleTokens.filter((token) => documentTokens.has(token)).length;
  const titleScore = titleTokens.length ? titleMatches / titleTokens.length : 0;

  const courseTokens = meaningfulTokens(courseText(course));
  const contentMatches = courseTokens.filter((token) => documentTokens.has(token)).length;
  const contentScore = courseTokens.length ? contentMatches / courseTokens.length : 0;

  const score = codeMatch
    ? 1
    : Math.min(0.94, titleScore * 0.72 + contentScore * 0.28);

  return { course, score, codeMatch, titleMatches };
}

export function recognizeCourse(documentText, courses) {
  const ranked = (courses || [])
    .map((course) => scoreCourse(course, documentText))
    .filter((candidate) => candidate.score >= 0.25)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] || null;
  const second = ranked[1] || null;
  const gap = best && second
    ? best.score - second.score
    : best?.score || 0;

  const highConfidence = Boolean(
    best && (
      best.codeMatch ||
      (best.score >= 0.72 && gap >= 0.06)
    ),
  );

  return {
    best,
    suggestions: ranked.slice(0, 5),
    confidence: best ? Math.round(best.score * 100) : 0,
    highConfidence,
    ambiguous: Boolean(best && !highConfidence),
    noMatch: !best,
    secondConfidence: second ? Math.round(second.score * 100) : 0,
  };
}

export function formatConfidence(confidence) {
  return `${Math.round(confidence)}% match`;
}
