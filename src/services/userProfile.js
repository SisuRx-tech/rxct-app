const PROFILE_FIELDS = [
  "full_name",
  "university",
  "programme",
  "level",
  "part",
  "academic_session",
  "semester",
];

const LIMITS = {
  full_name: 80,
  university: 140,
  programme: 100,
  level: 40,
  part: 40,
  academic_session: 20,
  semester: 40,
};

export const UNIVERSITIES = [
  { value: "OAU", label: "Obafemi Awolowo University" },
  { value: "UI", label: "University of Ibadan" },
];

export const OAU_PROGRAMMES = [
  { value: "PharmD", label: "Doctor of Pharmacy (PharmD)" },
  { value: "BPharm", label: "Bachelor of Pharmacy (BPharm)" },
];

export const UI_PROGRAMMES = [
  { value: "Pharmacy", label: "Pharmacy" },
];

export const ACADEMIC_LEVELS = [
  { value: "200", label: "200 Level" },
  { value: "300", label: "300 Level" },
  { value: "400", label: "400 Level" },
  { value: "500", label: "500 Level" },
  { value: "600", label: "600 Level" },
];

export const SEMESTERS = [
  { value: "harmattan", label: "Harmattan" },
  { value: "rain", label: "Rain" },
];

const clean = (value, max) =>
  String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);

function normalizeUniversity(value) {
  const input = clean(value, LIMITS.university).toLowerCase();

  if (input === "oau" || input.includes("obafemi awolowo")) return "OAU";
  if (input === "ui" || input.includes("university of ibadan")) return "UI";

  return clean(value, LIMITS.university);
}

function normalizeProgramme(value) {
  const input = clean(value, LIMITS.programme).toLowerCase();

  if (input === "pharmd" || input.includes("doctor of pharmacy")) return "PharmD";
  if (input === "bpharm" || input.includes("bachelor of pharmacy")) return "BPharm";
  if (input === "pharmacy") return "Pharmacy";

  return clean(value, LIMITS.programme);
}

export function normalizeUserProfile(user) {
  const metadata = user?.user_metadata || {};

  const fullName = clean(
    metadata.full_name || metadata.name || metadata.display_name || "",
    LIMITS.full_name,
  );

  const level = clean(
    metadata.level || metadata.part || "",
    LIMITS.level,
  );

  return {
    full_name: fullName,
    university: normalizeUniversity(metadata.university),
    programme: normalizeProgramme(metadata.programme),
    level,
    part: clean(metadata.part || level, LIMITS.part),
    academic_session: clean(metadata.academic_session, LIMITS.academic_session),
    semester: clean(metadata.semester, LIMITS.semester).toLowerCase(),
  };
}

export function mergeUserProfileMetadata(existing = {}, updates = {}) {
  const next = { ...existing };

  for (const field of PROFILE_FIELDS) {
    const value = updates[field] !== undefined
      ? updates[field]
      : existing[field];

    next[field] = clean(value, LIMITS[field]);
  }

  next.university = normalizeUniversity(next.university);
  next.programme = normalizeProgramme(next.programme);

  // Keep common name keys aligned for OAuth providers and other clients.
  next.name = next.full_name;
  next.display_name = next.full_name;

  return next;
}

export function isUserProfileComplete(profile) {
  return Boolean(
    profile?.full_name &&
    profile?.university &&
    profile?.programme &&
    profile?.level &&
    profile?.academic_session &&
    profile?.semester
  );
}

export function getAcademicWorkspaceStatus(profile) {
  if (!isUserProfileComplete(profile)) {
    return {
      available: false,
      reason: "incomplete-profile",
      message: "Complete your academic profile to continue.",
    };
  }

  if (profile.university === "OAU" && profile.programme === "PharmD") {
    return { available: true, catalogue: "oau-pharmd" };
  }

  if (profile.university === "OAU" && profile.programme === "BPharm") {
    return { available: true, catalogue: "oau-bpharm" };
  }

  if (profile.university === "UI") {
    return {
      available: false,
      reason: "catalogue-unavailable",
      message: "The University of Ibadan workspace is not available yet.",
    };
  }

  return {
    available: false,
    reason: "unsupported-programme",
    message: "This university and programme combination is not available yet.",
  };
}

export function getProfileDisplayName(user) {
  const profile = normalizeUserProfile(user);
  return profile.full_name || "Student";
}
