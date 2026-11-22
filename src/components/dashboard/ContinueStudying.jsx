import { Link } from "react-router-dom";
import SectionHeading from "./SectionHeading";
import styles from "./Dashboard.module.css";

function ContinueStudying({ resource }) {
  if (!resource?.destination) return null;
  const params = new URLSearchParams(resource.destination);

  return (
    <section className={styles.continueSection} aria-labelledby="continue-title">
      <SectionHeading
        id="continue-title"
        eyebrow="Pick up where you stopped"
        title="Continue studying"
        action="View history"
        to="/history"
      />
      <article className={styles.resumeCard}>
        <div className={styles.resumeTopline}>
          <span className={styles.fileMark}>
            <i className="fa-solid fa-book-open" aria-hidden="true" />
          </span>
          <span className={styles.status}>Last study position</span>
        </div>
        <div className={styles.resumeBody}>
          <span className={styles.cardEyebrow}>{params.get("kind") || "Study"}</span>
          <h3>{resource.title || params.get("q") || "Your last topic"}</h3>
          <p>{resource.section ? `Last section: ${resource.section}` : "Return to your last opened study section"}</p>
        </div>
        <div className={styles.resumeFooter}>
          <span>Saved on this account</span>
          <Link className={styles.primaryButton} to={`/medicines?${params.toString()}`}>
            Resume studying <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </article>
    </section>
  );
}

export default ContinueStudying;
