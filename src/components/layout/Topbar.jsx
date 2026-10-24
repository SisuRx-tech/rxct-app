import logo from "../../assets/rxct-logo.png";
import avatar from "../../assets/circle_avatar.png";
import styles from "./Topbar.module.css";
import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";

function Topbar({ onOpenPanel, panelOpen }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {

    if (!menuOpen) {
      return;
    }

 function handleClickOutside(event) {
  if (
    menuRef.current &&
    !menuRef.current.contains(event.target)
  ) {
    setMenuOpen(false);
  }
}
   
    document.addEventListener("mousedown", handleClickOutside);
  
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);
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
        {!panelOpen && (
          <button className={styles.iconButton} aria-label="Notifications">
            <i className="fa-solid fa-bell"></i>
          </button>
        )}
      </div>
      {!panelOpen && (
<div className={styles.profileMenu} ref={menuRef}>
          <button
            className={styles.avatarButton}
            aria-label="Open profile menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <img src={avatar} alt="" className={styles.avatarImage} />
          </button>

          {menuOpen && (
            <div className={styles.dropdown}>
              <Link
                to="/profile"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenPanel("profile");
                  setMenuOpen(false);
                }}
              >
                Profile
              </Link>

              <hr className={styles.divider} />

              <Link
                to="/settings"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenPanel("settings");
                  setMenuOpen(false);
                }}
              >
                Settings
              </Link>
            </div>
          )}

        </div>
      )}
    </header>
  );
}
export default Topbar;
