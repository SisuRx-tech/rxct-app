import { Link } from "react-router-dom";
import styles from "./Dashboard.module.css";

function StartAction({ icon, title, description, action, to, tone }) {
  return (
    <Link className={`${styles.startAction} ${styles[tone]}`} to={to}>
      <span className={styles.actionIcon}>
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
      </span>

      <span className={styles.actionCopy}>
        <strong>{title}</strong>
        <span>{description}</span>
      </span>

      <span className={styles.actionArrow}>
        <span>{action}</span>
        <i className="fa-solid fa-arrow-right" aria-hidden="true" />
      </span>
    </Link>
  );
}

export default StartAction;