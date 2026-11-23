import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import { getSelectedCourses } from "../services/courseSelection";
import { getCoursesForProfile, OAU_PHARMD_COURSES } from "../data/oauPharmdCourses";
import { extractPdfText, fingerprint, getRememberedCorrection, getResources, rememberCorrection, removeResource, saveResource } from "../services/resourceLibrary";
import { formatConfidence, recognizeCourse } from "../services/courseRecognition";
import { getAllNotes } from "../services/notes";
import { normalizeUserProfile } from "../services/userProfile";
import { createLibraryShare, getShareToken, importLibraryItems, resolveLibraryShare } from "../services/librarySharing";
import styles from "./Resources.module.css";
import "./ResourcesOverrides.css";

function ResourceIcon({ assigned }) {
  return <span className={`${styles.resourceIcon} ${assigned ? styles.green : styles.orange}`}><i className="fa-solid fa-file-pdf" /></span>;
}

const noteCount = (notes) => Object.values(notes || {}).reduce((total, group) => total + (group.entries?.length || 0), 0);

function Resources() {
  const { user } = useAuth();
  const fileInput = useRef(null);
  const libraryContentRef = useRef(null);
  const [resources, setResources] = useState([]);
  const [activeTab, setActiveTab] = useState("Organized");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notes] = useState(getAllNotes);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSelection, setShareSelection] = useState([]);
  const [shareLink, setShareLink] = useState("");
  const [shareError, setShareError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importPayload, setImportPayload] = useState(null);
  const [importSelection, setImportSelection] = useState([]);
  const [busyShare, setBusyShare] = useState(false);
  const profile = normalizeUserProfile(user);
  const accountId = user?.id;
  const profileLevel = Number(String(profile.part || profile.level || "").match(/\d+/)?.[0]) || null;
  const profileSemester = /first|harmattan/i.test(profile.semester || "") ? "harmattan" : /second|rain/i.test(profile.semester || "") ? "rain" : "";
  const profileCourses = getCoursesForProfile({ level: profileLevel, semester: profileSemester });
  const selectedCourses = accountId ? getSelectedCourses(OAU_PHARMD_COURSES, accountId).filter((course) => (!profileLevel || Number(course.level) === profileLevel) && (!profileSemester || course.semester === profileSemester)) : [];
  const suggestedCourses = (selectedCourses.length ? selectedCourses : profileCourses).slice(0, 2);

  const refresh = async () => {
    if (!accountId) return;
    try { setResources(await getResources(accountId)); } catch (loadError) { setError(loadError.message || "Could not load your resource library."); }
  };

  useEffect(() => {
    if (!accountId) return undefined;
    let active = true;
    getResources(accountId).then((items) => {
      if (active) setResources(items);
    }).catch((loadError) => {
      if (active) setError(loadError.message || "Could not load your resource library.");
    });
    return () => { active = false; };
  }, [accountId]);

  useEffect(() => {
    const token = getShareToken();
    if (!token) return;
    const timer = setTimeout(() => {
      setImportOpen(true);
      setBusyShare(true);
      resolveLibraryShare(token).then((payload) => {
        setImportPayload(payload);
        setImportSelection((payload.items || []).map((item) => item.id));
      }).catch((loadError) => setError(loadError.message || "That library link could not be opened.")).finally(() => setBusyShare(false));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filteredResources = useMemo(() => resources.filter((resource) => {
    const searchable = `${resource.name} ${resource.course?.title || ""} ${resource.course?.code || ""}`.toLowerCase();
    const matchesQuery = searchable.includes(query.toLowerCase());
    const matchesTab = activeTab === "All" || (activeTab === "Organized" ? resource.courseId : !resource.courseId);
    return matchesQuery && matchesTab;
  }), [activeTab, query, resources]);

  const groupedResources = useMemo(() => {
    const groups = new Map();
    filteredResources.forEach((resource) => {
      const key = resource.course?.id || resource.courseId || "unorganized";
      if (!groups.has(key)) groups.set(key, { course: resource.course, items: [] });
      groups.get(key).items.push(resource);
    });
    return [...groups.entries()];
  }, [filteredResources]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !user?.id) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setError("Please choose a PDF file."); return; }
    setError(""); setMessage("Reading your PDF locally...");
    try {
      const { text, pageCount } = await extractPdfText(file);
      const documentFingerprint = await fingerprint(file, text);
      const recognition = recognizeCourse(text, OAU_PHARMD_COURSES);
      const rememberedCourseId = getRememberedCorrection(user.id, documentFingerprint);
      const rememberedCourse = OAU_PHARMD_COURSES.find((course) => course.id === rememberedCourseId);
      const course = rememberedCourse || (recognition.highConfidence ? recognition.best?.course : null);
      const now = new Date().toISOString();
      await saveResource({ id: `${user.id}-${documentFingerprint}`, accountId: user.id, fingerprint: documentFingerprint, name: file.name, mimeType: "application/pdf", size: file.size, lastModified: file.lastModified, blob: file, text, pageCount, courseId: course?.id || null, course: course || null, assignmentStatus: rememberedCourse ? "manual" : course ? "auto" : "unassigned", confidence: recognition.confidence, suggestions: recognition.suggestions.map(({ course: suggestionCourse, score }) => ({ courseId: suggestionCourse.id, score })), createdAt: now, updatedAt: now });
      await refresh(); setMessage(course ? `${file.name} was placed in ${course.code}.` : `${file.name} was added. Choose a course below when ready.`);
    } catch (uploadError) { setError(uploadError.message || "Could not read that PDF. It may be scanned or damaged."); setMessage(""); }
  };

  const assignResource = async (resource, courseId) => {
    const course = OAU_PHARMD_COURSES.find((item) => item.id === courseId) || null;
    if (!course) return;
    await saveResource({ ...resource, courseId, course, assignmentStatus: "manual", updatedAt: new Date().toISOString() });
    rememberCorrection(user.id, resource.fingerprint, courseId); await refresh();
  };
  const deleteResource = async (resource) => { await removeResource(user.id, resource.id); await refresh(); };
  const startShare = () => { setShareSelection(resources.map((resource) => resource.id)); setShareLink(""); setShareError(""); setShareOpen(true); };
  const makeShare = async () => {
    setBusyShare(true); setError(""); setShareError("");
    try {
      const createdLink = await createLibraryShare(resources.filter((resource) => shareSelection.includes(resource.id)), accountId);
      setShareLink(createdLink);
      try { if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(createdLink); setMessage("Library link created and copied to your clipboard."); }
      catch { setMessage("Library link created. Use the copy icon to copy it."); }
    }
    catch (shareFailure) { setShareError(shareFailure.message || "Could not create the library link."); }
    finally { setBusyShare(false); }
  };
  const importSelected = async () => {
    if (!importPayload?.items?.length) return;
    setBusyShare(true); setError("");
    try { await importLibraryItems(importPayload.items, importSelection, accountId, saveResource); await refresh(); setImportOpen(false); setMessage(`${importSelection.length} document${importSelection.length === 1 ? "" : "s"} imported.`); }
    catch (importError) { setError(importError.message || "Could not import those documents."); }
    finally { setBusyShare(false); }
  };
  const lastResource = useMemo(() => resources.filter((resource) => resource.lastOpenedAt).sort((a, b) => new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt))[0] || null, [resources]);
  const openResource = async (resource) => {
    if (!resource?.blob) return;
    await saveResource({ ...resource, lastOpenedAt: new Date().toISOString(), lastOpenedSection: resource.lastOpenedSection || "Document" });
    const url = URL.createObjectURL(resource.blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) URL.revokeObjectURL(url);
    refresh();
  };
  const levelLabel = [profile.part || profile.level, profile.semester].filter(Boolean).join(" · ");
  const handleLibraryWheel = (event) => {
    const element = libraryContentRef.current;
    if (!element || !event.deltaY) return;
    const atTop = element.scrollTop <= 0;
    const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
    if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0)) {
      event.preventDefault();
      window.scrollBy({ top: event.deltaY, left: 0, behavior: "auto" });
    }
  };

  return <div className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.eyebrow}>YOUR STUDY LIBRARY</span><h1>Keep the useful close.</h1><p>Upload a document, find your course material, and return to the exact place you left off.</p><div className={styles.heroActions}><button className={styles.primaryAction} type="button" onClick={() => fileInput.current?.click()}><i className="fa-solid fa-cloud-arrow-up" /> Upload document</button><span>{levelLabel || "Your course-aware archive"}</span></div><input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={handleFile} hidden /></div>
      <div className={styles.heroAside}><span className={styles.heroLabel}><i className="fa-solid fa-compass" /> YOUR WORKSPACE</span>{suggestedCourses.length ? suggestedCourses.map((course) => <div className={styles.courseSuggestion} key={course.id}><strong>{course.code}</strong><small>{course.title}</small></div>) : <p className={styles.noSuggestions}>{profileLevel ? "Your current course plan will appear here." : "Set up your timetable to personalize this workspace."}</p>}</div>
    </section>

    {lastResource && <section className={styles.resumeSection}><div><span className={styles.sectionKicker}>LAST RESOURCE SESSION</span><h2>Pick up where you left off</h2><p><i className="fa-solid fa-file-lines" /> {lastResource.name}{lastResource.lastOpenedSection ? ` · ${lastResource.lastOpenedSection}` : ""}</p></div><button className={styles.continueButton} type="button" onClick={() => openResource(lastResource)}>Open again <i className="fa-solid fa-arrow-right" /></button></section>}
    {message && <p className={styles.notice} role="status"><i className="fa-solid fa-circle-check" /> {message}</p>}{error && <p className={styles.error} role="alert"><i className="fa-solid fa-triangle-exclamation" /> {error}</p>}

    <section className={`${styles.libraryShell} libraryShellRoot`} aria-label="Your resource library">
      <div className={`${styles.libraryToolbar} libraryToolbarRoot`}><div><span className={styles.sectionKicker}>YOUR LIBRARY</span><h2>Resources & documents</h2></div><label className={styles.search}><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your library" aria-label="Search your library" /></label></div>
      <div className={`${styles.libraryTabs} libraryTabsRoot`} role="tablist" aria-label="Library organization"><button className={activeTab === "Organized" ? styles.activeTab : ""} onClick={() => setActiveTab("Organized")} role="tab" aria-selected={activeTab === "Organized"}>Organized <span>{resources.filter((item) => item.courseId).length}</span></button><button className={activeTab === "Unorganized" ? styles.activeTab : ""} onClick={() => setActiveTab("Unorganized")} role="tab" aria-selected={activeTab === "Unorganized"}>Unorganized <span>{resources.filter((item) => !item.courseId).length}</span></button><button className={activeTab === "All" ? styles.activeTab : ""} onClick={() => setActiveTab("All")} role="tab" aria-selected={activeTab === "All"}>All documents <span>{resources.length}</span></button><button className={activeTab === "Coverage" ? styles.activeTab : ""} onClick={() => setActiveTab("Coverage")} role="tab" aria-selected={activeTab === "Coverage"}>Course coverage</button></div>
      <div ref={libraryContentRef} onWheel={handleLibraryWheel} className={`${styles.libraryContent} libraryContentRoot`}>{activeTab === "Coverage" ? <CourseCoverage courses={profileCourses} resources={resources} onOpen={openResource} /> : groupedResources.length ? groupedResources.map(([key, group]) => <section className={styles.courseGroup} key={key}><div className={styles.groupHeading}><div><span className={styles.groupCode}>{group.course?.code || "UNORGANIZED"}</span><h3>{group.course?.title || "Needs a course"}</h3></div><span>{group.items.length} {group.items.length === 1 ? "document" : "documents"}</span></div>{group.items.map((resource) => <ResourceCard key={resource.id} resource={resource} onOpen={openResource} onAssign={assignResource} onDelete={deleteResource} />)}</section>) : <div className={styles.empty}><div className={styles.emptyIcon}><i className="fa-regular fa-folder-open" /></div><div><h3>{resources.length ? "Nothing matches this view" : "Your library is ready"}</h3><p>{resources.length ? "Try a different search or organization filter." : "Upload a PDF and RxCT will start arranging your study archive."}</p></div></div>}</div>
    </section>
    <div className={styles.libraryFooterActions}><button className={styles.primaryAction} type="button" onClick={() => fileInput.current?.click()}><i className="fa-solid fa-cloud-arrow-up" /> Upload document</button><button className={styles.toolButton} type="button" onClick={() => setImportOpen(true)}><i className="fa-solid fa-file-import" /> Import library</button><button className={styles.toolButton} type="button" onClick={startShare} disabled={!resources.length}><i className="fa-solid fa-arrow-up-from-bracket" /> Export library</button></div>

      <section className={styles.notesSection}><div className={styles.notesHeading}><div><span className={styles.sectionKicker}>JOTTER</span><h2>Notes you saved in context</h2></div><span className={styles.notesCount}>{noteCount(notes)} {noteCount(notes) === 1 ? "note" : "notes"}</span></div>{Object.keys(notes || {}).length ? <div className={styles.notesGrid}>{Object.values(notes).slice(0, 4).map((group) => <article className={styles.noteCard} key={`${group.type}:${group.name}`}><span><i className="fa-solid fa-pen" /> {group.type}</span><h3>{group.name}</h3><p>{group.entries?.[0]?.text}</p><small>{group.entries?.[0]?.section || "Saved reference"}</small></article>)}</div> : <div className={styles.notesEmpty}><i className="fa-solid fa-pen" /><p>Notes from medicines and resources will collect here as you study.</p></div>}</section>
    {shareOpen && <ShareDialog resources={resources} selection={shareSelection} setSelection={setShareSelection} link={shareLink} error={shareError} busy={busyShare} onCreate={makeShare} onCopy={async () => { if (shareLink) await navigator.clipboard?.writeText(shareLink); }} onClose={() => setShareOpen(false)} />}
    {importOpen && <ImportDialog payload={importPayload} selection={importSelection} setSelection={setImportSelection} url={importUrl} setUrl={setImportUrl} busy={busyShare} onLoad={async () => { try { const token = importUrl.trim().split("import=")[1] || importUrl.trim(); const payload = await resolveLibraryShare(token); setImportPayload(payload); setImportSelection((payload.items || []).map((item) => item.id)); } catch (loadError) { setError(loadError.message || "That library link could not be opened."); } }} onImport={importSelected} onClose={() => setImportOpen(false)} />}
  </div>;
}

