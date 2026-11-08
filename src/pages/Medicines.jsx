import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  getTherapeuticGroups,
  getDrugClasses,
  getMedicineByName,
  getMedicinesByClass,
  smartSearch,
} from "../services/medicines";

import MedicineStudy from "../components/medicines/MedicineStudy";
import SearchResultsList from "../components/medicines/SearchResultsList";
import { formatClassName } from "../utils/labelText";

import styles from "./Medicines.module.css";

const CACHE_KEY = "rxct-medicines-workspace-v1";
const HISTORY_KEY = "rxct-medicine-history";
const PROGRESS_KEY = "rxct-study-progress";

// A single medicine scoring at or above this opens straight away.
const DIRECT_MATCH_SCORE = 0.95;

const readStorage = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable or full.
  }
};

const normalise = (value = "") =>
  String(value).trim().toLowerCase();

const unique = (items) =>
  [...new Set(items.filter(Boolean))];

const formatDate = (value) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
};

// One clear winner opens its profile. Anything less clear shows a list.
const pickDirectMatch = (found) => {
  if (found.kind !== "medicines" || found.didYouMean) return null;

  const [top, second] = found.medicines;

  if (!top || top.score < DIRECT_MATCH_SCORE) return null;
  if (second && second.score >= DIRECT_MATCH_SCORE) return null;

  return top;
};

