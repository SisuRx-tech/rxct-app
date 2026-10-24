import { Link } from "react-router-dom";
import styles from "./Dashboard.module.css";

function SectionHeading({ id, eyebrow, title, action, to }) {
  return (
    <div className={styles.sectionHeading}>
      <div>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h2 id={id}>{title}</h2>
      </div>

      {action && (
        <Link className={styles.textLink} to={to}>
          {action} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export default SectionHeading;