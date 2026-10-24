import { Link } from "react-router-dom";
import SectionHeading from "./SectionHeading";
import styles from "./Dashboard.module.css";

function RecentlyOpened({ items }) {
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
        {items.map((item) => (
          <Link
            className={styles.activityItem}
            to={
              item.type === "medicine"
                ? `/medicines/${item.id}`
                : `/resources/${item.id}`
            }
            key={`${item.type}-${item.id}`}
          >
            <span
              className={`${styles.itemIcon} ${
                item.type === "medicine" ? styles.medicineIcon : ""
              }`}
            >
              <i
                className={`fa-solid ${
                  item.type === "medicine" ? "fa-pills" : "fa-file-lines"
                }`}
                aria-hidden="true"
              />
            </span>

            <span className={styles.itemContent}>
              <span className={styles.itemEyebrow}>{item.detail}</span>
              <strong>{item.title}</strong>
              <span className={styles.itemMeta}>Opened {item.openedAt}</span>
            </span>

            <span className={styles.itemAction}>
              {item.type === "medicine" ? "View medicine" : "Open"}
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default RecentlyOpened;