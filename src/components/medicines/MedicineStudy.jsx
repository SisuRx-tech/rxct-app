import { useEffect, useMemo, useRef, useState } from "react";

import { searchInteractions } from "../../services/medicines";
import {
  SECTION_ORDER,
  SECTION_LABELS,
  parseSectionBody,
  keyPoints,
  formatClassName,
} from "../../utils/labelText";

import styles from "./MedicineStudy.module.css";

const VISIBLE_BULLETS = 8;
const VISIBLE_MENTIONS = 8;

const REVIEW_LABELS = {
  imported: "Imported text, not yet reviewed by RxCT",
  reviewed: "Reviewed by RxCT",
};

function MedicineStudy({
  medicine,
  initialSection,
  notice,
  matchedNote,
  onOpenClass,
  onOpenMedicine,
}) {
  const panelRef = useRef(null);
  const mentionsRequestedFor = useRef(null);

  /* ========================================
     SECTION DATA
  ======================================== */

  // A medicine can have the same section from more than one source.
  // Prefer a reviewed row, otherwise take the first.
  const records = useMemo(() => {
    const bySection = {};

    for (const record of medicine.medicine_sections || []) {
      const existing = bySection[record.section];

      const better =
        !existing ||
        (record.review_status === "reviewed" &&
          existing.review_status !== "reviewed");

      if (better) bySection[record.section] = record;
    }

    return bySection;
  }, [medicine]);

  const parsed = useMemo(() => {
    const result = {};

    for (const [key, record] of Object.entries(records)) {
      result[key] = parseSectionBody(record.body);
    }

    return result;
  }, [records]);

  const availableTabs = useMemo(
    () =>
      SECTION_ORDER.filter((key) => parsed[key]?.blocks.length > 0),
    [parsed],
  );

  const [activeTab, setActiveTab] = useState(() =>
    availableTabs.includes(initialSection)
      ? initialSection
      : availableTabs[0] || "",
  );

  const [railOpen, setRailOpen] = useState(true);
  const [expandedBlocks, setExpandedBlocks] = useState({});
  const [mentionsExpanded, setMentionsExpanded] = useState(false);

  const [mentions, setMentions] = useState({
    status: "idle",
    rows: [],
  });

  /* ========================================
     AT A GLANCE
  ======================================== */

  const contraindicationPoints = useMemo(
    () =>
      keyPoints(
        (parsed.contraindications?.blocks || []).flatMap(
          (block) => block.bullets,
        ),
      ),
    [parsed],
  );

  const interactionPoints = useMemo(
    () =>
      keyPoints(
        (parsed.interactions?.blocks || []).flatMap(
          (block) => block.bullets,
        ),
      ),
    [parsed],
  );

  /* ========================================
     "MENTIONED IN OTHER LABELS"
     Loaded the first time the Interactions
     tab is opened for this medicine.
  ======================================== */

  useEffect(() => {
    if (activeTab !== "interactions") return;
    if (mentionsRequestedFor.current === medicine.name) return;

    const name = medicine.name;

    mentionsRequestedFor.current = name;
    setMentions({ status: "loading", rows: [] });

    searchInteractions(name)
      .then((rows) => {
        if (mentionsRequestedFor.current === name) {
          setMentions({ status: "ready", rows: rows || [] });
        }
      })
      .catch(() => {
        if (mentionsRequestedFor.current === name) {
          setMentions({ status: "error", rows: [] });
        }
      });
  }, [activeTab, medicine.name]);

  /* ========================================
     ACTIONS
  ======================================== */

  const selectTab = (key) => {
    setActiveTab(key);

    panelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const toggleBlock = (key) => {
    setExpandedBlocks((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  };

  /* ========================================
     NO STUDY CONTENT
  ======================================== */

  if (availableTabs.length === 0) {
    return (
      <div className={styles.empty}>
        <h3>Study material unavailable</h3>
        <p>
          There is currently no recorded study content for this
          medicine.
        </p>
      </div>
    );
  }

  const record = records[activeTab];
  const current = parsed[activeTab];

  /* ========================================
     RENDER HELPERS
  ======================================== */

  const renderBlock = (block, index) => {
    const key = `${activeTab}:${index}`;
    const expanded = Boolean(expandedBlocks[key]);
    const collapsible = block.bullets.length > VISIBLE_BULLETS + 2;

    const visible =
      collapsible && !expanded
        ? block.bullets.slice(0, VISIBLE_BULLETS)
        : block.bullets;

    return (
      <section className={styles.block} key={key}>
        {block.title && <h3 className={styles.blockTitle}>{block.title}</h3>}

        <ul
          className={
            activeTab === "contraindications"
              ? `${styles.bulletList} ${styles.dangerList}`
              : styles.bulletList
          }
        >
          {visible.map((bullet, bulletIndex) => (
            <li key={bulletIndex}>{bullet}</li>
          ))}
        </ul>

        {collapsible && (
          <button
            type="button"
            className={styles.showMore}
            onClick={() => toggleBlock(key)}
          >
            {expanded
              ? "Show less"
              : `Show ${block.bullets.length - VISIBLE_BULLETS} more`}
          </button>
        )}
      </section>
    );
  };

  const renderMentions = () => {
    const rows = mentionsExpanded
      ? mentions.rows
      : mentions.rows.slice(0, VISIBLE_MENTIONS);

    return (
      <section className={styles.mentions}>
        <div className={styles.mentionsHeader}>
          <div>
            <h3>Mentioned in other labels</h3>
            <p>
              Medicines whose interaction text mentions{" "}
              {medicine.name}. This is a text match, not a verified
              interaction check.
            </p>
          </div>

          {mentions.status === "ready" && (
            <span className={styles.count}>{mentions.rows.length}</span>
          )}
        </div>

        {mentions.status === "loading" && (
          <p className={styles.muted}>Checking other labels...</p>
        )}

        {mentions.status === "error" && (
          <p className={styles.muted}>
            Couldn't check other labels right now.
          </p>
        )}

        {mentions.status === "ready" && mentions.rows.length === 0 && (
          <p className={styles.muted}>
            No other labels in RxCT mention {medicine.name}.
          </p>
        )}

        {rows.length > 0 && (
          <ul className={styles.mentionList}>
            {rows.map((row) => (
              <li key={row.medicine_id}>
                <button
                  type="button"
                  className={styles.mentionItem}
                  onClick={() => onOpenMedicine(row.medicine_name)}
                >
                  <span>
                    <strong>{row.medicine_name}</strong>
                    <small>
                      {formatClassName(row.drug_class) || "Medicine"}
                    </small>
                  </span>

                  <span>→</span>
                </button>

                <p className={styles.snippet}>{row.snippet}</p>
              </li>
            ))}
          </ul>
        )}

        {mentions.rows.length > VISIBLE_MENTIONS && (
          <button
            type="button"
            className={styles.showMore}
            onClick={() => setMentionsExpanded((open) => !open)}
          >
            {mentionsExpanded
              ? "Show fewer"
              : `Show all ${mentions.rows.length}`}
          </button>
        )}
      </section>
    );
  };

  /* ========================================
     RENDER
  ======================================== */

  return (
    <div className={styles.study}>
      {(notice || matchedNote) && (
        <div className={styles.notices}>
          {notice && (
            <div className={styles.dosageNotice} role="note">
              <strong>Dosing not included</strong>
              {notice}
            </div>
          )}

          {matchedNote && (
            <div className={styles.infoNotice}>{matchedNote}</div>
          )}
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.main}>
          <div
            className={styles.tabs}
            role="tablist"
            aria-label="Medicine sections"
          >
            {availableTabs.map((key) => (
              <button
                type="button"
                role="tab"
                key={key}
                id={`study-tab-${key}`}
                aria-selected={activeTab === key}
                aria-controls="study-panel"
                className={
                  activeTab === key
                    ? `${styles.tab} ${styles.tabActive}`
                    : styles.tab
                }
                onClick={() => selectTab(key)}
              >
                {SECTION_LABELS[key]}
              </button>
            ))}
          </div>

          <article
            className={styles.panel}
            id="study-panel"
            role="tabpanel"
            aria-labelledby={`study-tab-${activeTab}`}
            ref={panelRef}
          >
            <header className={styles.panelHeader}>
              <span className={styles.eyebrow}>STUDY MATERIAL</span>
              <h2>{SECTION_LABELS[activeTab]}</h2>
            </header>

            {current.blocks.map(renderBlock)}

            {activeTab === "interactions" && renderMentions()}

            <footer className={styles.provenance}>
              <div>
                <strong>Source</strong>
                <span>{record.sources?.name || "Source not recorded"}</span>
              </div>

              {current.source && (
                <div>
                  <strong>Label</strong>
                  <span>
                    {current.source.title}, effective{" "}
                    {current.source.effective}
                  </span>

                  {current.source.url && (
                    <a
                      href={current.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View source label ↗
                    </a>
                  )}
                </div>
              )}

              <div>
                <strong>Review status</strong>
                <span>
                  {REVIEW_LABELS[record.review_status] ||
                    "Not specified"}
                </span>
              </div>

              <p className={styles.provenanceNote}>
                {current.truncated &&
                  "This section was shortened on import. "}
                Wording is cleaned and split into points for
                readability. Open the source label for the exact text.
              </p>
            </footer>
          </article>
        </div>

        <aside
          className={
            railOpen ? styles.rail : `${styles.rail} ${styles.railClosed}`
          }
        >
          <button
            type="button"
            className={styles.railHeader}
            aria-expanded={railOpen}
            onClick={() => setRailOpen((open) => !open)}
          >
            <span>At a Glance</span>
            <span className={styles.railToggle}>
              {railOpen ? "−" : "+"}
            </span>
          </button>

          <div className={styles.railBody}>
            {contraindicationPoints.length > 0 && (
              <section className={styles.railDanger}>
                <h3>Key contraindications</h3>

                <ul>
                  {contraindicationPoints.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => selectTab("contraindications")}
                >
                  All contraindications →
                </button>
              </section>
            )}

            {interactionPoints.length > 0 && (
              <section className={styles.railInfo}>
                <h3>Key interactions</h3>

                <ul>
                  {interactionPoints.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => selectTab("interactions")}
                >
                  All interactions →
                </button>
              </section>
            )}

            {medicine.drug_class && (
              <section className={styles.railClass}>
                <h3>Drug class</h3>

                <button
                  type="button"
                  className={styles.classChip}
                  onClick={() => onOpenClass(medicine.drug_class)}
                >
                  {formatClassName(medicine.drug_class)} →
                </button>
              </section>
            )}

            <p className={styles.railNote}>
              Study summary only. Check the source label before any
              clinical decision.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default MedicineStudy;