function CourseCoverage({ courses, resources, onOpen }) {
  const [expanded, setExpanded] = useState(null);
  return <div className={styles.coverageList}>{courses.length ? courses.map((course) => { const courseResources = resources.filter((resource) => resource.courseId === course.id); const isOpen = expanded === course.id; return <div className={styles.coverageCourse} key={course.id}><button type="button" className={styles.coverageRow} onClick={() => setExpanded(isOpen ? null : course.id)}><span className={courseResources.length ? styles.coverageDotReady : styles.coverageDot} /><div><strong>{course.code}</strong><span>{course.title}</span></div><em>{courseResources.length ? `${courseResources.length} document${courseResources.length === 1 ? "" : "s"}` : "No document yet"}</em><i className={`fa-solid fa-chevron-${isOpen ? "up" : "down"}`} /></button>{isOpen && <div className={styles.coverageDocuments}>{courseResources.length ? courseResources.map((resource) => <button type="button" key={resource.id} onClick={() => onOpen(resource)}><i className="fa-regular fa-file-pdf" /> {resource.name}</button>) : <p>No resources assigned to this course yet.</p>}</div>}</div>; }) : <div className={styles.empty}><h3>No profile courses found</h3><p>Set your current part and semester in your profile to focus this list.</p></div>}</div>;
}

function ShareDialog({ resources, selection, setSelection, link, error, busy, onCreate, onCopy, onClose }) {
  const toggle = (id) => setSelection((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const courseGroups = [...new Map(resources.map((resource) => [resource.courseId || "unorganized", resource.course?.code || "Unorganized"]))];
  return <div className={styles.modalBackdrop}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="share-title"><div className={styles.modalHeader}><div><span className={styles.sectionKicker}>EXPORT LIBRARY</span><h2 id="share-title">Create a temporary link</h2></div><div className="modalHeaderActions">{link && <button type="button" className="copyIconButton" onClick={onCopy} aria-label="Copy library link" title="Copy library link"><i className="fa-regular fa-copy" /></button>}<button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button></div></div><p className={styles.modalIntro}>Links expire after 7 days. Opening the link resets its expiry. Choose the whole library, one course, or individual documents.</p>{error && <div className="shareError" role="alert"><strong><i className="fa-solid fa-triangle-exclamation" /> Export could not be created</strong><p>{error}</p>{/bucket not found/i.test(error) && <small>The Supabase storage bucket for library links is not available yet. Apply the RxCT library-shares migration, then try again.</small>}</div>}<select className={styles.scopeSelect} aria-label="Export scope" defaultValue="all" onChange={(event) => { const scope = event.target.value; setSelection(scope === "all" ? resources.map((resource) => resource.id) : resources.filter((resource) => (resource.courseId || "unorganized") === scope).map((resource) => resource.id)); }}><option value="all">Whole library</option>{courseGroups.map(([id, label]) => <option value={id} key={id}>Course library · {label}</option>)}</select><div className={styles.modalList}>{resources.map((resource) => <label key={resource.id}><input type="checkbox" checked={selection.includes(resource.id)} onChange={() => toggle(resource.id)} /><span>{resource.name}</span><small>{resource.course?.code || "Unorganized"}</small></label>)}</div>{link && <div className={styles.shareResult}><input readOnly value={link} aria-label="Library share link" /><button type="button" className="copyTextButton" onClick={onCopy}>Copy link</button></div>}<div className={styles.modalActions}><button type="button" className={styles.secondaryButton} onClick={onClose}>Cancel</button><button type="button" className={styles.primaryAction} disabled={!selection.length || busy} onClick={onCreate}>{busy ? "Creating..." : link ? "Create again" : `Export ${selection.length} document${selection.length === 1 ? "" : "s"}`}</button></div></section></div>;
}

function ImportDialog({ payload, selection, setSelection, url, setUrl, busy, onLoad, onImport, onClose }) {
  const items = payload?.items || [];
  const toggle = (id) => setSelection((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <div className={styles.modalBackdrop}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="import-title"><div className={styles.modalHeader}><div><span className={styles.sectionKicker}>IMPORT LIBRARY</span><h2 id="import-title">Bring in selected documents</h2></div><button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button></div><p className={styles.modalIntro}>Paste an RxCT library link. All documents are selected by default, and you can remove anything you do not want before importing.</p><div className={styles.importUrl}><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste library link" aria-label="Library link" /><button type="button" className={styles.secondaryButton} disabled={!url.trim() || busy} onClick={onLoad}>Load</button></div>{items.length > 0 && <div className={styles.modalList}>{items.map((item) => <label key={item.id}><input type="checkbox" checked={selection.includes(item.id)} onChange={() => toggle(item.id)} /><span>{item.name}</span><small>{item.course?.code || "Unorganized"}</small></label>)}</div>}{busy && <p className={styles.modalStatus}>Opening your library link...</p>}<div className={styles.modalActions}><button type="button" className={styles.secondaryButton} onClick={onClose}>Cancel</button><button type="button" className={styles.primaryAction} disabled={!items.length || !selection.length || busy} onClick={onImport}>{busy ? "Importing..." : `Import ${selection.length} document${selection.length === 1 ? "" : "s"}`}</button></div></section></div>;
}

function ResourceCard({ resource, onOpen, onAssign, onDelete }) {
  const [courseId, setCourseId] = useState(resource.courseId || resource.suggestions?.[0]?.courseId || "");
  const [confirming, setConfirming] = useState(false);
  const suggestions = resource.suggestions || [];
  const assignmentOptions = <><option value="">Select a course</option>{suggestions.map((suggestion) => { const course = OAU_PHARMD_COURSES.find((item) => item.id === suggestion.courseId); return <option value={suggestion.courseId} key={suggestion.courseId}>{course?.code || suggestion.courseId} ({formatConfidence(suggestion.score * 100)})</option>; })}<optgroup label="All courses">{OAU_PHARMD_COURSES.map((course) => <option value={course.id} key={course.id}>{course.code} · {course.title}</option>)}</optgroup></>;
  return <article className={styles.resourceCard}><ResourceIcon assigned={resource.courseId} /><div className={styles.cardBody}><div className={styles.cardTop}><span className={styles.fileType}>PDF · {resource.pageCount || "?"} pages</span><span className={styles.cardUpdated}>{resource.assignmentStatus === "auto" ? "Suggested match" : resource.courseId ? "Course assigned" : "Needs a course"}</span></div><h4>{resource.name}</h4><p>{resource.course ? <><i className="fa-solid fa-layer-group" /> {resource.course.code} · {resource.course.title}</> : "Needs a course assignment"}</p><div className={styles.cardActions}><button className={styles.openButton} type="button" disabled={!resource.blob} onClick={() => onOpen(resource)}><i className="fa-solid fa-file-arrow-up" /> {resource.blob ? "Open document" : "Source unavailable"}</button><button className={styles.deleteButton} type="button" onClick={() => setConfirming((value) => !value)}><i className="fa-solid fa-trash" /> Remove</button></div>{confirming && <div className={styles.confirmRemove} role="alert"><span>Remove this document from your library?</span><button type="button" onClick={() => onDelete(resource)}>Remove</button><button type="button" onClick={() => setConfirming(false)}>Keep it</button></div>}<details className={styles.assignment}><summary>{resource.courseId ? "Change course" : "Assign a course"}</summary><div className={styles.assignmentRow}><select id={`course-${resource.id}`} value={courseId} onChange={(event) => setCourseId(event.target.value)}>{assignmentOptions}</select><button className={styles.assignButton} disabled={!courseId || courseId === resource.courseId} onClick={() => onAssign(resource, courseId)}>{resource.courseId ? "Save" : "Assign"}</button></div></details></div></article>;
}

export default Resources;
