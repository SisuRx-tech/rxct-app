import { useEffect, useState } from "react";
import ProfileHeader from "../components/profile/ProfileHeader";
import { useAuth } from "../context/useAuth";
import { normalizeUserProfile } from "../services/userProfile";
import styles from "./Profile.module.css";
import avatar from "../assets/circle_avatar.png";

const EMPTY_PROFILE = {
  full_name: "",
  university: "",
  programme: "",
  level: "",
  part: "",
  semester: "",
};

function Profile() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(normalizeUserProfile(user));
  }, [user]);

  const change = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setMessage("");
    setError("");
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const { error: updateError } = await updateProfile(form);
      if (updateError) throw updateError;
      setMessage("Profile saved successfully.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    ["university", "University", "e.g. Obafemi Awolowo University"],
    ["programme", "Programme", "e.g. Doctor of Pharmacy"],
    ["level", "Level", "e.g. 200 level"],
    ["part", "Part", "e.g. Part 2"],
    ["semester", "Semester", "e.g. First semester"],
  ];

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
              <span>Full name</span>
              <input
                autoComplete="name"
                maxLength={80}
                value={form.full_name}
                onChange={change("full_name")}
                placeholder="Your preferred name"
              />
            </label>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Academic Information</h2>
                <p>Used to make your study space more relevant.</p>
              </div>
            </div>
            <div className={styles.formGrid}>
              {fields.map(([field, label, placeholder]) => (
                <label className={styles.field} key={field}>
                  <span>{label}</span>
                  <input
                    value={form[field]}
                    onChange={change(field)}
                    placeholder={placeholder}
                    maxLength={140}
                  />
                </label>
              ))}
            </div>
            <p className={styles.profileHint}>
              These details are private to your signed-in account and can be changed at any time.
            </p>
            {message && <p className={styles.successMessage} role="status">{message}</p>}
            {error && <p className={styles.errorMessage} role="alert">{error}</p>}
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
