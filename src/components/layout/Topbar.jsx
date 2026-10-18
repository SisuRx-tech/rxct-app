import logo from "../../assets/rxct-logo.png";
import avatar from "../../assets/circle_avatar.png";
import styles from "./Topbar.module.css";
function Topbar() {
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <img src={logo} alt="RxCT" />
      </div>

      <h2 className={styles.pageTitle}>
        <i className="fa-solid fa-table-columns"></i>
        Dashboard
      </h2>

      <div className={styles.search}>
        <i className="fa-solid fa-magnifying-glass"></i>
        <input
          type="search"
          placeholder="Search medicines, classes, symptoms..."
          className={styles.searchInput}
        />
      </div>

      <div className={styles.actions}>
        <button className={styles.iconButton} aria-label="Notifications">
          <i className="fa-solid fa-bell"></i>
        </button>
      </div>

      <button className={styles.avatarButton} aria-label="Open profile menu">
        <img src={avatar} alt="" className={styles.avatarImage}/>
      </button>
    </header>
  );
}
export default Topbar;
