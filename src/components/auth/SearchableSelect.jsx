import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./SearchableSelect.module.css";

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Select an option",
  searchPlaceholder = "Type to search...",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((item) => item.value === value);

  const sortedOptions = useMemo(
    () => [...options].sort((a, b) => a.label.localeCompare(b.label)),
    [options],
  );

  const filtered = sortedOptions.filter((item) =>
    `${item.label} ${item.value}`.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    const handleOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    };

    const handleKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const toggle = () => {
    setOpen((current) => {
      if (!current) {
        setQuery("");
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      return !current;
    });
  };

  const choose = (option) => {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.active : ""}`}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? styles.selected : styles.placeholder}>
          {selected?.label || placeholder}
        </span>
        <span className={styles.chevron} aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          <input
            ref={inputRef}
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
            aria-label="Search options"
          />

          <div className={styles.options} role="listbox">
            {filtered.length ? (
              filtered.map((option) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={`${styles.option} ${
                    option.value === value ? styles.chosen : ""
                  }`}
                  key={option.value}
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  {option.value === value && <span>✓</span>}
                </button>
              ))
            ) : (
              <p className={styles.empty}>No matching options</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
