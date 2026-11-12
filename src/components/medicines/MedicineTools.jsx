import { useEffect, useState } from "react";

import { searchMedicines } from "../../services/medicines";
import { compareMedicines } from "../../services/comparison";
import Scientific from "../common/Scientific";

import styles from "./MedicineTools.module.css";

/* ========================================
   HELPERS
======================================== */

const createSlot = () => ({
  query: "",
  results: [],
  medicine: null,
  searching: false,
  searchedQuery: "",
});

function getSeverity(item) {
  return (
    item.severity ||
    item.risk_level ||
    item.severity_level ||
    item.interaction_severity ||
    item.clinical_significance ||
    ""
  );
}

function getSeverityClass(severity) {
  const value = String(severity).toLowerCase();

  if (
    value.includes("contraindicated") ||
    value.includes("major") ||
    value.includes("high") ||
    value.includes("severe")
  ) {
    return styles.severityHigh;
  }

  if (
    value.includes("moderate") ||
    value.includes("medium")
  ) {
    return styles.severityModerate;
  }

  if (
    value.includes("minor") ||
    value.includes("low")
  ) {
    return styles.severityLow;
  }

  return styles.severityUnknown;
}

function getMedicinePair(item, selectedMedicines, index) {
  const firstId =
    item.medicine_a_id ||
    item.medicine_1_id ||
    item.first_medicine_id;

  const secondId =
    item.medicine_b_id ||
    item.medicine_2_id ||
    item.second_medicine_id;

  const firstName =
    item.medicine_a_name ||
    item.first_medicine_name ||
    item.medicine_1_name;

  const secondName =
    item.medicine_b_name ||
    item.second_medicine_name ||
    item.medicine_2_name;

  const firstMedicine = selectedMedicines.find(
    (medicine) => medicine.id === firstId,
  );

  const secondMedicine = selectedMedicines.find(
    (medicine) => medicine.id === secondId,
  );

  if (firstName && secondName) {
    return `${firstName} × ${secondName}`;
  }

  if (firstMedicine && secondMedicine) {
    return `${firstMedicine.name} × ${secondMedicine.name}`;
  }

  if (firstMedicine && secondId) {
    return `${firstMedicine.name} × another selected medicine`;
  }

  if (selectedMedicines.length === 2 && index === 0) {
    return `${selectedMedicines[0].name} × ${selectedMedicines[1].name}`;
  }

  return "Medicine combination";
}

/* ========================================
   INTERACTION RESULT
======================================== */

