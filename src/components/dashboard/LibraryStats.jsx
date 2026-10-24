import { Link } from "react-router-dom";
import styles from "./Dashboard.module.css";

function LibraryStats({ counts }) {
  return (
    <section className={styles.statsSection} aria-label="Your library">
      <div className={styles.libraryStats}>
        <div>
          <strong>{counts.organized}</strong>
          <span>Organized files</span>
        </div>

        <div>
          <strong>{counts.savedMedicines}</strong>
          <span>Saved medicines</span>
        </div>

        <div>
          <strong>{counts.unorganized}</strong>
          <span>Unorganized files</span>
        </div>
      </div>

      <Link className={styles.textLink} to="/resources">
        Go to Resources
        <i className="fa-solid fa-arrow-right" aria-hidden="true" />
      </Link>
    </section>
  );
}

export default LibraryStats;