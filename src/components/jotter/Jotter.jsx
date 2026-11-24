import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  getStudyContext,
  subscribeStudyContext,
} from "../../services/studyContext";
import {
  addNote,
  getAllNotes,
  getDraft,
  saveDraft,
  clearDraft,
} from "../../services/notes";

import styles from "./Jotter.module.css";

/* ========================================
   JOTTER
   A floating note pad for the Medicines
   screens. It picks up what the student is
   studying (medicine, class or group, and
   the section in view) so the note is filed
   against it.

   Ctrl/Cmd + Shift + J opens and closes it.
======================================== */

function Jotter() {
  const context = useSyncExternalStore(
    subscribeStudyContext,
    getStudyContext,
  );

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(getDraft);
  const [saved, setSaved] = useState(false);
  const [notes, setNotes] = useState(getAllNotes);

  const textareaRef = useRef(null);

  /* ========================================
     SHORTCUT AND ESCAPE
  ======================================== */

  useEffect(() => {
    const onKeyDown = (event) => {
      const isShortcut =
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "j";

      if (isShortcut) {
        const target = event.target;

        const typingElsewhere =
          target !== textareaRef.current &&
          (target?.tagName === "INPUT" ||
            target?.tagName === "TEXTAREA" ||
            target?.isContentEditable);

        if (typingElsewhere) return;

        event.preventDefault();
        setOpen((value) => !value);

        return;
      }

      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!saved) return undefined;

    const timer = setTimeout(() => setSaved(false), 2500);

    return () => clearTimeout(timer);
  }, [saved]);

  /* ========================================
     ACTIONS
  ======================================== */

  const onChange = (event) => {
    setText(event.target.value);
    saveDraft(event.target.value);
  };

  const save = () => {
    const note = text.trim();

    if (!note) return;

    if (addNote(context, note)) {
      clearDraft();
      setText("");
      setNotes(getAllNotes());
      setSaved(true);
    }
  };

  const where = context
    ? [context.name, context.sectionLabel].filter(Boolean).join(", ")
    : "General note";

  /* ========================================
     RENDER
  ======================================== */

  return (
    <>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Jotter">
          <div className={styles.header}>
            <div>
              <h2>Jotter</h2>
              <p>{where}</p>
            </div>

            <button
              type="button"
              className={styles.close}
              aria-label="Close Jotter"
              onClick={() => setOpen(false)}
            >
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={onChange}
            placeholder="Write a quick note..."
            rows={5}
          />

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.save}
              disabled={!text.trim()}
              onClick={save}
            >
              Save note
            </button>
          </div>

          <section className={styles.savedNotes} aria-labelledby="jotter-saved-notes">
            <h3 id="jotter-saved-notes">Saved notes</h3>
            {(() => {
              const key = context
                ? `${context.type}:${context.name.toLowerCase()}`
                : "general";
              const entries = notes[key]?.entries || [];

              return entries.length > 0 ? (
                <div className={styles.noteList}>
                  {entries.slice(0, 5).map((entry) => (
                    <article className={styles.note} key={entry.id}>
                      <p>{entry.text}</p>
                      <small>{entry.section || "General note"}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <p className={styles.noNotes}>No notes for this study yet.</p>
              );
            })()}
          </section>
        </div>
      )}

      {saved && (
        <p className={styles.toast} role="status">
          Note saved
        </p>
      )}

      <button
        type="button"
        className={styles.button}
        aria-label="Open Jotter"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <i
          className={open ? "fa-solid fa-xmark" : "fa-solid fa-pen"}
          aria-hidden="true"
        ></i>
      </button>
    </>
  );
}

export default Jotter;
