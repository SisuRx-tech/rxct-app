import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRecentActivity } from "../services/activity";
import styles from "./History.module.css";

function History() {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => getRecentActivity(30));

  useEffect(() => {
    function refresh() {
      setItems(getRecentActivity(30));
    }

    window.addEventListener("storage", refresh);
    window.addEventListener("rxct-account-change", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("rxct-account-change", refresh);
    };
  }, []);

  const openItem = (item) => {
    navigate(`/medicines?q=${encodeURIComponent(item.name)}`);
  };

  return (
    <div className={styles.page}>
      <span className={styles.eyebrow}>YOUR ACTIVITY</span>
      <h1>History</h1>
      <p className={styles.intro}>
        Pick up from the medicines you have recently opened.
      </p>

      {items.length > 0 ? (
        <div className={styles.list}>
          {items.map((item, index) => (
            <button
              key={`${item.type}-${item.name}-${item.visitedAt || index}`}
              className={styles.row}
              onClick={() => openItem(item)}
            >
              <span className={styles.icon}>
                <i className="fa-solid fa-capsules"></i>
              </span>

              <span className={styles.details}>
                <strong>{item.name}</strong>
                <small>
                  {item.type === "class"
                    ? "Drug class"
                    : item.type === "group"
                      ? "Drug class group"
                      : "Medicine reference"}
                </small>
              </span>

              <span className={styles.time}>
                {item.visitedAt
                  ? new Date(item.visitedAt).toLocaleDateString()
                  : ""}
              </span>

              <i className="fa-solid fa-arrow-right"></i>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <i className="fa-solid fa-clock-rotate-left"></i>
          <h2>No medicine activity yet</h2>
          <p>Open a medicine and it will appear here for easy continuation.</p>
        </div>
      )}
    </div>
  );
}

export default History;
