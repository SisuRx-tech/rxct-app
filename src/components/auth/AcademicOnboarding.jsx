import { useState } from "react";
import { useAuth } from "../../context/useAuth";
import {
  UNIVERSITIES,
  OAU_PROGRAMMES,
  UI_PROGRAMMES,
  ACADEMIC_LEVELS,
  SEMESTERS,
} from "../../services/userProfile";
import styles from "./AcademicOnboarding.module.css";
import SearchableSelect from "./SearchableSelect";

export default function AcademicOnboarding() {
  const { user, updateProfile, signOut } = useAuth();

  const [form, setForm] = useState({
    full_name:
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      "",
    university: "OAU",
    programme: "PharmD",
    level: "",
    academic_session: "2026/2027",
    semester: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const programmes =
    form.university === "OAU" ? OAU_PROGRAMMES : UI_PROGRAMMES;

  const change = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "university"
        ? { programme: value.trim().toUpperCase() === "OAU" || value.toLowerCase().includes("obafemi awolowo") ? "PharmD" : "Pharmacy" }
        : {}),
    }));
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (
      !form.full_name.trim() ||
      !form.university ||
      !form.programme ||
      !form.level ||
      !/^\d{4}\/\d{4}$/.test(form.academic_session) ||
      !form.semester
    ) {
      setError("Complete all fields. Use the academic session format shown.");
      return;
    }

    setSaving(true);

    try {
      const { error: saveError } = await updateProfile({
        ...form,
        part: form.level,
      });

      if (saveError) throw saveError;
    } catch (saveError) {
      setError(saveError?.message || "Unable to save your academic profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <form className={styles.panel} onSubmit={submit}>
        <div className={styles.brand}>RxCT</div>

        <p className={styles.eyebrow}>YOUR ACADEMIC PROFILE</p>
        <h1>Set up your study space</h1>
        <p className={styles.intro}>
          Tell us where you study so RxCT can organise the right academic
          materials for you.
        </p>

        <label className={styles.field}>
          <span>Preferred name</span>
          <input
            autoComplete="name"
            maxLength={80}
            value={form.full_name}
            onChange={(event) => change("full_name", event.target.value)}
            placeholder="Your name"
            required
          />
        </label>

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

        {error && <p className={styles.error} role="alert">{error}</p>}

        <button className={styles.submit} type="submit" disabled={saving}>
          {saving ? "Saving profile…" : "Continue to RxCT"}
        </button>

        <button className={styles.signOut} type="button" onClick={signOut}>
          Sign out
        </button>
      </form>
    </main>
  );
}
