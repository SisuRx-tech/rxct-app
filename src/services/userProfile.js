const PROFILE_FIELDS = [
  "full_name",
  "university",
  "programme",
  "level",
  "part",
  "semester",
];

const LIMITS = {
  full_name: 80,
  university: 140,
  programme: 100,
  level: 40,
  part: 40,
  semester: 40,
};

const clean = (value, max) =>
  String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);

export function normalizeUserProfile(user) {
  const metadata = user?.user_metadata || {};

  return {
    full_name: clean(
      metadata.full_name || metadata.name || metadata.display_name || "",
      LIMITS.full_name,
    ),
    university: clean(metadata.university, LIMITS.university),
    programme: clean(metadata.programme, LIMITS.programme),
    level: clean(metadata.level, LIMITS.level),
    part: clean(metadata.part, LIMITS.part),
    semester: clean(metadata.semester, LIMITS.semester),
  };
}

export function mergeUserProfileMetadata(existing = {}, updates = {}) {
  const next = { ...existing };

  for (const field of PROFILE_FIELDS) {
    next[field] = clean(updates[field], LIMITS[field]);
  }

  // Keep common name keys aligned for OAuth providers and other clients.
  next.name = next.full_name;
  next.display_name = next.full_name;

  return next;
}

export function getProfileDisplayName(user) {
  const profile = normalizeUserProfile(user);
  return profile.full_name || "Student";
}