function InteractionEvidence({
  interactions,
  selectedMedicines,
}) {
  if (!interactions.length) {
    return (
      <div className={styles.interactionSummary}>
        <div className={styles.resultStatus}>
          <span className={styles.statusIndicator} />

          <div>
            <strong>No recorded interaction found</strong>
            <span>In the currently available RxCT data</span>
          </div>
        </div>

        <p className={styles.safetyNotice}>
          This does not establish that the selected medicines
          have no interaction. The interaction may not yet be
          represented in the available database.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.interactionSummary}>
      <div className={styles.resultStatus}>
        <span
          className={`${styles.statusIndicator} ${styles.statusFound}`}
        />

        <div>
          <strong>Interaction evidence found</strong>
          <span>
            {interactions.length} recorded finding
            {interactions.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className={styles.interactionFindings}>
        {interactions.map((item, index) => {
          const severity = getSeverity(item);

          const effect =
            item.clinical_effect ||
            item.interaction_effect ||
            item.effect ||
            item.description ||
            item.interaction_description;

          const safety =
            item.safety_concern ||
            item.safety_notes ||
            item.risk_description ||
            item.adverse_effects ||
            item.clinical_risk;

          const mechanism = item.mechanism;

          const source =
            item.source_name ||
            item.source ||
            item.source_reference;

          const pair = getMedicinePair(
            item,
            selectedMedicines,
            index,
          );

          return (
            <article
              className={styles.interactionFinding}
              key={item.id || `${pair}-${index}`}
            >
              <div className={styles.findingHeading}>
                <h4>{pair}</h4>

                {severity && (
                  <span
                    className={`${styles.severityBadge} ${getSeverityClass(
                      severity,
                    )}`}
                  >
                    {String(severity).replaceAll("_", " ")}
                  </span>
                )}
              </div>

              {effect && (
                <div className={styles.findingField}>
                  <span>Clinical effect</span>
                  <p><Scientific text={effect} /></p>
                </div>
              )}

              {safety && (
                <div className={styles.findingField}>
                  <span>Safety</span>
                  <p><Scientific text={safety} /></p>
                </div>
              )}

              {mechanism && (
                <div className={styles.findingField}>
                  <span>Interaction</span>
                  <p><Scientific text={mechanism} /></p>
                </div>
              )}

              {source && (
                <div className={styles.findingSource}>
                  <i className="fa-solid fa-book-open" />
                  <span>{source}</span>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className={styles.safetyNotice}>
        Findings reflect the interaction evidence currently
        available in RxCT. Missing records do not establish
        the absence of an interaction.
      </p>
    </div>
  );
}

/* ========================================
   MEDICINE SEARCH SLOT
======================================== */

function MedicineSlot({
  slot,
  index,
  onQueryChange,
  onSelect,
  onClear,
  canRemove,
}) {
  return (
    <div className={styles.slot}>
      <div className={styles.slotHeading}>
        <span>MEDICINE {index + 1}</span>

        {canRemove && (
          <button
            type="button"
            className={styles.removeSlot}
            onClick={onClear}
            aria-label={`Remove medicine ${index + 1}`}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        )}
      </div>

      {slot.medicine ? (
        <div className={styles.selectedMedicine}>
          <div className={styles.selectedIcon}>
            <i className="fa-solid fa-capsules" />
          </div>

          <div className={styles.selectedCopy}>
            <strong>{slot.medicine.name}</strong>
            <span>
              {slot.medicine.drug_class || "Medicine"}
            </span>
          </div>

          <button
            type="button"
            className={styles.changeMedicine}
            onClick={onClear}
            aria-label={`Change ${slot.medicine.name}`}
          >
            <i className="fa-solid fa-pen" />
          </button>
        </div>
      ) : (
        <>
          <label className={styles.searchControl}>
            <i className="fa-solid fa-magnifying-glass" />

            <input
              type="search"
              value={slot.query}
              onChange={(event) =>
                onQueryChange(event.target.value)
              }
              placeholder="Search medicine..."
              autoComplete="off"
              aria-label={`Search medicine ${index + 1}`}
            />

            {slot.searching && (
              <span className={styles.searchSpinner} />
            )}
          </label>

          {slot.results.length > 0 && (
            <div className={styles.searchResults}>
              {slot.results.map((medicine) => (
                <button
                  type="button"
                  key={medicine.id}
                  className={styles.searchResult}
                  onClick={() => onSelect(medicine)}
                >
                  <span>
                    <strong>{medicine.name}</strong>
                    <small>
                      {medicine.drug_class || "Medicine"}
                    </small>
                  </span>

                  <i className="fa-solid fa-plus" />
                </button>
              ))}
            </div>
          )}

          {!slot.searching &&
            slot.searchedQuery === slot.query.trim() &&
            slot.query.trim().length >= 2 &&
            slot.results.length === 0 && (
              <p className={styles.noResults}>
                No matching medicines found.
              </p>
            )}
        </>
      )}
    </div>
  );
}

/* ========================================
   RESULTS
======================================== */

function InteractionResults({
  comparison,
  onEdit,
  onReset,
}) {
  const selectedMedicines =
    comparison.selectedMedicines || [];

  const interactions =
    comparison.interactions || [];

  return (
    <section className={styles.results}>
      <div className={styles.resultsHeading}>
        <div>
          <span className={styles.eyebrow}>
            INTERACTION CHECK
          </span>

          <h3>Combination safety</h3>

          <p>
            Interaction evidence for the selected medicines.
          </p>
        </div>

        <button
          type="button"
          className={styles.editButton}
          onClick={onEdit}
        >
          <i className="fa-solid fa-pen" />
          Edit
        </button>
      </div>

      <div className={styles.checkedMedicines}>
        {selectedMedicines.map((medicine) => (
          <span key={medicine.id}>
            {medicine.name}
          </span>
        ))}
      </div>

      <InteractionEvidence
        interactions={interactions}
        selectedMedicines={selectedMedicines}
      />

      <button
        type="button"
        className={styles.resetButton}
        onClick={onReset}
      >
        Check another combination
        <i className="fa-solid fa-arrow-right" />
      </button>
    </section>
  );
}

/* ========================================
   MAIN COMPONENT
======================================== */

function MedicineTools() {
  const [slots, setSlots] = useState([
    createSlot(),
    createSlot(),
  ]);

  const [comparison, setComparison] = useState(null);

  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");

  /* ========================================
     AUTOMATIC SEARCH
  ======================================== */

  useEffect(() => {
    const timers = [];

    slots.forEach((slot, index) => {
      const query = slot.query.trim();

      if (
        slot.medicine ||
        slot.searching ||
        query.length < 2 ||
        slot.searchedQuery === query
      ) {
        return;
      }

      const timer = setTimeout(() => {
        setSlots((current) =>
          current.map((item, position) =>
            position === index
              ? {
                  ...item,
                  searching: true,
                  searchedQuery: query,
                }
              : item,
          ),
        );

        searchMedicines(query)
          .then((results) => {
            setSlots((current) =>
              current.map((item, position) => {
                if (
                  position !== index ||
                  item.query.trim() !== query ||
                  item.medicine
                ) {
                  return item;
                }

                return {
                  ...item,
                  searching: false,
                  results: results || [],
                };
              }),
            );
          })
          .catch(() => {
            setSlots((current) =>
              current.map((item, position) =>
                position === index &&
                item.query.trim() === query
                  ? {
                      ...item,
                      searching: false,
                      results: [],
                    }
                  : item,
              ),
            );
          });
      }, 300);

      timers.push(timer);
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [slots]);

  /* ========================================
     SLOT ACTIONS
  ======================================== */

  const updateSlot = (index, updates) => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index
          ? { ...slot, ...updates }
          : slot,
      ),
    );
  };

  const selectMedicine = (index, medicine) => {
    const duplicate = slots.some(
      (slot, position) =>
        position !== index &&
        slot.medicine?.id === medicine.id,
    );

    if (duplicate) {
      setError("Each medicine can only appear once.");
      return;
    }

    setError("");

    updateSlot(index, {
      medicine,
      query: "",
      results: [],
      searching: false,
      searchedQuery: "",
    });
  };

  const clearSlot = (index) => {
    setError("");
    updateSlot(index, createSlot());
  };

  const addSlot = () => {
    if (slots.length >= 4) return;

    setSlots((current) => [
      ...current,
      createSlot(),
    ]);
  };

  const removeSlot = (index) => {
    setSlots((current) =>
      current.filter((_, position) => position !== index),
    );
  };

  /* ========================================
     INTERACTION CHECK
  ======================================== */

  const runComparison = async () => {
    const selected = slots
      .map((slot) => slot.medicine)
      .filter(Boolean);

    if (selected.length < 2) {
      setError(
        "Select at least two medicines to check their interactions.",
      );
      return;
    }

    setComparing(true);
    setError("");

    try {
      const result = await compareMedicines(
        selected.map((medicine) => medicine.id),
      );

      if (!result || result.status !== "ok") {
        throw new Error(
          result?.message ||
            "The interaction check could not be completed.",
        );
      }

      setComparison({
        ...result,
        selectedMedicines: selected,
        interactions: result.interactions || [],
      });
    } catch (err) {
      setError(
        err.message ||
          "Unable to check these medicines.",
      );
    } finally {
      setComparing(false);
    }
  };

  const resetComparison = () => {
    setComparison(null);
    setSlots([createSlot(), createSlot()]);
    setError("");
  };

  /* ========================================
     RENDER
  ======================================== */

  return (
    <section
      className={styles.tools}
      aria-labelledby="interaction-title"
    >
      {!comparison ? (
        <>
          <div className={styles.toolsHeading}>
            <div>
              <span className={styles.eyebrow}>
                CLINICAL SAFETY
              </span>

              <h2 id="interaction-title">
                Interaction checker
              </h2>

              <p>
                Check for interactions between two or more medicines.
              </p>
            </div>

            <span className={styles.headingIcon}>
              <i className="fa-solid fa-shield-halved" />
            </span>
          </div>

          <div className={styles.slots}>
            {slots.map((slot, index) => (
              <MedicineSlot
                key={index}
                slot={slot}
                index={index}
                onQueryChange={(query) =>
                  updateSlot(index, {
                    query,
                    results: [],
                    searching: false,
                    searchedQuery: "",
                  })
                }
                onSelect={(medicine) =>
                  selectMedicine(index, medicine)
                }
                onClear={() => {
                  if (slots.length > 2) {
                    removeSlot(index);
                  } else {
                    clearSlot(index);
                  }
                }}
                canRemove={slots.length > 2}
              />
            ))}
          </div>

          <div className={styles.toolActions}>
            {slots.length < 4 && (
              <button
                type="button"
                className={styles.addButton}
                onClick={addSlot}
              >
                <i className="fa-solid fa-plus" />
                Add medicine
              </button>
            )}

            <button
              type="button"
              className={styles.compareButton}
              onClick={runComparison}
              disabled={
                comparing ||
                slots.filter((slot) => slot.medicine).length < 2
              }
            >
              {comparing ? (
                <>
                  <span className={styles.buttonSpinner} />
                  Checking
                </>
              ) : (
                <>
                  Check interactions
                  <i className="fa-solid fa-arrow-right" />
                </>
              )}
            </button>
          </div>

          {error && (
            <p className={styles.errorMessage}>
              <i className="fa-solid fa-circle-exclamation" />
              {error}
            </p>
          )}
        </>
      ) : (
        <InteractionResults
          comparison={comparison}
          onEdit={() => setComparison(null)}
          onReset={resetComparison}
        />
      )}
    </section>
  );
}

export default MedicineTools;