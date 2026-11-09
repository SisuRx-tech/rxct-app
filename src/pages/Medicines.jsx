import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import MedicinesLanding from "../components/medicines/MedicinesLanding";
import SearchResultsList from "../components/medicines/SearchResultsList";
import MedicineProfile from "../components/study/MedicineProfile";
import ClassProfile from "../components/study/ClassProfile";
import GroupProfile from "../components/study/GroupProfile";
import Jotter from "../components/jotter/Jotter";

import { resolveQuery } from "../services/profiles";
import { classifyError } from "../services/diagnostics/classifyError";
import { getUserErrorMessage } from "../services/diagnostics/messages";
import { recordVisit, saveResume } from "../services/activity";
import { useScrollMemory } from "../hooks/useScrollMemory";
import { formatClassName } from "../utils/labelText";

import styles from "./Medicines.module.css";

/* ========================================
   MEDICINES
   One page, four views, decided by the URL:

     /medicines                       landing
     /medicines?q=beta blockers       search results
     /medicines?kind=medicine&q=...   a profile
       (&section=...&sub=...)         opened at a place

   Every step is a normal history entry, so
   Back always returns to the previous
   search, class or medicine.
======================================== */

function MedicinesView() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const query = params.get("q") || "";
  const kind = params.get("kind") || "";
  const section = params.get("section") || "";
  const sub = params.get("sub") || "";

  const [view, setView] = useState(null);
const [retryCount, setRetryCount] = useState(0);
  const pageRef = useRef(null);

  const isLanding = !query.trim();
  const queryKey = `${kind}:${query.trim().toLowerCase()}`;

  /* ========================================
     RESOLVE WHAT THE URL POINTS AT
  ======================================== */

  useEffect(() => {
    if (isLanding) return;

    let active = true;

    resolveQuery(query, kind)
      .then((result) => {
        if (active) {
          setView({
            status: "ready",
            queryKey,
            ...result,
          });
        }
      })
    .catch((error) => {
  console.error("Medicine search failed:", error);

  if (active) {
    const category =
      error?.diagnostic?.category || classifyError(error);

    const userMessage =
      error?.diagnostic?.userMessage ||
      getUserErrorMessage(category);

    setView({
      status: "error",
      queryKey,
      category,
      title: userMessage.title,
      message: userMessage.message,
      action: userMessage.action,
    });
  }
});
    return () => {
      active = false;
    };
}, [query, kind, queryKey, isLanding, retryCount]);

  const isLoading =
    !isLanding &&
    (!view ||
      view.queryKey !== queryKey ||
      view.status === "loading");
  /* ========================================
     ACTIVITY
  ======================================== */

useEffect(() => {
  if (view?.status === "ready" && view.type !== "search") {
    recordVisit({ type: view.type, name: view.name });
  }
}, [view]);
  const handleSectionChange = useCallback(
    (sectionKey, label) => {
      if (view.status !== "ready" || view.type === "search") return;

      saveResume({
        destination: new URLSearchParams({
          kind: view.type,
          q: view.name,
          section: sectionKey,
        }).toString(),
        title:
          view.type === "class" ? formatClassName(view.name) : view.name,
        section: label,
      });
    },
    [view],
  );

  /* ========================================
     NAVIGATION
  ======================================== */

  const open = useCallback(
    (type, name) => setParams({ kind: type, q: name }),
    [setParams],
  );

