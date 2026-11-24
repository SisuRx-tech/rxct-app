import { useEffect, useState } from "react";
import ProfileHeader from "../components/profile/ProfileHeader";
import { useAuth } from "../context/useAuth";
import {
  normalizeUserProfile,
  UNIVERSITIES,
  OAU_PROGRAMMES,
  UI_PROGRAMMES,
  ACADEMIC_LEVELS,
  SEMESTERS,
} from "../services/userProfile";
import SearchableSelect from "../components/auth/SearchableSelect";
import styles from "./Profile.module.css";
import avatar from "../assets/circle_avatar.png";

const EMPTY_PROFILE = {
  full_name: "",
  university: "OAU",
  programme: "PharmD",
  level: "",
  part: "",
  academic_session: "",
  semester: "",
};

function Profile() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      ...EMPTY_PROFILE,
      ...normalizeUserProfile(user),
    });
  }, [user]);

  const programmes =
    form.university === "OAU" ? OAU_PROGRAMMES : UI_PROGRAMMES;

  const change = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "university"
        ? {
            programme:
              value === "OAU" ? "PharmD" : "Pharmacy",
          }
        : {}),
      ...(field === "level" ? { part: value } : {}),
    }));

    setMessage("");
    setError("");
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    if (
      !form.full_name.trim() ||
      !form.university ||
      !form.programme ||
      !form.level ||
      !/^\d{4}\/\d{4}$/.test(form.academic_session) ||
      !form.semester
    ) {
      setError("Please complete all fields using the required formats.");
      setSaving(false);
      return;
    }

    try {
      const { error: updateError } = await updateProfile({
        ...form,
        part: form.level,
      });

      if (updateError) throw updateError;
      setMessage("Profile saved successfully.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <ProfileHeader />

      <main className={styles.content}>
        <form onSubmit={save}>
          <section className={styles.section}>
            <div className={styles.identity}>
              <img src={avatar} alt="" className={styles.avatarImage} />
              <div className={styles.identityInfo}>
                <h2>{form.full_name || "Your name"}</h2>
                <p>{user?.email || "Signed-in account"}</p>
              </div>
            </div>

            <label className={styles.field}>
              <span>Preferred name</span>
              <input
                autoComplete="name"
                maxLength={80}
                value={form.full_name}
                onChange={(event) => change("full_name", event.target.value)}
                placeholder="Your preferred name"
                required
              />
            </label>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Academic Information</h2>
                <p>Keep your study space aligned with your current academic details.</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>University</span>
                <SearchableSelect
                  value={form.university}
                  options={UNIVERSITIES}
                  onChange={(value) => change("university", value)}
                  placeholder="Select your university"
                  searchPlaceholder="Search universities..."
                />
              </label>

              <label className={styles.field}>
                <span>Programme</span>
                <select
                  value={form.programme}
                  onChange={(event) => change("programme", event.target.value)}
                  required
                >
                  {programmes.map((item) => (
                    <option value={item.value} key={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Current level / Part</span>
                <select
                  value={form.level}
                  onChange={(event) => change("level", event.target.value)}
                  required
                >
                  <option value="">Select your level</option>
                  {ACADEMIC_LEVELS.map((item) => (
                    <option value={item.value} key={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Academic session</span>
                <input
                  value={form.academic_session}
                  onChange={(event) => change("academic_session", event.target.value)}
                  placeholder="2026/2027"
                  pattern="\d{4}/\d{4}"
                  title="Use the format 2026/2027"
                  maxLength={9}
                  required
                />
              </label>

              <label className={styles.field}>
                <span>Current semester</span>
                <select
                  value={form.semester}
                  onChange={(event) => change("semester", event.target.value)}
                  required
                >
                  <option value="">Select your semester</option>
                  {SEMESTERS.map((item) => (
                    <option value={item.value} key={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className={styles.profileHint}>
              These details are private to your signed-in account and can be changed at any time.
            </p>

            {message && (
              <p className={styles.successMessage} role="status">{message}</p>
            )}
            {error && (
              <p className={styles.errorMessage} role="alert">{error}</p>
            )}

            <div className={styles.formActions}>
              <button className={styles.editButton} type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </section>
        </form>
      </main>
    </div>
  );
}

export default Profile;
