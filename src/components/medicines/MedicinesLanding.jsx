import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  getLandingData,
  pickFeaturedClasses,
} from "../../services/landing";

import {
  getRecentActivity,
  getResumePoint,
} from "../../services/activity";

import { formatClassName } from "../../utils/labelText";

import styles from "./MedicinesLanding.module.css";

const CACHE_KEY = "rxct-landing-v1"; // gitleaks:allow

const TYPE_LABELS = {
  medicine: "Medicine",
  class: "Drug class",
  group: "Therapeutic group",
};

const TYPE_ICONS = {
  medicine: "fa-capsules",
  class: "fa-layer-group",
  group: "fa-sitemap",
};

const readCache = () => {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const writeCache = (value) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Storage may be unavailable or full.
  }
};

// RxCT uses one global search through the Topbar.
const focusGlobalSearch = () => {
  const input =
    document.querySelector("[data-global-search]") ||
    document.querySelector('header input[type="search"]');

  if (!input) return;

  input.focus();
  input.select?.();
};

const formatDate = (value) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
};

function MedicinesLanding({
  onOpenClass,
  onOpenGroup,
  onOpenMedicine,
  onResume,
}) {
  const [data, setData] = useState(readCache);
  const [failed, setFailed] = useState(false);

  // Device activity is read once per visit.
  const [recent] = useState(() => getRecentActivity(5));
  const [resume] = useState(getResumePoint);

  /* ========================================
     DATA
  ======================================== */

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!navigator.onLine) return;

      try {
        const fresh = await getLandingData();

        if (!active) return;

        setData(fresh);
        setFailed(false);
        writeCache(fresh);
      } catch {
        if (active) setFailed(true);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  const featured = useMemo(
    () =>
      data
        ? pickFeaturedClasses(data.classes || [], recent)
        : [],
    [data, recent],
  );

  const groups = data?.groups || [];


  /* ========================================
     ACTIONS
  ======================================== */

  const openRecent = (item) => {
    if (item.type === "class") {
      onOpenClass(item.name);
    } else if (item.type === "group") {
      onOpenGroup(item.name);
    } else {
      onOpenMedicine(item.name);
    }
  };

  const getRecentIcon = (type) =>
    TYPE_ICONS[type] || TYPE_ICONS.medicine;

  /* ========================================
     RENDER
  ======================================== */

  return (
    <main className={styles.landing}>

      {/* ====================================
          EDITORIAL HEADER
      ==================================== */}

      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.kicker}>
            RXCT / STUDY WORKSPACE
          </span>

          <h1>
            Your study <span>space.</span>
          </h1>

          <p>
            Explore medicines, understand therapeutic
            relationships and pick up your learning
            where you left off.
          </p>
        </div>

        <div className={styles.headerMark} aria-hidden="true">
          <i className="fa-solid fa-book-medical" />
        </div>
      </header>

      {/* ====================================
          CONTINUE LEARNING
      ==================================== */}

      {resume ? (
        <section className={styles.continueSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>
                YOUR LEARNING TRAIL
              </span>

              <h2>Continue learning</h2>
            </div>

            <span className={styles.sectionIndex}>
              01
            </span>
          </div>

          <div className={styles.resume}>
            <div className={styles.resumeTopline}>
              <span className={styles.resumeType}>
                <i className="fa-solid fa-book-open" />
                LAST OPENED
              </span>

              <span className={styles.resumeStatus}>
                Your previous study position
              </span>
            </div>

            <div className={styles.resumeMain}>
              <div className={styles.resumeCopy}>
                <h3>
                  {resume.title || "Continue studying"}
                </h3>

                {resume.section && (
                  <p className={styles.resumeSection}>
                    <span>LAST SECTION</span>
                    {resume.section}
                  </p>
                )}
              </div>

              <button
                type="button"
                className={styles.resumeButton}
                onClick={() => onResume(resume.destination)}
              >
                Continue
                <i className="fa-solid fa-arrow-right" />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className={styles.startSection}>
          <div className={styles.startCopy}>
            <span className={styles.eyebrow}>
              A PLACE TO BEGIN
            </span>

            <h2>Build your study trail.</h2>

            <p>
              Find a medicine, explore its pharmacology
              or start with a therapeutic class.
              Your learning history will help you
              pick up where you left off.
            </p>
          </div>

          <button
            type="button"
            className={styles.startButton}
            onClick={focusGlobalSearch}
          >
            <i className="fa-solid fa-magnifying-glass" />
            Explore medicines
          </button>
        </section>
      )}

      {/* ====================================
          RECENTLY STUDIED
      ==================================== */}

      {recent.length > 0 && (
        <section className={styles.recentSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>
                YOUR ACTIVITY
              </span>

              <h2>Recently explored</h2>
            </div>

            <Link to="/history" className={styles.textLink}>
              View history
              <i className="fa-solid fa-arrow-up-right-from-square" />
            </Link>
          </div>

          <ul className={styles.recentList}>
            {recent.map((item) => (
              <li key={`${item.type}-${item.name}`}>
                <button
                  type="button"
                  className={styles.recentItem}
                  onClick={() => openRecent(item)}
                >
                  <span
                    className={`${styles.recentIcon} ${
                      styles[item.type] || ""
                    }`}
                    aria-hidden="true"
                  >
                    <i
                      className={`fa-solid ${getRecentIcon(
                        item.type,
                      )}`}
                    />
                  </span>

                  <span className={styles.recentCopy}>
                    <strong>
                      {item.type === "class"
                        ? formatClassName(item.name)
                        : item.name}
                    </strong>

                    <small>
                      {TYPE_LABELS[item.type] || "Medicine"}
                    </small>
                  </span>

                  <span className={styles.recentDate}>
                    {formatDate(item.visitedAt)}
                  </span>

                  <i
                    className={`fa-solid fa-arrow-up-right-from-square ${styles.recentArrow}`}
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ====================================
          DISCOVER DRUG CLASSES
      ==================================== */}

      <section className={styles.discoverSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>
              EXPLORE THE KNOWLEDGE
            </span>

            <h2>Drug classes</h2>

            <p className={styles.sectionDescription}>
              Understand medicines through their
              pharmacological and therapeutic families.
            </p>
          </div>

          <span className={styles.sectionIndex}>
            02
          </span>
        </div>

        {featured.length > 0 ? (
          <ul className={styles.discoveryGrid}>
            {featured.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.discoveryCard}
                  onClick={() => onOpenClass(item.name)}
                >
                  <span className={styles.discoveryNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <span
                    className={styles.discoveryIcon}
                    aria-hidden="true"
                  >
                    <i className="fa-solid fa-layer-group" />
                  </span>

                  <span className={styles.discoveryCopy}>
                    <strong>
                      {formatClassName(item.name)}
                    </strong>

                    <small>
                      {item.groupName || "Drug class"}
                      {" · "}
                      {item.medicineCount}{" "}
                      {item.medicineCount === 1
                        ? "medicine"
                        : "medicines"}
                    </small>
                  </span>

                  <i
                    className={`fa-solid fa-arrow-right ${styles.discoveryArrow}`}
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.discoverEmpty}>
            <span className={styles.emptyIcon}>
              <i className="fa-solid fa-layer-group" />
            </span>

            <div>
              <strong>
                {failed
                  ? "Couldn't load drug classes"
                  : "Explore the medicine database"}
              </strong>

              <p>
                {failed
                  ? "Try again when your connection is available. Previously opened profiles may still be accessible."
                  : "Search for a medicine or therapeutic class to begin."}
              </p>
            </div>

            <button
              type="button"
              onClick={focusGlobalSearch}
              aria-label="Search medicines"
            >
              <i className="fa-solid fa-arrow-right" />
            </button>
          </div>
        )}
      </section>

      {/* ====================================
          THERAPEUTIC GROUPS
      ==================================== */}

      {groups.length > 0 && (
        <section className={styles.discoverSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>
                BROADER CLASSIFICATION
              </span>

              <h2>Therapeutic groups</h2>

              <p className={styles.sectionDescription}>
                Explore broader families and the
                drug classes connected to them.
              </p>
            </div>

            <span className={styles.sectionIndex}>
              03
            </span>
          </div>

          <ul className={styles.discoveryGrid}>
            {groups.map((group, index) => (
              <li key={group.id}>
                <button
                  type="button"
                  className={styles.discoveryCard}
                  onClick={() => onOpenGroup(group.name)}
                >
                  <span className={styles.discoveryNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <span
                    className={styles.discoveryIcon}
                    aria-hidden="true"
                  >
                    <i className="fa-solid fa-sitemap" />
                  </span>

                  <span className={styles.discoveryCopy}>
                    <strong>{group.name}</strong>

                    <small>Therapeutic group</small>
                  </span>

                  <i
                    className={`fa-solid fa-arrow-right ${styles.discoveryArrow}`}
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

    </main>
  );
}

export default MedicinesLanding;