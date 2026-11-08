import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./History.module.css";

function History() {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rxct-medicine-history") || "[]"); }
    catch { return []; }
  });

  useEffect(() => {
    function refresh() {
      try { setItems(JSON.parse(localStorage.getItem("rxct-medicine-history") || "[]")); }
      catch { setItems([]); }
    }
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  return (
    <div className={styles.page}>
      <span className={styles.eyebrow}>YOUR ACTIVITY</span>
      <h1>History</h1>
      <p className={styles.intro}>Pick up from the medicines you have recently opened.</p>
      {items.length > 0 ? (
        <div className={styles.list}>
          {items.map((item) => (
            <button key={`${item.name}-${item.openedAt}`} className={styles.row} onClick={() => navigate(`/medicines?q=${encodeURIComponent(item.name)}`)}>
              <span className={styles.icon}><i className="fa-solid fa-capsules"></i></span>
              <span className={styles.details}><strong>{item.name}</strong><small>{item.drugClass || "Medicine reference"}</small></span>
              <span className={styles.time}>{new Date(item.openedAt).toLocaleDateString()}</span>
              <i className="fa-solid fa-arrow-right"></i>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.empty}><i className="fa-solid fa-clock-rotate-left"></i><h2>No medicine activity yet</h2><p>Open a medicine and it will appear here for easy continuation.</p></div>
      )}
    </div>
  );
}

export default History;
