import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getReadingState,
  saveReadingState,
} from "../../services/readingState";
import { setStudyContext } from "../../services/studyContext";
import {
  getScrollParent,
  getScrollTop,
  setScrollTop,
  offsetWithin,
  measureViewportTop,
} from "../../utils/scroll";

import styles from "./StudyProfile.module.css";

/* ========================================
   STUDY PROFILE
   Shared study environment for medicines,
   drug classes and therapeutic groups.

   The horizontal section navigation stays
   beneath the app Topbar while reading.
   Each section keeps its own reading place.
======================================== */

const TABS_HEIGHT = 52;
const TITLE_HEIGHT = 30;
const GAP = 12;

function StudyProfile({
  stateKey,
  kindLabel,
  title,
  subtitle,
  trail = [],
  notices = [],
  glance,
  sections,
  initialSection,
  initialSub,
  context,
  onBack,
  onSectionChange,
}) {
  const rootRef = useRef(null);
  const slotRef = useRef(null);
  const panelRef = useRef(null);
  const tabsRef = useRef(null);

  const saved = useMemo(
    () => getReadingState(stateKey),
    [stateKey],
  );

  const keys = sections.map((section) => section.key);

  const [active, setActive] = useState(() => {
    if (keys.includes(initialSection)) return initialSection;
    if (keys.includes(saved?.section)) return saved.section;
    return keys[0];
  });

  const [bar, setBar] = useState({
    stuck: false,
    top: 0,
    left: 0,
    width: 0,
  });
  const [open, setOpen] = useState(() => {
    const expanded = saved?.expanded || {};

    const defaultGlanceOpen =
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 600px)").matches;

    return {
      glance:
        expanded.glance !== undefined
          ? expanded.glance
          : defaultGlanceOpen,

      ...expanded,

      ...(initialSub
        ? {
            [`${initialSection}.${initialSub}`]: true,
          }
        : {}),
    };
  });
  const positions = useRef({ ...(saved?.scroll || {}) });
  const viewportTop = useRef(0);
  const activeRef = useRef(active);
  const firstRun = useRef(true);

  const index = Math.max(0, keys.indexOf(active));
  const current = sections[index];
  const previous = sections[index - 1];
  const next = sections[index + 1];

  /* ========================================
     SUBSECTIONS
  ======================================== */

  const isOpen = useCallback(
    (key, fallback = true) =>
      key in open ? open[key] : fallback,
    [open],
  );

  const toggle = useCallback(
    (key, fallback = true) => {
      const value = !(key in open ? open[key] : fallback);

      setOpen((state) => ({
        ...state,
        [key]: value,
      }));

      saveReadingState(stateKey, {
        expanded: { [key]: value },
      });
    },
    [open, stateKey],
  );

  /* ========================================
     SECTION POSITIONS
  ======================================== */

  const positionFor = useCallback((element) => {
    if (!element) return 0;

    const scroller = getScrollParent(rootRef.current);

    const base =
      scroller === window
        ? 0
        : scroller.getBoundingClientRect().top;

    return Math.max(
      0,
      offsetWithin(element, scroller) -
        (viewportTop.current - base) -
        TABS_HEIGHT -
        TITLE_HEIGHT -
        GAP,
    );
  }, []);

  const select = useCallback(
    (key) => {
      if (!keys.includes(key) || key === active) return;

      const scroller = getScrollParent(rootRef.current);

      positions.current[active] = getScrollTop(scroller);

      saveReadingState(stateKey, {
        section: key,
        scroll: {
          [active]: positions.current[active],
        },
      });

      setActive(key);
    },
    [active, keys, stateKey],
  );

  /* ========================================
     STICKY BAR POSITION
  ======================================== */

  const measure = useCallback(() => {
    const slot = slotRef.current;

    if (!slot) return;

    const top = viewportTop.current;
    const rect = slot.getBoundingClientRect();
    const stuck = rect.top <= top;

    setBar((state) =>
      state.stuck === stuck &&
      state.top === top &&
      state.left === rect.left &&
      state.width === rect.width
        ? state
        : {
            stuck,
            top,
            left: rect.left,
            width: rect.width,
          },
    );
  }, []);

  /* ========================================
     PLACEMENT
  ======================================== */

  useLayoutEffect(() => {
    activeRef.current = active;
  }, [active]);

  useLayoutEffect(() => {
    const root = rootRef.current;

    if (!root) return;

    const scroller = getScrollParent(root);
    const stored = positions.current[active];

    viewportTop.current = measureViewportTop(root);

    if (firstRun.current) {
      firstRun.current = false;

      if (initialSub) {
        const element = root.querySelector(
          `[data-sub="${CSS.escape(
            `${active}.${initialSub}`,
          )}"]`,
        );

        if (element) {
          setScrollTop(scroller, positionFor(element));
          measure();
          return;
        }
      }

      if (keys.includes(initialSection)) {
        if (
          stored != null &&
          saved?.section === initialSection
        ) {
          setScrollTop(scroller, stored);
        } else {
          setScrollTop(
            scroller,
            positionFor(panelRef.current),
          );
        }
      } else {
        setScrollTop(scroller, stored ?? 0);
      }

      measure();
      return;
    }

    if (stored != null) {
      setScrollTop(scroller, stored);
    } else {
      const target = positionFor(panelRef.current);

      if (getScrollTop(scroller) > target) {
        setScrollTop(scroller, target);
      }
    }

    measure();

    // Section definitions remain fixed for this profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /* ========================================
     SCROLL AND RESIZE
  ======================================== */

  useEffect(() => {
    let frame = 0;
    let timer = 0;

    const onScroll = () => {
      cancelAnimationFrame(frame);

      frame = requestAnimationFrame(() => {
        measure();

        const section = activeRef.current;

        positions.current[section] = getScrollTop(
          getScrollParent(rootRef.current),
        );

        clearTimeout(timer);

        timer = setTimeout(() => {
          saveReadingState(stateKey, {
            section,
            scroll: {
              [section]: positions.current[section],
            },
          });
        }, 150);
      });
    };

    const onResize = () => {
      viewportTop.current = measureViewportTop(
        rootRef.current,
      );

      onScroll();
    };

    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll, {
        capture: true,
      });

      window.removeEventListener("resize", onResize);

      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [measure, stateKey]);

  /* ========================================
     KEEP ACTIVE TAB IN VIEW
  ======================================== */

  useEffect(() => {
    const tabs = tabsRef.current;

    const button = tabs?.querySelector(
      '[aria-current="true"]',
    );

    if (!tabs || !button) return;

    tabs.scrollTo({
      left:
        button.offsetLeft -
        (tabs.clientWidth - button.offsetWidth) / 2,
      behavior: "auto",
    });
  }, [active, bar.stuck]);

  /* ========================================
     REPORTING
  ======================================== */

  const onSectionChangeRef = useRef(onSectionChange);

  useLayoutEffect(() => {
    onSectionChangeRef.current = onSectionChange;
  });

  useEffect(() => {
    saveReadingState(stateKey, {
      section: active,
    });

    onSectionChangeRef.current?.(
      active,
      current?.label || "",
    );
  }, [active, current?.label, stateKey]);

  const contextKey = JSON.stringify(context || null);

  useEffect(() => {
    setStudyContext(
      context
        ? {
            ...context,
            section: active,
            sectionLabel: current?.label,
          }
        : null,
    );

    return () => setStudyContext(null);

    // contextKey represents the context object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, current?.label, contextKey]);

  /* ========================================
     RENDER
  ======================================== */
const api = {
  isOpen,
  toggle,
};

  return (
    <div className={styles.profile} ref={rootRef}>
      <button
        type="button"
        className={styles.back}
        onClick={onBack}
      >
        <i
          className="fa-solid fa-arrow-left"
          aria-hidden="true"
        />
        Back
      </button>

      <header className={styles.header}>
        {kindLabel && (
          <span className={styles.eyebrow}>
            {kindLabel}
          </span>
        )}

        <h1>{title}</h1>

        {subtitle && <p>{subtitle}</p>}

        {trail.length > 0 && (
          <nav
            className={styles.trail}
            aria-label="Classification"
          >
            {trail.map((item) => (
              <button
                type="button"
                key={item.label}
                onClick={item.onClick}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* STICKY SECTION NAVIGATION */}

      {sections.length > 1 && (
        <div
          className={styles.slot}
          ref={slotRef}
        >
          <nav
            className={
              bar.stuck
                ? `${styles.bar} ${styles.barStuck}`
                : styles.bar
            }
            style={
              bar.stuck
                ? {
                    top: bar.top,
                    left: bar.left,
                    width: bar.width,
                  }
                : undefined
            }
            aria-label="Study sections"
          >
            {bar.stuck && (
              <p className={styles.barTitle}>
                {title}
              </p>
            )}

            <div
              className={styles.tabs}
              ref={tabsRef}
            >
              {sections.map((section) => (
                <button
                  type="button"
                  key={section.key}
                  title={section.label}
                  aria-label={section.label}
                  aria-current={
                    active === section.key
                      ? "true"
                      : undefined
                  }
                  className={
                    active === section.key
                      ? `${styles.tab} ${styles.tabActive}`
                      : styles.tab
                  }
                  onClick={() => select(section.key)}
                >
                  {section.icon && (
                    <i
                      className={`fa-solid ${section.icon}`}
                      aria-hidden="true"
                    />
                  )}

                  <span className={styles.tabLabel}>
                    {section.short || section.label}
                  </span>
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}

      {notices.map((notice) => (
        <p
          className={styles.notice}
          role="note"
          key={notice}
        >
          {notice}
        </p>
      ))}

      {glance && (
        <aside
          className={styles.glance}
          aria-label="At a glance"
        >
          <h2 className={styles.glanceTitle}>
            <button
              type="button"
              aria-expanded={isOpen("glance")}
              onClick={() => toggle("glance")}
            >
              <i
                className="fa-solid fa-eye"
                aria-hidden="true"
              />

              <span>At a glance</span>

              <span
                className={styles.chevron}
                aria-hidden="true"
              />
            </button>
          </h2>

          {isOpen("glance") && (
            <div className={styles.glanceBody}>
          {glance({ ...api, jump: select })}
            </div>
          )}
        </aside>
      )}

      <article
        key={active}
        className={styles.card}
        ref={panelRef}
        aria-labelledby={`heading-${active}`}
      >
        <h2 id={`heading-${active}`}>
          {current?.label}
        </h2>

        {current?.render(api)}

        {(previous || next) && (
          <nav
            className={styles.pager}
            aria-label="Neighbouring sections"
          >
            {previous ? (
              <button
                type="button"
                onClick={() => select(previous.key)}
              >
                <i
                  className="fa-solid fa-arrow-left"
                  aria-hidden="true"
                />

                {previous.label}
              </button>
            ) : (
              <span />
            )}

            {next && (
              <button
                type="button"
                onClick={() => select(next.key)}
              >
                {next.label}

                <i
                  className="fa-solid fa-arrow-right"
                  aria-hidden="true"
                />
              </button>
            )}
          </nav>
        )}
      </article>
    </div>
  );
}

export default StudyProfile;