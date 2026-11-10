import { formatClassName } from "../../utils/labelText";

import styles from "./SearchResultsList.module.css";

const EXAMPLE_SEARCHES = [
  "amoxicillin",
  "antibiotic classes",
  "painkillers",
  "warfarin interactions",
];

const normalise = (value = "") =>
  String(value).trim().toLowerCase();

const INTENT_LABELS = {
  indications: "Indications",
  contraindications: "Contraindications",
  adverse_effects: "Adverse effects",
  interactions: "Interactions",
  mechanism: "Mechanism of action",
  mechanism_of_action: "Mechanism of action",
  moa: "Mechanism of action",
};

function SearchResultsList({
  search,
  onOpenMedicine,
  onOpenClass,
  onOpenGroup,
  onSearch,
}) {
  const {
    kind,
    subject,
    intent,
    notice,
    didYouMean,
    medicines = [],
    classResult,
    interactions = [],
  } = search;

  const hasInteractions = interactions.length > 0;
  const isEmpty = kind === "none" && !hasInteractions;

  const intentLabel = INTENT_LABELS[intent];

  const openMedicine = (name) => {
    onOpenMedicine(name, intent);
  };

  /* ========================================
     MEDICINE RESULTS
  ======================================== */

  const renderMedicines = () => (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>
            {didYouMean ? "DID YOU MEAN" : "MEDICINES"}
          </span>

          <h2>
            {didYouMean
              ? `No exact match for "${subject}"`
              : intentLabel
                ? `Medicines matching ${intentLabel.toLowerCase()}`
                : "Matching medicines"}
          </h2>

          {intentLabel && (
            <p>
              Open a medicine to read its {intentLabel.toLowerCase()}.
            </p>
          )}
        </div>

        <span className={styles.count}>
          {medicines.length}
        </span>
      </div>

      <div className={styles.list}>
        {medicines.map((item, index) => {
          const viaOtherName =
            item.matched_term &&
            normalise(item.matched_term) !== normalise(item.name);

          return (
            <button
              type="button"
              className={styles.row}
              key={item.id}
              onClick={() => openMedicine(item.name)}
            >
              <span className={styles.rowText}>
                <strong>{item.name}</strong>

                <small>
                  {formatClassName(item.drug_class) ||
                    "Class not specified"}
                </small>

                {viaOtherName && (
                  <em className={styles.tag}>
                    Matched "{item.matched_term}"
                  </em>
                )}
              </span>

              {index === 0 && !didYouMean && (
                <span className={styles.best}>
                  Best match
                </span>
              )}

              <span className={styles.arrow}>→</span>
            </button>
          );
        })}
      </div>
    </section>
  );

  /* ========================================
     CLASS AND GROUP MEMBERS
  ======================================== */

  const renderClassMembers = () => {
    if (!classResult) return null;

    const members = [
      ...new Map(
        classResult.classes.flatMap((item) =>
          item.medicines.map((medicine) => [
            medicine.id,
            {
              ...medicine,
              drugClass: item.drugClass,
            },
          ]),
        ),
      ).values(),
    ];

    if (!members.length) return null;

    return (
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>
              MEDICINES IN THIS RESULT
            </span>

            <h2>Explore member medicines</h2>

            <p>
              Open an individual medicine profile directly.
            </p>
          </div>

          <span className={styles.count}>
            {members.length}
          </span>
        </div>

        <div className={styles.list}>
          {members.map((medicine) => (
            <button
              type="button"
              className={styles.row}
              key={medicine.id}
              onClick={() => onOpenMedicine(medicine.name)}
            >
              <span className={styles.rowText}>
                <strong>{medicine.name}</strong>

                <small>
                  {formatClassName(medicine.drugClass)}
                </small>
              </span>

              <span className={styles.arrow}>→</span>
            </button>
          ))}
        </div>
      </section>
    );
  };

  /* ========================================
     CLASSIFICATION
  ======================================== */

  const renderClasses = () => {
    if (!classResult) return null;

    const isGroup = classResult.type === "group";

    return (
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>
              {isGroup ? "THERAPEUTIC GROUP" : "DRUG CLASSES"}
            </span>

            <h2>
              {isGroup
                ? classResult.title
                : `Classes matching "${subject}"`}
            </h2>

            <p>
              {classResult.medicineCount} medicines across{" "}
              {classResult.classes.length}{" "}
              {classResult.classes.length === 1
                ? "drug class"
                : "drug classes"}
            </p>
          </div>

          {isGroup && (
            <button
              type="button"
              className={styles.textButton}
              onClick={() => onOpenGroup(classResult.title)}
            >
              Open group →
            </button>
          )}
        </div>

        <div className={styles.classCards}>
          {classResult.classes.map((item) => (
            <article
              className={styles.classCard}
              key={item.drugClass}
            >
              <button
                type="button"
                className={styles.classHeader}
                onClick={() => onOpenClass(item.drugClass)}
              >
                <strong>
                  {formatClassName(item.drugClass)}
                </strong>

                <span>
                  Open class →
                </span>
              </button>

              <p className={styles.classMeta}>
                {item.medicines.length}{" "}
                {item.medicines.length === 1
                  ? "member medicine"
                  : "member medicines"}
              </p>
            </article>
          ))}
        </div>
      </section>
    );
  };

  /* ========================================
     INTERACTION TEXT MATCHES
  ======================================== */

  const renderInteractions = () => (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>
            INTERACTION TEXT
          </span>

          <h2>
            Labels mentioning "{subject}"
          </h2>

          <p>
            These are text matches in medicine labels,
            not verified interaction checks.
          </p>
        </div>

        <span className={styles.count}>
          {interactions.length}
        </span>
      </div>

      <div className={styles.list}>
        {interactions.map((item) => (
          <div key={item.medicine_id}>
            <button
              type="button"
              className={styles.row}
              onClick={() => onOpenMedicine(item.medicine_name)}
            >
              <span className={styles.rowText}>
                <strong>{item.medicine_name}</strong>

                <small>
                  {formatClassName(item.drug_class) || "Medicine"}
                </small>
              </span>

              <span className={styles.arrow}>→</span>
            </button>

            <p className={styles.snippet}>
              {item.snippet}
            </p>
          </div>
        ))}
      </div>
    </section>
  );

  /* ========================================
     RENDER
  ======================================== */

  return (
    <div className={styles.results}>
      {notice && (
        <div className={styles.dosageNotice} role="note">
          <strong>Dosing not included</strong>
          {notice}
        </div>
      )}

      {kind === "classes" && classResult && (
        <>
          {renderClassMembers()}
          {renderClasses()}
        </>
      )}

      {kind === "medicines" && renderMedicines()}

      {kind === "medicines" &&
        classResult && (
          <>
            {renderClassMembers()}
            {renderClasses()}
          </>
        )}

      {hasInteractions && renderInteractions()}

      {isEmpty && (
        <div className={styles.empty}>
          <h3>No matching study profiles</h3>

          <p>
            We couldn't find a medicine or drug class for
            {" "}"{subject}". Check the spelling, or try a drug
            name, a class such as "beta blockers", or an
            everyday word such as "painkillers".
          </p>

          <div className={styles.examples}>
            {EXAMPLE_SEARCHES.map((example) => (
              <button
                type="button"
                className={styles.chip}
                key={example}
                onClick={() => onSearch(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchResultsList;