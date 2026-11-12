import logo from "../../assets/rxct-logo.png";
import avatar from "../../assets/circle_avatar.png";
import styles from "./Topbar.module.css";

import { useState, useRef, useEffect } from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";

function Topbar({ onOpenPanel, panelOpen }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);

  const menuRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const query = searchParams.get("q") || "";

  const [text, setText] = useState(query);

  // Keep search input synchronized with URL changes.
  useEffect(() => {
    setText(query);
  }, [query, location.pathname]);

  // Close profile menu when clicking outside.
  useEffect(() => {
    if (!menuOpen) return;

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
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, [menuOpen]);

  // Handle search submission.
  function handleSearch(event) {
    event.preventDefault();

    const value = text.trim();

    if (!value) return;

    setSearchExpanded(false);

    navigate("/medicines?q=" + encodeURIComponent(value));
  }

  return (
    <header
      className={`${styles.topbar} ${
        searchExpanded ? styles.searchExpanded : ""
      }`}
    >
      <div className={styles.brand}>
        <img src={logo} alt="RxCT" />
      </div>

      <h2 className={styles.pageTitle}>
        <i className="fa-solid fa-table-columns"></i>
        Dashboard
      </h2>

      <form
        className={styles.search}
        onSubmit={handleSearch}
      >
        <i className="fa-solid fa-magnifying-glass"></i>

        <input
          className={styles.searchInput}
          value={text}
          type="search"
          placeholder="Search medicines, classes..."
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setSearchExpanded(true)}
          onBlur={() => setSearchExpanded(false)}
        />
      </form>

      <div className={styles.actions}>
        {!panelOpen && (
          <button
            className={styles.iconButton}
            aria-label="Notifications"
          >
            <i className="fa-solid fa-bell"></i>
          </button>
        )}
      </div>

      {!panelOpen && (
        <div
          className={styles.profileMenu}
          ref={menuRef}
        >
          <button
            className={styles.avatarButton}
            aria-label="Open profile menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <img
              src={avatar}
              alt=""
              className={styles.avatarImage}
            />
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
