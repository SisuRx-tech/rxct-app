import catalogue from "./oauBpharmCourses.json";

export const OAU_BPHARM_COURSES = Object.freeze(catalogue.courses);

export const OAU_BPHARM_CATALOGUE_META = Object.freeze({
  ...catalogue,
  courses: undefined,
  syllabusHighlights: undefined,
});

export const OAU_BPHARM_SYLLABUS_HIGHLIGHTS = Object.freeze(
  catalogue.syllabusHighlights,
);

export function getBpharmCoursesForProfile({ level } = {}) {
  return OAU_BPHARM_COURSES.filter((course) => {
    if (level && Number(course.level) !== Number(level)) return false;
    return true;
  });
}

export function findBpharmCourseByCode(code) {
  const normalized = String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\\s+/g, " ");

  return (
    OAU_BPHARM_COURSES.find(
      (course) => course.code.toUpperCase() === normalized,
    ) || null
  );
}

export function getBpharmSyllabusHighlights({ level, department } = {}) {
  return OAU_BPHARM_SYLLABUS_HIGHLIGHTS.filter((entry) => {
    if (level && Number(entry.level) !== Number(level)) return false;
    if (department && entry.department !== department) return false;
    return true;
  });
}
