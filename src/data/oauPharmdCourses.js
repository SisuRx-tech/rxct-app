import catalogue from "./oauPharmdCourses.json";

export const OAU_PHARMD_COURSES = Object.freeze(catalogue.courses);
export const OAU_PHARMD_CATALOGUE_META = Object.freeze({
  ...catalogue,
  courses: undefined,
});

export function getCoursesForProfile({ level, semester } = {}) {
  return OAU_PHARMD_COURSES.filter((course) => {
    if (level && Number(course.level) !== Number(level)) return false;
    if (semester && course.semester !== semester) return false;
    return true;
  });
}

export function findCourseByCode(code) {
  const normalized = String(code || "").trim().toUpperCase().replace(/\\s+/g, " ");
  return OAU_PHARMD_COURSES.find((course) => course.code === normalized) || null;
}
