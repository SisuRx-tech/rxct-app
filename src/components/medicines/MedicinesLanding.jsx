import { useState } from "react";
import { Link } from "react-router-dom";

import {
  getRecentActivity,
  getResumePoint,
} from "../../services/activity";

import { formatClassName } from "../../utils/labelText";

import MedicineTools from "./MedicineTools";

import styles from "./MedicinesLanding.module.css";

/* ========================================
   HELPERS
======================================== */

const focusGlobalSearch = () => {
  const input =
    document.querySelector("[data-global-search]") ||
    document.querySelector('header input[type="search"]');

  if (!input) return;

  input.focus();
  input.select?.();
};

const formatActivityTime = (value) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);

  if (minutes < 0 || minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}min ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);

  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
};

/* ========================================
   LANDING PAGE
======================================== */

function MedicinesLanding({
  onOpenClass,
  onOpenGroup,
  onOpenMedicine,
  onResume,
}) {
  const [recent] = useState(() => getRecentActivity(5));
  const [resume] = useState(getResumePoint);

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

  const getActivityLabel = (type) => {
    const labels = {
      medicine: "Viewed medicine",
      class: "Explored drug class",
      group: "Explored therapeutic group",
    };

    return labels[type] || "Viewed medicine";
  };

  /* ========================================
     RENDER
  ======================================== */

  return (
    <main className={styles.landing}>

      {/* ====================================
          PAGE HEADER
      ==================================== */}

      <header className={styles.header}>
        <h1>RxCT medicines</h1>
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
          MEDICINE INTERACTION CHECKER
      ==================================== */}

      <MedicineTools />

      {/* ====================================
          RECENT ACTIVITY / HISTORY
      ==================================== */}

      {recent.length > 0 && (
        <section className={styles.recentSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>
                YOUR ACTIVITY
              </span>

              <h2>Recent activity</h2>
            </div>

            <Link to="/history" className={styles.textLink}>
              View history
              <i className="fa-solid fa-arrow-up-right-from-square" />
            </Link>
          </div>

          <ul className={styles.recentList}>
            {recent.slice(0, 3).map((item) => (
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
                    <i className="fa-solid fa-clock" />
                  </span>

                  <span className={styles.recentCopy}>
                    <strong>
                      {getActivityLabel(item.type)}
                    </strong>

                    <small>
                      {item.type === "class"
                        ? formatClassName(item.name)
                        : item.name}
                    </small>
                  </span>

                  <span className={styles.recentDate}>
                    {formatActivityTime(item.visitedAt)}
                  </span>

                  <i
                    className={`fa-solid fa-chevron-right ${styles.recentArrow}`}
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ====================================
          MORE FEATURES
      ==================================== */}

      <section className={styles.comingSoon}>
        <span className={styles.eyebrow}>
          WHAT'S NEXT
        </span>

        <h2>More features coming soon.</h2>
      </section>

    </main>
  );
}

export default MedicinesLanding;