function Medicines() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("q") || "";
  const requestedKind = searchParams.get("kind") || "";

  const [groups, setGroups] = useState([]);
  const [drugClasses, setDrugClasses] = useState([]);

  const [history, setHistory] = useState(() =>
    readStorage(HISTORY_KEY, [])
  );

  const [progress, setProgress] = useState(() =>
    readStorage(PROGRESS_KEY, null)
  );

  const [profile, setProfile] = useState(null);
  const [search, setSearch] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dataStatus, setDataStatus] = useState("loading");

  /* ========================================
     INITIAL WORKSPACE DATA
  ======================================== */

  useEffect(() => {
    let active = true;

    const loadWorkspace = async () => {
      const cached = readStorage(CACHE_KEY, {
        groups: [],
        drugClasses: [],
      });

      if (cached.groups?.length) {
        setGroups(cached.groups);
      }

      if (cached.drugClasses?.length) {
        setDrugClasses(cached.drugClasses);
      }

      if (!navigator.onLine) {
        setDataStatus("offline");
        return;
      }

      try {
        const [groupData, classData] = await Promise.all([
          getTherapeuticGroups(),
          getDrugClasses(),
        ]);

        if (!active) return;

        const nextGroups = groupData || [];
        const nextClasses = classData || [];

        setGroups(nextGroups);
        setDrugClasses(nextClasses);
        setDataStatus("ready");

        writeStorage(CACHE_KEY, {
          groups: nextGroups,
          drugClasses: nextClasses,
        });
      } catch {
        if (active) {
          setDataStatus("offline");
        }
      }
    };

    loadWorkspace();

    return () => {
      active = false;
    };
  }, []);

  /* ========================================
     HISTORY AND PROGRESS
  ======================================== */

  useEffect(() => {
    const syncStorage = () => {
      setHistory(readStorage(HISTORY_KEY, []));
      setProgress(readStorage(PROGRESS_KEY, null));
    };

    window.addEventListener("storage", syncStorage);

    return () => {
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  const saveHistory = useCallback((item) => {
    const current = readStorage(HISTORY_KEY, []);

    const next = [
      {
        ...item,
        visitedAt: new Date().toISOString(),
      },
      ...current.filter(
        (entry) =>
          !(
            entry.type === item.type &&
            normalise(entry.name) === normalise(item.name)
          )
      ),
    ].slice(0, 30);

    writeStorage(HISTORY_KEY, next);
    setHistory(next);
  }, []);

  /* ========================================
     NAVIGATION
  ======================================== */

  const openMedicine = useCallback(
    (name) => {
      setSearchParams({
        kind: "medicine",
        q: name,
      });
    },
    [setSearchParams]
  );

  const openClass = useCallback(
    (name) => {
      setSearchParams({
        kind: "class",
        q: name,
      });
    },
    [setSearchParams]
  );

  const openGroup = useCallback(
    (name) => {
      setSearchParams({
        kind: "group",
        q: name,
      });
    },
    [setSearchParams]
  );

  const runSearch = useCallback(
    (text) => {
      setSearchParams({ q: text });
    },
    [setSearchParams]
  );

  const returnHome = useCallback(() => {
    setProfile(null);
    setSearch(null);
    setError("");
    setSearchParams({});
  }, [setSearchParams]);

  /* ========================================
     PROFILE RESOLUTION
  ======================================== */

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      if (!query.trim()) {
        setProfile(null);
        setSearch(null);
        setError("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      setProfile(null);
      setSearch(null);

      try {
        let resolved = null;

        if (requestedKind === "medicine") {
          const medicine = await getMedicineByName(query);

          if (medicine) {
            resolved = {
              type: "medicine",
              data: medicine,
            };
          }
        }

        if (requestedKind === "class") {
          const medicines = await getMedicinesByClass(query);

          resolved = {
            type: "class",
            name: query,
            medicines: medicines || [],
          };
        }

        if (requestedKind === "group") {
          const group = groups.find(
            (item) =>
              normalise(item.name) === normalise(query)
          );

          if (group) {
            resolved = {
              type: "group",
              data: group,
            };
          }
        }

        /*
          Global Topbar searches may not include a profile type.
          Resolve exact medicine, class or group matches first.
        */

        if (!resolved && !requestedKind) {
          try {
            const medicine = await getMedicineByName(query);

            if (medicine) {
              resolved = {
                type: "medicine",
                data: medicine,
              };
            }
          } catch {
            // Continue resolving other entity types.
          }

          if (!resolved) {
            const matchingClass = drugClasses.find(
              (item) => normalise(item) === normalise(query)
            );

            if (matchingClass) {
              const medicines = await getMedicinesByClass(
                matchingClass
              );

              resolved = {
                type: "class",
                name: matchingClass,
                medicines: medicines || [],
              };
            }
          }

          if (!resolved) {
            const matchingGroup = groups.find(
              (item) =>
                normalise(item.name) === normalise(query)
            );

            if (matchingGroup) {
              resolved = {
                type: "group",
                data: matchingGroup,
              };
            }
          }
        }

        /*
          No exact entity: run the smart search. It understands
          intent ("warfarin interactions"), everyday words
          ("painkillers"), plurals and misspellings. One clear
          medicine opens directly, anything else shows a list.
        */

        if (!resolved) {
          const found = await smartSearch(query);

          if (!active) return;

          const direct = pickDirectMatch(found);

          if (direct) {
            const medicine = await getMedicineByName(direct.name);

            if (!active) return;

            const viaOtherName =
              direct.matched_term &&
              normalise(direct.matched_term) !==
                normalise(direct.name);

            resolved = {
              type: "medicine",
              data: medicine,
              openSection: found.openSection,
              notice: found.notice,
              matchedNote: viaOtherName
                ? `Showing ${direct.name}, matched from "${direct.matched_term}".`
                : null,
            };
          } else {
            setSearch(found);
          }
        }

        if (!active) return;

        if (resolved) {
          setProfile(resolved);

          saveHistory({
            type: resolved.type,
            name:
              resolved.type === "medicine"
                ? resolved.data.name
                : resolved.type === "group"
                  ? resolved.data.name
                  : resolved.name,
          });
        }
      } catch (err) {
        if (active) {
          setError(
            err?.message ||
              "Unable to load this study profile."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [
    query,
    requestedKind,
    groups,
    drugClasses,
    saveHistory,
  ]);

  /* ========================================
     LANDING PAGE CONTENT
  ======================================== */

  const featuredClasses = useMemo(() => {
    const recentClasses = history
      .filter((item) => item.type === "class")
      .map((item) => item.name);

    return unique([
      ...recentClasses,
      ...drugClasses,
    ]).slice(0, 5);
  }, [history, drugClasses]);

  const recentItems = history.slice(0, 5);

  const resumeStudy = () => {
    if (!progress?.destination) return;

    setSearchParams(progress.destination);
  };

  /* ========================================
     PROFILE HELPERS
  ======================================== */

  const groupClasses = (group) =>
    unique(
      (group?.drug_class_group_members || []).map(
        (member) => member.drug_class
      )
    );

  const renderHistoryItem = (item) => {
    const handleClick = () => {
      if (item.type === "class") {
        openClass(item.name);
      } else if (item.type === "group") {
        openGroup(item.name);
      } else {
        openMedicine(item.name);
      }
    };

    return (
      <button
        type="button"
        className={styles.historyItem}
        key={`${item.type}-${item.name}`}
        onClick={handleClick}
      >
        <span className={styles.historyIcon}>
          {item.type === "class"
            ? "C"
            : item.type === "group"
              ? "G"
              : "M"}
        </span>

        <span className={styles.historyDetails}>
          <strong>
            {item.type === "class"
              ? formatClassName(item.name)
              : item.name}
          </strong>
          <small>
            {item.type === "class"
              ? "Drug class"
              : item.type === "group"
                ? "Therapeutic group"
                : "Medicine"}
          </small>
        </span>

        <span className={styles.historyDate}>
          {formatDate(item.visitedAt)}
        </span>
      </button>
    );
  };

  /* ========================================
     MEDICINE PROFILE
  ======================================== */

  const renderMedicineProfile = () => {
    const medicine = profile.data;

    return (
      <div className={styles.profile}>
        <button
          type="button"
          className={styles.backButton}
          onClick={returnHome}
        >
          ← Medicines
        </button>

        <header className={styles.profileHeader}>
          <div>
            <span className={styles.eyebrow}>
              MEDICINE PROFILE
            </span>

            <h1>{medicine.name}</h1>

            <p>
              {formatClassName(medicine.drug_class) ||
                "Drug class not specified"}
            </p>
          </div>

          <span className={styles.profileBadge}>
            Study profile
          </span>
        </header>

        <MedicineStudy
          key={medicine.name}
          medicine={medicine}
          initialSection={profile.openSection}
          notice={profile.notice}
          matchedNote={profile.matchedNote}
          onOpenClass={openClass}
          onOpenMedicine={openMedicine}
        />
      </div>
    );
  };

  /* ========================================
     DRUG CLASS PROFILE
  ======================================== */

  const renderClassProfile = () => {
    const className = formatClassName(profile.name);

    return (
      <div className={styles.profile}>
        <button
          type="button"
          className={styles.backButton}
          onClick={returnHome}
        >
          ← Medicines
        </button>

        <header className={styles.profileHeader}>
          <div>
            <span className={styles.eyebrow}>
              DRUG CLASS
            </span>

            <h1>{className}</h1>

            <p>
              Medicines associated with this drug class.
            </p>
          </div>

          <span className={styles.profileBadge}>
            Class profile
          </span>
        </header>

        <section className={styles.profileSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>
                RELATED MEDICINES
              </span>
              <h2>Medicines in this class</h2>
            </div>

            <span className={styles.count}>
              {profile.medicines.length}
            </span>
          </div>

          {profile.medicines.length ? (
            <div className={styles.medicineList}>
              {profile.medicines.map((medicine) => (
                <button
                  type="button"
                  className={styles.medicineItem}
                  key={medicine.id || medicine.name}
                  onClick={() => openMedicine(medicine.name)}
                >
                  <span>
                    <strong>{medicine.name}</strong>
                    <small>
                      {formatClassName(medicine.drug_class)}
                    </small>
                  </span>

                  <span>→</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.emptyContent}>
              <p>
                No medicines are currently linked to this
                class.
              </p>
            </div>
          )}
        </section>

        <div className={styles.notice}>
          This profile currently organises medicines by their
          recorded drug class. Independent class study content
          has not yet been added.
        </div>
      </div>
    );
  };

  /* ========================================
     THERAPEUTIC GROUP PROFILE
  ======================================== */

  const renderGroupProfile = () => {
    const group = profile.data;
    const members = groupClasses(group);

    return (
      <div className={styles.profile}>
        <button
          type="button"
          className={styles.backButton}
          onClick={returnHome}
        >
          ← Medicines
        </button>

        <header className={styles.profileHeader}>
          <div>
            <span className={styles.eyebrow}>
              THERAPEUTIC GROUP
            </span>

            <h1>{group.name}</h1>

            <p>
              {group.description ||
                "A group of related drug classes."}
            </p>
          </div>

          <span className={styles.profileBadge}>
            Group profile
          </span>
        </header>

        <section className={styles.profileSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>
                GROUP MEMBERS
              </span>
              <h2>Drug classes</h2>
            </div>

            <span className={styles.count}>
              {members.length}
            </span>
          </div>

          {members.length ? (
            <div className={styles.classList}>
              {members.map((name) => (
                <button
                  type="button"
                  className={styles.classItem}
                  key={name}
                  onClick={() => openClass(name)}
                >
                  <span>{formatClassName(name)}</span>
                  <span>→</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.emptyContent}>
              <p>No drug classes are linked to this group.</p>
            </div>
          )}
        </section>

        <div className={styles.notice}>
          This group is currently organised using its linked
          drug classes. Independent therapeutic-group study
          content has not yet been added.
        </div>
      </div>
    );
  };

  /* ========================================
     SEARCH RESULTS
  ======================================== */

  const renderSearchResults = () => (
    <section className={styles.searchResults}>
      <button
        type="button"
        className={styles.backButton}
        onClick={returnHome}
      >
        ← Medicines
      </button>

      <span className={styles.eyebrow}>
        SEARCH RESULTS
      </span>

      <h1>{query}</h1>

      <SearchResultsList
        search={search}
        onOpenMedicine={openMedicine}
        onOpenClass={openClass}
        onOpenGroup={openGroup}
        onSearch={runSearch}
      />
    </section>
  );

  /* ========================================
     MAIN RENDER
  ======================================== */

  if (loading) {
    return (
      <main className={styles.workspace}>
        <div className={styles.loading}>
          <span className={styles.loader}></span>
          <p>Opening study profile...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.workspace}>
        <div className={styles.error}>
          <h2>Something went wrong</h2>
          <p>{error}</p>

          <button type="button" onClick={returnHome}>
            Return to Medicines
          </button>
        </div>
      </main>
    );
  }

  if (profile?.type === "medicine") {
    return (
      <main className={styles.workspace}>
        {renderMedicineProfile()}
      </main>
    );
  }

  if (profile?.type === "class") {
    return (
      <main className={styles.workspace}>
        {renderClassProfile()}
      </main>
    );
  }

  if (profile?.type === "group") {
    return (
      <main className={styles.workspace}>
        {renderGroupProfile()}
      </main>
    );
  }

  if (query && search) {
    return (
      <main className={styles.workspace}>
        {renderSearchResults()}
      </main>
    );
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            YOUR PHARMACY STUDY SPACE
          </span>

          <h1>Medicines</h1>

          <p>
            Explore medicines, understand their classes and
            connect related knowledge.
          </p>
        </div>

        <span
          className={
            dataStatus === "ready"
              ? styles.statusReady
              : styles.status
          }
        >
          {dataStatus === "ready"
            ? "Up to date"
            : dataStatus === "offline"
              ? "Offline"
              : "Loading"}
        </span>
      </header>

      {progress?.destination && (
        <section className={styles.resumeCard}>
          <div>
            <span className={styles.eyebrow}>
              PICK UP WHERE YOU LEFT OFF
            </span>

            <h2>
              {progress.title || progress.name || "Continue studying"}
            </h2>

            <p>
              {progress.section || "Resume your previous session"}
            </p>
          </div>

          <button type="button" onClick={resumeStudy}>
            Resume →
          </button>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>
              UNDERSTAND MEDICINES
            </span>
            <h2>Drug classes</h2>
            <p>
              Explore medicines through their pharmacological
              relationships.
            </p>
          </div>
        </div>

        {featuredClasses.length ? (
          <div className={styles.classList}>
            {featuredClasses.map((name) => (
              <button
                type="button"
                className={styles.classItem}
                key={name}
                onClick={() => openClass(name)}
              >
                <span>{formatClassName(name)}</span>
                <span>→</span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.emptyContent}>
            <p>Drug classes will appear here when available.</p>
          </div>
        )}
      </section>

      {groups.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>
                CONNECTED KNOWLEDGE
              </span>
              <h2>Therapeutic groups</h2>
            </div>
          </div>

          <div className={styles.groupList}>
            {groups.map((group) => (
              <button
                type="button"
                className={styles.groupItem}
                key={group.id}
                onClick={() => openGroup(group.name)}
              >
                <span>
                  <strong>{group.name}</strong>
                  <small>
                    {group.drug_class_group_members?.length || 0}{" "}
                    drug classes
                  </small>
                </span>

                <span>→</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>
              YOUR LEARNING ACTIVITY
            </span>
            <h2>Recently explored</h2>
          </div>

          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              window.location.href = "/history";
            }}
          >
            View history →
          </button>
        </div>

        {recentItems.length ? (
          <div className={styles.historyList}>
            {recentItems.map(renderHistoryItem)}
          </div>
        ) : (
          <div className={styles.emptyContent}>
            <h3>Your study activity starts here</h3>
            <p>
              Medicines, classes and therapeutic groups you
              explore will appear here.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

export default Medicines;
