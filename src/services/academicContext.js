import { normalizeUserProfile } from "./userProfile";
import { getStudyContext } from "./studyContext";

export function getAcademicContext(user) {
  const profile = normalizeUserProfile(user);

  return {
    university: profile.university,
    programme: profile.programme,
    level: profile.level,
    part: profile.part,
    semester: profile.semester,
    hasAcademicProfile: Boolean(
      profile.university || profile.programme || profile.level ||
      profile.part || profile.semester
    ),
  };
}

export function getRxctContext(user) {
  return {
    academic: getAcademicContext(user),
    study: getStudyContext(),
  };
}
