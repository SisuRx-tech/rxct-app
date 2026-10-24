import { Link } from "react-router-dom";
import SectionHeading from "./SectionHeading";
import styles from "./Dashboard.module.css";

function ContinueStudying({ resource }) {
  const progress = Math.round((resource.page / resource.pageCount) * 100);

  return (
    <section className={styles.continueSection} aria-labelledby="continue-title">
      <SectionHeading
        id="continue-title"
        eyebrow="Last opened"
        title="Continue studying"
        action="View history"
        to="/history"
      />

      <article className={styles.resumeCard}>
        <div className={styles.resumeTopline}>
          <span className={styles.fileMark}>
            <i className="fa-solid fa-file-pdf" aria-hidden="true" />
          </span>
          <span className={styles.status}>Saved position</span>
        </div>

        <div className={styles.resumeBody}>
          <span className={styles.cardEyebrow}>{resource.course}</span>
          <h3>{resource.title}</h3>
          <p>
            Page {resource.page} of {resource.pageCount}
            <span aria-hidden="true">·</span>
            Opened {resource.openedAt}
          </p>
        </div>

        <div
          className={styles.progressTrack}
          aria-label={`${progress} percent read`}
        >
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className={styles.resumeFooter}>
          <span>{progress}% read</span>
          <Link
            className={styles.primaryButton}
            to={`/resources/${resource.id}`}
          >
            Resume reading
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </article>
    </section>
  );
}

export default ContinueStudying;