const openMedicine = useCallback(
  (name, intent) => {
    const destinations = {
      indications: {
        section: "indications",
      },

      contraindications: {
        section: "contraindications",
      },

      adverse_effects: {
        section: "adverse_effects",
      },

      interactions: {
        section: "interactions",
      },

      mechanism: {
        section: "overview",
        sub: "mechanism",
      },

      mechanism_of_action: {
        section: "overview",
        sub: "mechanism",
      },

      moa: {
        section: "overview",
        sub: "mechanism",
      },
    };

    const destination = destinations[intent];

    if (!destination) {
      open("medicine", name);
      return;
    }

    setParams({
      kind: "medicine",
      q: name,
      ...destination,
    });
  },
  [open, setParams],
);

  const openClass = useCallback((name) => open("class", name), [open]);
  const openGroup = useCallback((name) => open("group", name), [open]);

  const runSearch = useCallback(
    (text) => setParams({ q: text }),
    [setParams],
  );

  // Back goes to wherever the student came from inside RxCT.
  // Opened directly (a bookmark, a reload), it goes to the landing page.
  const goBack = useCallback(() => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/medicines");
  }, [navigate]);

  /* ========================================
     SCROLL MEMORY FOR LANDING AND SEARCH
     (profiles remember their own)
  ======================================== */
const isSearch = view?.status === "ready" && view.type === "search";

  useScrollMemory(
    pageRef,
    isSearch ? `search:${query.toLowerCase()}` : "landing",
    isSearch || isLanding,
  );

  /* ========================================
     RENDER
  ======================================== */

  if (isLanding) {
    return (
      <div ref={pageRef}>
        <MedicinesLanding
          onOpenClass={openClass}
          onOpenGroup={openGroup}
          onOpenMedicine={openMedicine}
          onResume={(destination) => setParams(destination)}
        />
      </div>
    );
  }
if (isLoading) {
  return (
    <main className={styles.workspace}>
      <div
        className={styles.loading}
        role="status"
        aria-live="polite"
      >
        <span className={styles.loader} />
        <p>Preparing your results...</p>
      </div>
    </main>
  );
}
if (view?.status === "error") {
  return (
    <main className={styles.workspace}>
      <div className={styles.error}>
        <h2>{view.title}</h2>
        <p>{view.message}</p>

        <button
          type="button"
    onClick={() => {
  setView((current) => ({ ...current, status: "loading" }));
  setRetryCount((count) => count + 1);
}}
        >
          {view.action || "Try again"}
        </button>

        <button
          type="button"
          onClick={() => navigate("/medicines")}
        >
          Return to Medicines
        </button>
      </div>
    </main>
  );
}

  if (isSearch) {
    return (
      <main className={styles.workspace} ref={pageRef}>
        <section className={styles.searchResults}>
          <button
            type="button"
            className={styles.backButton}
            onClick={goBack}
          >
            ← Back
          </button>

          <h1>{query}</h1>

          <SearchResultsList
            search={view.found}
            onOpenMedicine={openMedicine}
            onOpenClass={openClass}
            onOpenGroup={openGroup}
            onSearch={runSearch}
          />
        </section>
      </main>
    );
  }

  const initialSection = section || view.openSection || "";
  const profileKey = `${view.type}:${view.name}`;

  return (
    <main className={styles.workspace}>
      {view.type === "medicine" && (
        <MedicineProfile
          key={profileKey}
          medicine={view.data}
          initialSection={initialSection}
          initialSub={sub}
          notice={view.notice}
          matchedNote={view.matchedNote}
          onBack={goBack}
          onOpenClass={openClass}
          onOpenGroup={openGroup}
          onOpenMedicine={openMedicine}
          onSectionChange={handleSectionChange}
        />
      )}

      {view.type === "class" && (
        <ClassProfile
          key={profileKey}
          drugClass={view.data}
          initialSection={initialSection}
          initialSub={sub}
          onBack={goBack}
          onOpenMedicine={openMedicine}
          onOpenGroup={openGroup}
          onSectionChange={handleSectionChange}
        />
      )}

      {view.type === "group" && (
        <GroupProfile
          key={profileKey}
          group={view.data}
          initialSection={initialSection}
          initialSub={sub}
          onBack={goBack}
          onOpenClass={openClass}
          onSectionChange={handleSectionChange}
        />
      )}
    </main>
  );
}

// Jotter floats above every Medicines screen: landing, search,
// class, group and medicine profiles.
function Medicines() {
  return (
    <>
      <MedicinesView />
      <Jotter />
    </>
  );
}

export default Medicines;
