import { Link } from "react-router-dom";
import SectionHeading from "./SectionHeading";
import styles from "./Dashboard.module.css";

const formatOpenedAt = (value) => {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return `Opened ${date.toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  })}`;
};

const labels = {
  medicine: "Medicine",
  class: "Drug class",
  group: "Therapeutic group",
};

function RecentlyOpened({ items = [] }) {
  return (
    <section className={styles.activitySection} aria-labelledby="activity-title">
      <SectionHeading
        id="activity-title"
        eyebrow="Your study trail"
        title="Recently opened"
        action="See all history"
        to="/history"
      />
      <div className={styles.activityList}>
        {items.map((item) => {
          const params = new URLSearchParams({ kind: item.type, q: item.name });
          const isMedicine = item.type === "medicine";
          return (
            <Link
              className={styles.activityItem}
              to={`/medicines?${params.toString()}`}
              key={`${item.type}-${item.name}`}
            >
              <span className={`${styles.itemIcon} ${isMedicine ? styles.medicineIcon : ""}`}>
                <i className={`fa-solid ${isMedicine ? "fa-pills" : "fa-layer-group"}`} aria-hidden="true" />
              </span>
              <span className={styles.itemContent}>
                <span className={styles.itemEyebrow}>{labels[item.type] || "Study item"}</span>
                <strong>{item.name}</strong>
                <span className={styles.itemMeta}>{formatOpenedAt(item.visitedAt)}</span>
              </span>
              <span className={styles.itemAction}>
                Open <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default RecentlyOpened;
