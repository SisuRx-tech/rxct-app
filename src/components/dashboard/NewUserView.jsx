import SectionHeading from "./SectionHeading";
import StartAction from "./StartAction";
import styles from "./Dashboard.module.css";

function NewUserView() {
  return (
    <>
      <section className={styles.startSection} aria-labelledby="start-title">
        <SectionHeading
          id="start-title"
          eyebrow="Start here"
          title="Choose what you want to do"
        />

        <div className={styles.startActions}>
          <StartAction
            icon="fa-file-arrow-up"
            tone="resourceAction"
            title="Add your first resource"
            description="Upload a PDF or TXT file. RxCT keeps the original and organizes the copy."
            action="Go to Resources"
            to="/resources"
          />

          <StartAction
            icon="fa-pills"
            tone="medicineAction"
            title="Browse medicines"
            description="Explore medicine sections, sources, and Nigerian brand names."
            action="Open Medicines"
            to="/medicines"
          />
        </div>
      </section>

      <section className={styles.readySection} aria-labelledby="ready-title">
        <div className={styles.readyIntro}>
          <span className={styles.eyebrow}>What comes next</span>
          <h2 id="ready-title">A calmer way to pick up your study.</h2>
          <p>
            When you open a resource, RxCT remembers your page. When a medicine
            appears in a highlight, you can open its reference without losing
            your place.
          </p>
        </div>

        <div className={styles.flow}>
          <div className={styles.flowStep}>
            <span>01</span>
            <strong>Add a file</strong>
            <small>PDF or TXT resources</small>
          </div>

          <div className={styles.flowLine} aria-hidden="true" />

          <div className={styles.flowStep}>
            <span>02</span>
            <strong>Study a page</strong>
            <small>Searchable course text</small>
          </div>

          <div className={styles.flowLine} aria-hidden="true" />

          <div className={styles.flowStep}>
            <span>03</span>
            <strong>Return later</strong>
            <small>Saved reading position</small>
          </div>
        </div>
      </section>
    </>
  );
}

export default NewUserView;