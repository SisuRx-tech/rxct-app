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

import { searchSuggestions } from "../../services/medicines";
import InstallButton from "./InstallButton";

function Topbar({ onOpenPanel, panelOpen }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const menuRef = useRef(null);
  const searchRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const query = searchParams.get("q") || "";
  const [text, setText] = useState(query);

  const pageTitle =
    location.pathname === "/medicines"
      ? "Medicines"
      : location.pathname === "/resources"
        ? "Resources"
        : location.pathname === "/history"
          ? "History"
          : "Dashboard";

  const pageIcon =
    location.pathname === "/medicines"
      ? "fa-capsules"
      : location.pathname === "/resources"
        ? "fa-folder-open"
        : location.pathname === "/history"
          ? "fa-clock-rotate-left"
          : "fa-table-columns";

  // Synchronize search input with URL changes.
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
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  // Debounced autocomplete.
  useEffect(() => {
    let active = true;

    const searchQuery = text.trim();

    const timer = setTimeout(async () => {
      if (searchQuery.length < 2) {
        setSuggestions([]);
        setSuggestionsLoading(false);
        return;
      }

      try {
        setSuggestionsLoading(true);

        const data = await searchSuggestions(searchQuery);

        if (active) {
          setSuggestions(data || []);
        }
      } catch (error) {
        console.error("Autocomplete error:", error);

        if (active) {
          setSuggestions([]);
        }
      } finally {
        if (active) {
          setSuggestionsLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [text]);

  // Submit search.
  function handleSearch(event) {
    event.preventDefault();

    const value = text.trim();

    if (!value) return;

    setSearchFocused(false);
    setSearchExpanded(false);

    searchRef.current?.blur();

    navigate("/medicines?q=" + encodeURIComponent(value));
  }

  // Keyboard controls.
  function handleSearchKeyDown(event) {
    if (event.key === "Escape") {
      setSearchFocused(false);
      setSearchExpanded(false);

      searchRef.current?.blur();
    }
  }

  // Select autocomplete suggestion.
  function selectSuggestion(item) {
    setText(item.label);

    setSearchFocused(false);
    setSearchExpanded(false);

    searchRef.current?.blur();

    navigate(
      "/medicines?q=" + encodeURIComponent(item.label)
    );
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
        <i className={`fa-solid ${pageIcon}`}></i>
        {pageTitle}
      </h2>

      <form
        className={styles.search}
        onSubmit={handleSearch}
      >
        <i className="fa-solid fa-magnifying-glass"></i>

        <input
          ref={searchRef}
          data-global-search
          className={styles.searchInput}
          value={text}
          type="search"
          placeholder="Search medicines, classes..."
          onFocus={() => {
            setSearchExpanded(true);
            setSearchFocused(true);
          }}
          onBlur={() => {
            setSearchExpanded(false);
            setSearchFocused(false);
          }}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          aria-autocomplete="list"
          aria-expanded={
            searchFocused && text.trim().length >= 2
          }
        />

        {/* AUTOCOMPLETE SUGGESTIONS */}
        {searchFocused && text.trim().length >= 2 && (
          <div className={styles.suggestions}>
            {suggestionsLoading ? (
              <div className={styles.suggestionMessage}>
                Searching...
              </div>
            ) : suggestions.length > 0 ? (
              suggestions.slice(0, 4).map((item) => (
                <button
                  key={`${item.suggestion_type}-${item.target_value}`}
                  className={styles.suggestionItem}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSuggestion(item)}
                >
                  <span className={styles.suggestionIcon}>
                    <i
                      className={
                        item.suggestion_type === "medicine"
                          ? "fa-solid fa-capsules"
                          : "fa-solid fa-layer-group"
                      }
                    ></i>
                  </span>

                  <span className={styles.suggestionDetails}>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>

                  <i className="fa-solid fa-arrow-up-right-from-square"></i>
                </button>
              ))
            ) : (
              <div className={styles.suggestionMessage}>
                No suggestions found.
              </div>
            )}
          </div>
        )}
      </form>

      <div className={styles.actions}>
        {!panelOpen && (
          <>
            <InstallButton />

            <button
              className={styles.iconButton}
              aria-label="Notifications"
              type="button"
            >
              <i className="fa-solid fa-bell"></i>
            </button>
          </>
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
            type="button"
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
