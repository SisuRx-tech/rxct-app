import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import { getSelectedCourses } from "../services/courseSelection";
import { getCoursesForProfile, OAU_PHARMD_COURSES } from "../data/oauPharmdCourses";
import {
  extractPdfText,
  fingerprint,
  getRememberedCorrection,
  getResources,
  getCourseDescriptions,
  saveCourseDescription,
  rememberCorrection,
  removeResource,
  saveResource,
} from "../services/resourceLibrary";
import { formatConfidence, recognizeCourse } from "../services/courseRecognition";
import { getAllNotes } from "../services/notes";
import { normalizeUserProfile } from "../services/userProfile";
import {
  createLibraryShare,
  getShareToken,
  importLibraryItems,
  resolveLibraryShare,
} from "../services/librarySharing";
import {
  preloadDriveAuthorization,
  requestDriveAccess,
  listDrivePdfs,
  downloadDrivePdf,
} from "../services/googleDriveImport";
import styles from "./Resources.module.css";
import "./ResourcesOverrides.css";

const noteCount = (notes) => Object.values(notes || {}).reduce(
  (total, group) => total + (group.entries?.length || 0),
  0,
);

function Resources() {
  const { user } = useAuth();
  const fileInput = useRef(null);
  const [resources, setResources] = useState([]);
  const [activeTab, setActiveTab] = useState("Organized");
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [pendingResource, setPendingResource] = useState(null);
  const [pendingCourseId, setPendingCourseId] = useState("");
  const [notes] = useState(getAllNotes);
  const [courseDescriptions, setCourseDescriptions] = useState({});
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSelection, setShareSelection] = useState([]);
  const [shareLink, setShareLink] = useState("");
  const [shareError, setShareError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importPayload, setImportPayload] = useState(null);
  const [importSelection, setImportSelection] = useState([]);
  const [busyExport, setBusyExport] = useState(false);
  const [busyImport, setBusyImport] = useState(false);
  const [busyImportLoad, setBusyImportLoad] = useState(false);
  const [importFeedback, setImportFeedback] = useState(null);
  const [importSource, setImportSource] = useState("rxct");
  const [driveToken, setDriveToken] = useState("");

  const profile = normalizeUserProfile(user);
  const accountId = user?.id;
  const profileLevel = Number(
    String(profile.part || profile.level || "").match(/\d+/)?.[0],
  ) || null;
  const profileSemester = /first|harmattan/i.test(profile.semester || "")
    ? "harmattan"
    : /second|rain/i.test(profile.semester || "")
      ? "rain"
      : "";

  const profileCourses = getCoursesForProfile({
    level: profileLevel,
    semester: profileSemester,
  });

  const selectedCourses = accountId
    ? getSelectedCourses(OAU_PHARMD_COURSES, accountId)
    : [];

  const offeredCourses = selectedCourses.length
    ? selectedCourses
    : profileCourses;

  const suggestedCourses = offeredCourses.slice(0, 2);

  const notify = (type, message) => setToast({ type, message });

  const refresh = async () => {
    if (!accountId) return;
    const [items, descriptions] = await Promise.all([
      getResources(accountId),
      Promise.resolve(getCourseDescriptions(accountId)),
    ]);
    setResources(items);
    setCourseDescriptions(descriptions);
  };

  useEffect(() => {
    if (!accountId) return undefined;
    let active = true;

    Promise.all([
      getResources(accountId),
      Promise.resolve(getCourseDescriptions(accountId)),
    ]).then(([items, descriptions]) => {
      if (!active) return;
      setResources(items);
      setCourseDescriptions(descriptions);
    }).catch((loadError) => {
      if (active) notify("error", loadError.message || "Could not load your library.");
    });

    return () => { active = false; };
  }, [accountId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!importOpen) return undefined;
    preloadDriveAuthorization().catch(() => {});
    return undefined;
  }, [importOpen]);

  useEffect(() => {
    const token = getShareToken();
    if (!token) return undefined;

    let active = true;
    const timer = window.setTimeout(() => {
      setImportOpen(true);
      setBusyImportLoad(true);
      setImportFeedback({ type: "progress", message: "Loading shared library…" });

      resolveLibraryShare(token)
        .then((payload) => {
          if (!active) return;
          setImportPayload(payload);
          setImportSelection((payload.items || []).map((item) => item.id));
          setImportFeedback({
            type: "success",
            message: `${payload.items.length} document${payload.items.length === 1 ? "" : "s"} ready to import.`,
          });
        })
        .catch((loadError) => {
          if (active) setImportFeedback({
            type: "error",
            message: loadError.message || "That library link could not be opened.",
          });
        })
        .finally(() => {
          if (active) setBusyImportLoad(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  const filteredResources = useMemo(() => resources.filter((resource) => {
    const searchable = [
      resource.name,
      resource.course?.title,
      resource.course?.code,
    ].join(" ").toLowerCase();

    return searchable.includes(query.toLowerCase());
  }), [query, resources]);

  const organizedResources = filteredResources.filter((item) => item.courseId);
  const unorganizedResources = filteredResources.filter((item) => !item.courseId);
  const activeCourse = offeredCourses.find((course) => course.id === activeCourseId);
  const courseResources = activeCourse
    ? organizedResources.filter((item) => item.courseId === activeCourse.id)
    : [];

  const lastResource = useMemo(() => resources
    .filter((resource) => resource.lastOpenedAt)
    .sort((a, b) => new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt))[0] || null,
  [resources]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !accountId) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      notify("error", "Please choose a PDF file.");
      return;
    }

    setUploading(true);
    notify("progress", `Reading ${file.name} locally…`);

    try {
      const { text, pageCount } = await extractPdfText(file);
      const documentFingerprint = await fingerprint(file, text);
      const recognition = recognizeCourse(text, OAU_PHARMD_COURSES);
      const learned = getRememberedCorrection(
        accountId,
        documentFingerprint,
        text,
      );

      const learnedCourse = learned
        ? OAU_PHARMD_COURSES.find((course) => course.id === learned.courseId)
        : null;

      const assignedCourse = learnedCourse
        || (recognition.highConfidence ? recognition.best?.course : null);

      const now = new Date().toISOString();
      const resource = {
        id: `${accountId}-${documentFingerprint}`,
        accountId,
        fingerprint: documentFingerprint,
        name: file.name,
        mimeType: "application/pdf",
        size: file.size,
        lastModified: file.lastModified,
        blob: file,
        text,
        pageCount,
        courseId: assignedCourse?.id || null,
        course: assignedCourse || null,
        assignmentStatus: learnedCourse
          ? "learned"
          : assignedCourse ? "auto" : "unassigned",
        confidence: learned
          ? Math.round(learned.confidence * 100)
          : recognition.confidence,
        suggestions: recognition.suggestions.map(({ course, score }) => ({
          courseId: course.id,
          score,
        })),
        createdAt: now,
        updatedAt: now,
      };

      await saveResource(resource);
      await refresh();

      if (assignedCourse) {
        notify(
          "success",
          `${file.name} saved and organized under ${assignedCourse.code}.`,
        );
      } else {
        setPendingResource(resource);
        setPendingCourseId(recognition.best?.course?.id || "");
        notify("success", `${file.name} uploaded and saved. Choose its course to organize it.`);
      }
    } catch (uploadError) {
      notify(
        "error",
        uploadError.message || "Could not read this PDF. It may be scanned, damaged, or password-protected.",
      );
    } finally {
      setUploading(false);
    }
  };

  const assignResource = async (resource, courseId) => {
    const course = OAU_PHARMD_COURSES.find((item) => item.id === courseId);
    if (!course || !accountId) return;

    try {
      await saveResource({
        ...resource,
        courseId,
        course,
        assignmentStatus: "manual",
        updatedAt: new Date().toISOString(),
      });

      rememberCorrection(
        accountId,
        resource.fingerprint,
        courseId,
        resource.text || "",
      );

      await refresh();
      setPendingResource(null);
      setPendingCourseId("");
      notify("success", `Assigned to ${course.code}. RxCT will use this correction for similar documents.`);
    } catch (saveError) {
      notify("error", saveError.message || "Could not save that course assignment.");
    }
  };

  const skipCourseAssignment = async () => {
    if (!pendingResource) return;
    setPendingResource(null);
    setPendingCourseId("");
    notify("success", `${pendingResource.name} remains in Unorganized. You can assign it later.`);
  };

  const deleteResource = async (resource) => {
    try {
      await removeResource(accountId, resource.id);
      await refresh();
      notify("success", "Document removed from this account's library.");
    } catch (deleteError) {
      notify("error", deleteError.message || "Could not remove this document.");
    }
  };

  const saveDescription = async (courseId, description) => {
    try {
      const saved = saveCourseDescription(accountId, courseId, description);
      if (!saved) throw new Error("Could not save the course description on this device.");
      setCourseDescriptions(getCourseDescriptions(accountId));
      notify("success", "Course information saved.");
    } catch (saveError) {
      notify("error", saveError.message || "Could not save course information.");
    }
  };

  const openResource = async (resource) => {
    if (!resource?.blob) {
      notify("error", "The original PDF is unavailable on this device.");
      return;
    }

    try {
      await saveResource({
        ...resource,
        lastOpenedAt: new Date().toISOString(),
        lastOpenedSection: resource.lastOpenedSection || "Document",
      });

      const url = URL.createObjectURL(resource.blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        URL.revokeObjectURL(url);
        notify("error", "Your browser blocked the document window. Allow pop-ups and try again.");
      }
      await refresh();
    } catch (openError) {
      notify("error", openError.message || "Could not open this document.");
    }
  };

  const startShare = () => {
    setShareSelection(resources.map((resource) => resource.id));
    setShareLink("");
    setShareError("");
    setShareOpen(true);
  };

  const makeShare = async () => {
    setBusyExport(true);
    setShareError("");

    try {
      const link = await createLibraryShare(
        resources.filter((resource) => shareSelection.includes(resource.id)),
        accountId,
      );
      setShareLink(link);

      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(link);
        notify("success", "Library link created and copied.");
      } catch {
        notify("success", "Library link created. Use Copy link to copy it.");
      }
    } catch (shareFailure) {
      setShareError(shareFailure.message || "Could not create the library link.");
    } finally {
      setBusyExport(false);
    }
  };

  const importSelected = async () => {
    if (!importPayload?.items?.length || !accountId || !importSelection.length) return;

    setBusyImport(true);
    setImportFeedback({ type: "progress", message: "Importing selected documents…" });

    try {
      if (importSource === "rxct") {
        const importedCount = await importLibraryItems(
          importPayload.items,
          importSelection,
          accountId,
          saveResource,
        );
        await refresh();
        setImportFeedback({
          type: "success",
          message: `${importedCount} document${importedCount === 1 ? "" : "s"} imported successfully.`,
        });
        return;
      }

      if (!driveToken) {
        throw new Error("Google Drive authorization expired. Load the link again.");
      }

      const selectedItems = importPayload.items.filter((item) =>
        importSelection.includes(item.id),
      );
      let importedCount = 0;
      const failedFiles = [];
      let unassignedResource = null;

      for (const item of selectedItems) {
        try {
          const file = await downloadDrivePdf(item, driveToken);
          const { text, pageCount } = await extractPdfText(file);
          const documentFingerprint = await fingerprint(file, text);
          const recognition = recognizeCourse(text, OAU_PHARMD_COURSES);
          const learned = getRememberedCorrection(accountId, documentFingerprint, text);

          const learnedCourse = learned
            ? OAU_PHARMD_COURSES.find((course) => course.id === learned.courseId)
            : null;
          const assignedCourse = learnedCourse
            || (recognition.highConfidence ? recognition.best?.course : null);
          const now = new Date().toISOString();

          const resource = {
            id: `${accountId}-${documentFingerprint}`,
            accountId,
            fingerprint: documentFingerprint,
            name: file.name,
            mimeType: "application/pdf",
            size: file.size,
            lastModified: file.lastModified,
            blob: file,
            text,
            pageCount,
            courseId: assignedCourse?.id || null,
            course: assignedCourse || null,
            assignmentStatus: learnedCourse
              ? "learned"
              : assignedCourse ? "auto" : "unassigned",
            confidence: learned
              ? Math.round(learned.confidence * 100)
              : recognition.confidence,
            suggestions: recognition.suggestions.map(({ course, score }) => ({
              courseId: course.id,
              score,
            })),
            createdAt: now,
            updatedAt: now,
          };

          await saveResource(resource);
          importedCount += 1;

          if (!assignedCourse) {
            unassignedResource = {
              resource,
              suggestedCourseId: recognition.best?.course?.id || "",
            };
          }
        } catch (fileError) {
          failedFiles.push(`${item.name}: ${fileError.message || "Import failed"}`);
        }
      }

      await refresh();

      if (unassignedResource) {
        setPendingResource(unassignedResource.resource);
        setPendingCourseId(unassignedResource.suggestedCourseId);
      }

      if (failedFiles.length) {
        setImportFeedback({
          type: importedCount ? "success" : "error",
          message: `${importedCount} imported; ${failedFiles.length} failed. ${failedFiles.slice(0, 2).join("; ")}`,
        });
      } else {
        setImportFeedback({
          type: "success",
          message: `${importedCount} document${importedCount === 1 ? "" : "s"} imported from Google Drive.`,
        });
      }

      setDriveToken("");
    } catch (importError) {
      setImportFeedback({
        type: "error",
        message: importError.message || "Could not import those documents.",
      });
    } finally {
      setBusyImport(false);
    }
  };

  const levelLabel = [profile.part || profile.level, profile.semester]
    .filter(Boolean)
    .join(" · ");

  const openUpload = () => {
    if (!uploading) fileInput.current?.click();
  };

  return (
    <div className={styles.page}>
      {toast && (
        <div className={`resourceToast resourceToast-${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
          <i className={`fa-solid ${
            toast.type === "error"
              ? "fa-triangle-exclamation"
              : toast.type === "progress"
                ? "fa-spinner fa-spin"
                : "fa-circle-check"
          }`} />
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      )}

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>YOUR STUDY LIBRARY</span>
          <h1>Keep the useful close.</h1>
          <p>Upload your course materials and RxCT will help keep them organized.</p>
          <div className={styles.heroActions}>
            <button className={styles.primaryAction} type="button" onClick={openUpload} disabled={uploading}>
              <i className="fa-solid fa-cloud-arrow-up" />
              {uploading ? "Reading PDF…" : "Upload document"}
            </button>
            <span>{levelLabel || "Your course-aware archive"}</span>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFile}
            hidden
          />
        </div>

        <div className={styles.heroAside}>
          <span className={styles.heroLabel}>
            <i className="fa-solid fa-book-open" /> YOUR COURSES
          </span>
          {suggestedCourses.length ? suggestedCourses.map((course) => (
            <div className={styles.courseSuggestion} key={course.id}>
              <strong>{course.code}</strong>
              <small>{course.title}</small>
            </div>
          )) : (
            <p className={styles.noSuggestions}>
              Select your courses in your academic profile to organize this library.
            </p>
          )}
        </div>
      </section>

      {lastResource && (
        <section className={styles.resumeSection}>
          <div>
            <span className={styles.sectionKicker}>LAST RESOURCE SESSION</span>
            <h2>Pick up where you left off</h2>
            <p><i className="fa-solid fa-file-lines" /> {lastResource.name}</p>
          </div>
          <button className={styles.continueButton} type="button" onClick={() => openResource(lastResource)}>
            Open again <i className="fa-solid fa-arrow-right" />
          </button>
        </section>
      )}

      <section className={`${styles.libraryShell} libraryShellRoot`} aria-label="Your resource library">
        <div className={`${styles.libraryToolbar} libraryToolbarRoot`}>
          <div>
            <span className={styles.sectionKicker}>YOUR LIBRARY</span>
            <h2>Resources & documents</h2>
          </div>
          <label className={styles.search}>
            <i className="fa-solid fa-magnifying-glass" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your library"
              aria-label="Search your library"
            />
          </label>
        </div>

        <div className={`${styles.libraryTabs} libraryTabsRoot`} role="tablist" aria-label="Library organization">
          {[
            ["Organized", organizedResources.length],
            ["Unorganized", unorganizedResources.length],
            ["All", resources.length],
            ["Coverage", null],
          ].map(([tab, count]) => (
            <button
              type="button"
              key={tab}
              className={activeTab === tab ? styles.activeTab : ""}
              onClick={() => {
                setActiveTab(tab);
                setActiveCourseId(null);
              }}
              role="tab"
              aria-selected={activeTab === tab}
            >
              {tab === "All" ? "All documents" : tab}
              {count !== null && <span>{count}</span>}
            </button>
          ))}
        </div>

        <div className={`${styles.libraryContent} libraryContentRoot`}>
          {activeTab === "Coverage" ? (
            <CourseCoverage
              courses={offeredCourses}
              resources={resources}
              onOpen={openResource}
            />
          ) : activeTab === "Organized" && activeCourse ? (
            <CourseFolder
              course={activeCourse}
              resources={courseResources}
              description={courseDescriptions[activeCourse.id] || ""}
              onBack={() => setActiveCourseId(null)}
              onSaveDescription={saveDescription}
              onOpen={openResource}
              onAssign={assignResource}
              onDelete={deleteResource}
            />
          ) : activeTab === "Organized" ? (
            offeredCourses.length ? (
              <div className="resourceCourseGrid">
                {offeredCourses.map((course) => {
                  const count = organizedResources.filter(
                    (resource) => resource.courseId === course.id,
                  ).length;

                  return (
                    <button
                      type="button"
                      className="resourceCourseTile"
                      key={course.id}
                      onClick={() => setActiveCourseId(course.id)}
                    >
                      <span className="resourceFolderIcon"><i className="fa-regular fa-folder" /></span>
                      <span className="resourceCourseText">
                        <strong>{course.code}</strong>
                        <span>{course.title}</span>
                        {courseDescriptions[course.id] && (
                          <small>{courseDescriptions[course.id]}</small>
                        )}
                      </span>
                      <span className="resourceCourseCount">
                        {count} {count === 1 ? "resource" : "resources"}
                      </span>
                      <i className="fa-solid fa-chevron-right resourceCourseArrow" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}><i className="fa-regular fa-folder-open" /></div>
                <div>
                  <h3>No courses selected yet</h3>
                  <p>Choose your courses in your academic profile to create your course folders.</p>
                </div>
              </div>
            )
          ) : activeTab === "Unorganized" ? (
            <ResourceList
              resources={unorganizedResources}
              emptyTitle="Nothing needs organizing"
              emptyText="New documents that need a course decision will appear here."
              onOpen={openResource}
              onAssign={assignResource}
              onDelete={deleteResource}
            />
          ) : (
            <ResourceList
              resources={filteredResources}
              emptyTitle="Your library is ready"
              emptyText="Upload a PDF and RxCT will start arranging your study archive."
              onOpen={openResource}
              onAssign={assignResource}
              onDelete={deleteResource}
            />
          )}
        </div>
      </section>

      <div className={styles.libraryFooterActions}>
        <button className={styles.primaryAction} type="button" onClick={openUpload} disabled={uploading}>
          <i className="fa-solid fa-cloud-arrow-up" /> Upload document
        </button>
        <button className={styles.toolButton} type="button" onClick={() => setImportOpen(true)}>
          <i className="fa-solid fa-file-import" /> Import library
        </button>
        <button className={styles.toolButton} type="button" onClick={startShare} disabled={!resources.length}>
          <i className="fa-solid fa-arrow-up-from-bracket" /> Export library
        </button>
      </div>

      <section className={styles.notesSection}>
        <div className={styles.notesHeading}>
          <div>
            <span className={styles.sectionKicker}>JOTTER</span>
            <h2>Notes you saved in context</h2>
          </div>
          <span className={styles.notesCount}>
            {noteCount(notes)} {noteCount(notes) === 1 ? "note" : "notes"}
          </span>
        </div>
        {Object.keys(notes || {}).length ? (
          <div className={styles.notesGrid}>
            {Object.values(notes).slice(0, 4).map((group) => (
              <article className={styles.noteCard} key={`${group.type}:${group.name}`}>
                <span><i className="fa-solid fa-pen" /> {group.type}</span>
                <h3>{group.name}</h3>
                <p>{group.entries?.[0]?.text}</p>
                <small>{group.entries?.[0]?.section || "Saved reference"}</small>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.notesEmpty}>
            <i className="fa-solid fa-pen" />
            <p>Notes from medicines and resources will collect here as you study.</p>
          </div>
        )}
      </section>

      {pendingResource && (
        <CoursePrompt
          resource={pendingResource}
          selectedCourseId={pendingCourseId}
          setSelectedCourseId={setPendingCourseId}
          suggestions={pendingResource.suggestions || []}
          onAssign={() => assignResource(pendingResource, pendingCourseId)}
          onSkip={skipCourseAssignment}
        />
      )}

      {shareOpen && (
        <ShareDialog
          resources={resources}
          selection={shareSelection}
          setSelection={setShareSelection}
          link={shareLink}
          error={shareError}
          busy={busyExport}
          onCreate={makeShare}
          onCopy={async () => {
            if (shareLink) await navigator.clipboard?.writeText(shareLink);
          }}
          onClose={() => setShareOpen(false)}
        />
      )}

      {importOpen && (
        <ImportDialog
          payload={importPayload}
          source={importSource}
          setSource={(source) => {
            setImportSource(source);
            setImportPayload(null);
            setImportSelection([]);
            setImportFeedback(null);
            setDriveToken("");
            setImportUrl("");
          }}
          selection={importSelection}
          setSelection={setImportSelection}
          url={importUrl}
          setUrl={setImportUrl}
          busy={busyImport || busyImportLoad}
          feedback={importFeedback}
          onLoad={async () => {
            setBusyImportLoad(true);
            setImportPayload(null);
            setImportSelection([]);
            setImportFeedback({
              type: "progress",
              message: importSource === "drive"
                ? "Connecting to Google Drive…"
                : "Loading shared library…",
            });

            try {
              let payload;

              if (importSource === "drive") {
                const token = await requestDriveAccess();
                setDriveToken(token);
                payload = await listDrivePdfs(importUrl, token);
              } else {
                const token = getShareTokenFromInput(importUrl);
                payload = await resolveLibraryShare(token);
              }

              setImportPayload(payload);
              setImportSelection((payload.items || []).map((item) => item.id));
              setImportFeedback({
                type: "success",
                message: `${payload.items.length} document${payload.items.length === 1 ? "" : "s"} ready to import.`,
              });
            } catch (loadError) {
              setDriveToken("");
              setImportFeedback({
                type: "error",
                message: loadError.message || "That link could not be opened.",
              });
            } finally {
              setBusyImportLoad(false);
            }
          }}
          onImport={importSelected}
          onClose={() => {
            setImportOpen(false);
            setDriveToken("");
          }}
        />
      )}
    </div>
  );
}

function ResourceList({ resources, emptyTitle, emptyText, onOpen, onAssign, onDelete }) {
  if (!resources.length) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}><i className="fa-regular fa-folder-open" /></div>
        <div><h3>{emptyTitle}</h3><p>{emptyText}</p></div>
      </div>
    );
  }

  return (
    <div>
      {resources.map((resource) => (
        <ResourceCard
          key={resource.id}
          resource={resource}
          onOpen={onOpen}
          onAssign={onAssign}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function CourseFolder({ course, resources, description, onBack, onSaveDescription, onOpen, onAssign, onDelete }) {
  const [draft, setDraft] = useState(description);

  useEffect(() => setDraft(description), [course.id, description]);

  return (
    <section className="resourceCourseFolder">
      <button type="button" className="resourceBackButton" onClick={onBack}>
        <i className="fa-solid fa-arrow-left" /> All courses
      </button>
      <div className="resourceFolderHeading">
        <span className="resourceFolderIcon"><i className="fa-regular fa-folder-open" /></span>
        <div><strong>{course.code}</strong><h3>{course.title}</h3></div>
        <span>{resources.length} {resources.length === 1 ? "resource" : "resources"}</span>
      </div>
      <form
        className="resourceDescriptionForm"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveDescription(course.id, draft);
        }}
      >
        <label htmlFor={`course-description-${course.id}`}>Useful info <span>Optional · visible only in your library</span></label>
        <input
          id={`course-description-${course.id}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 160))}
          placeholder="Add a short reminder about this course"
          maxLength={160}
        />
        <button type="submit">Save</button>
      </form>
      <ResourceList
        resources={resources}
        emptyTitle="No documents in this course yet"
        emptyText="Upload a PDF and assign it to this course."
        onOpen={onOpen}
        onAssign={onAssign}
        onDelete={onDelete}
      />
    </section>
  );
}

function CoursePrompt({ resource, selectedCourseId, setSelectedCourseId, suggestions, onAssign, onSkip }) {
  const suggestedIds = new Set(suggestions.map((item) => item.courseId));

  return (
    <div className={styles.modalBackdrop}>
      <section className={`${styles.modal} resourceCoursePrompt`} role="dialog" aria-modal="true" aria-labelledby="course-prompt-title">
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.sectionKicker}>COURSE ORGANIZATION</span>
            <h2 id="course-prompt-title">Where should this go?</h2>
          </div>
          <span className="resourcePromptFile"><i className="fa-regular fa-file-pdf" /></span>
        </div>
        <p className={styles.modalIntro}>
          <strong>{resource.name}</strong> has been saved. RxCT couldn't identify its course confidently, so choose one below.
        </p>
        {suggestions.length > 0 && (
          <div className="resourceSuggestionList">
            <span>Possible matches</span>
            {suggestions.slice(0, 3).map((suggestion) => {
              const course = OAU_PHARMD_COURSES.find((item) => item.id === suggestion.courseId);
              if (!course) return null;
              return (
                <button
                  type="button"
                  key={course.id}
                  className={selectedCourseId === course.id ? "selected" : ""}
                  onClick={() => setSelectedCourseId(course.id)}
                >
                  <span><strong>{course.code}</strong><small>{course.title}</small></span>
                  <em>{formatConfidence(suggestion.score * 100)}</em>
                </button>
              );
            })}
          </div>
        )}
        <label className="resourceCourseSelectLabel" htmlFor="resource-course-select">Choose course</label>
        <select
          id="resource-course-select"
          value={selectedCourseId}
          onChange={(event) => setSelectedCourseId(event.target.value)}
        >
          <option value="">Select a course…</option>
          {OAU_PHARMD_COURSES.map((course) => (
            <option value={course.id} key={course.id}>
              {course.code} · {course.title}
            </option>
          ))}
        </select>
        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryButton} onClick={onSkip}>Skip for now</button>
          <button type="button" className={styles.primaryAction} disabled={!selectedCourseId} onClick={onAssign}>
            Assign course
          </button>
        </div>
      </section>
    </div>
  );
}

function CourseCoverage({ courses, resources, onOpen }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className={styles.coverageList}>
      {courses.length ? courses.map((course) => {
        const items = resources.filter((resource) => resource.courseId === course.id);
        const isOpen = expanded === course.id;

        return (
          <div className={styles.coverageCourse} key={course.id}>
            <button
              type="button"
              className={styles.coverageRow}
              onClick={() => setExpanded(isOpen ? null : course.id)}
            >
              <span className={items.length ? styles.coverageDotReady : styles.coverageDot} />
              <div><strong>{course.code}</strong><span>{course.title}</span></div>
              <em>{items.length ? `${items.length} document${items.length === 1 ? "" : "s"}` : "No document yet"}</em>
              <i className={`fa-solid fa-chevron-${isOpen ? "up" : "down"}`} />
            </button>
            {isOpen && (
              <div className={styles.coverageDocuments}>
                {items.length ? items.map((resource) => (
                  <button type="button" key={resource.id} onClick={() => onOpen(resource)}>
                    <i className="fa-regular fa-file-pdf" /> {resource.name}
                  </button>
                )) : <p>No resources assigned to this course yet.</p>}
              </div>
            )}
          </div>
        );
      }) : (
        <div className={styles.empty}>
          <h3>No profile courses found</h3>
          <p>Select courses in your academic profile to see coverage.</p>
        </div>
      )}
    </div>
  );
}

function ResourceCard({ resource, onOpen, onAssign, onDelete }) {
  const [courseId, setCourseId] = useState(
    resource.courseId || resource.suggestions?.[0]?.courseId || "",
  );
  const [confirming, setConfirming] = useState(false);
  const suggestions = resource.suggestions || [];

  useEffect(() => {
    setCourseId(resource.courseId || resource.suggestions?.[0]?.courseId || "");
  }, [resource.id, resource.courseId]);

  return (
    <article className={styles.resourceCard}>
      <span className={`${styles.resourceIcon} ${resource.courseId ? styles.green : styles.orange}`}>
        <i className="fa-solid fa-file-pdf" />
      </span>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.fileType}>PDF · {resource.pageCount || "?"} pages</span>
          <span className={styles.cardUpdated}>
            {resource.assignmentStatus === "auto"
              ? "Auto-organized"
              : resource.assignmentStatus === "learned"
                ? "Learned match"
                : resource.courseId ? "Manually assigned" : "Needs a course"}
          </span>
        </div>
        <h4>{resource.name}</h4>
        <p>
          {resource.course
            ? <><i className="fa-solid fa-layer-group" /> {resource.course.code} · {resource.course.title}</>
            : "Needs a course assignment"}
        </p>
        <div className={styles.cardActions}>
          <button className={styles.openButton} type="button" disabled={!resource.blob} onClick={() => onOpen(resource)}>
            <i className="fa-solid fa-file-arrow-up" /> {resource.blob ? "Open document" : "Source unavailable"}
          </button>
          <button className={styles.deleteButton} type="button" onClick={() => setConfirming((value) => !value)}>
            <i className="fa-solid fa-trash" /> Remove
          </button>
        </div>
        {confirming && (
          <div className={styles.confirmRemove} role="alert">
            <span>Remove this document from your library?</span>
            <button type="button" onClick={() => onDelete(resource)}>Remove</button>
            <button type="button" onClick={() => setConfirming(false)}>Keep it</button>
          </div>
        )}
        <details className={styles.assignment}>
          <summary>{resource.courseId ? "Change course" : "Assign a course"}</summary>
          <div className={styles.assignmentRow}>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)} aria-label={`Course for ${resource.name}`}>
              <option value="">Select a course</option>
              {suggestions.map((suggestion) => {
                const course = OAU_PHARMD_COURSES.find((item) => item.id === suggestion.courseId);
                return course ? (
                  <option value={course.id} key={course.id}>
                    Suggested · {course.code} ({formatConfidence(suggestion.score * 100)})
                  </option>
                ) : null;
              })}
              <optgroup label="All courses">
                {OAU_PHARMD_COURSES.map((course) => (
                  <option value={course.id} key={course.id}>{course.code} · {course.title}</option>
                ))}
              </optgroup>
            </select>
            <button
              className={styles.assignButton}
              type="button"
              disabled={!courseId || courseId === resource.courseId}
              onClick={() => onAssign(resource, courseId)}
            >
              {resource.courseId ? "Save" : "Assign"}
            </button>
          </div>
        </details>
      </div>
    </article>
  );
}

function ShareDialog({ resources, selection, setSelection, link, error, busy, onCreate, onCopy, onClose }) {
  const toggle = (id) => setSelection((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
  );
  const groups = [...new Map(resources.map((resource) => [
    resource.courseId || "unorganized",
    resource.course?.code || "Unorganized",
  ]))];

  const sameSelection = (ids) =>
    ids.length === selection.length && ids.every((id) => selection.includes(id));

  const scopeValue = sameSelection(resources.map((resource) => resource.id))
    ? "all"
    : groups.find(([id]) =>
        sameSelection(resources
          .filter((resource) => (resource.courseId || "unorganized") === id)
          .map((resource) => resource.id))
      )?.[0] || "custom";

  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className={styles.modalHeader}>
          <div><span className={styles.sectionKicker}>EXPORT LIBRARY</span><h2 id="share-title">Create a temporary link</h2></div>
          <div className="modalHeaderActions">
            {link && <button type="button" className="copyIconButton" onClick={onCopy} aria-label="Copy library link"><i className="fa-regular fa-copy" /></button>}
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
          </div>
        </div>
        <p className={styles.modalIntro}>Links expire after 7 days. Choose the whole library, one course, or individual documents.</p>
        {error && <div className="shareError" role="alert"><strong>Export could not be created</strong><p>{error}</p></div>}
        <select
          className={styles.scopeSelect}
          aria-label="Export scope"
          value={scopeValue}
          onChange={(event) => {
            const scope = event.target.value;
            if (scope === "custom") return;

            setSelection(scope === "all"
              ? resources.map((resource) => resource.id)
              : resources.filter((resource) => (resource.courseId || "unorganized") === scope).map((resource) => resource.id));
          }}
        >
          <option value="all">Whole library</option>
          {groups.map(([id, label]) => <option value={id} key={id}>Course library · {label}</option>)}
          <option value="custom">Custom selection</option>
        </select>
        <div className={styles.modalList}>
          {resources.map((resource) => (
            <label key={resource.id}>
              <input type="checkbox" checked={selection.includes(resource.id)} onChange={() => toggle(resource.id)} />
              <span>{resource.name}</span>
              <small>{resource.course?.code || "Unorganized"}</small>
            </label>
          ))}
        </div>
        {link && <div className={styles.shareResult}><input readOnly value={link} aria-label="Library share link" /><button type="button" className="copyTextButton" onClick={onCopy}>Copy link</button></div>}
        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primaryAction} disabled={!selection.length || busy} onClick={onCreate}>
            {busy ? "Creating…" : link ? "Create again" : `Export ${selection.length} document${selection.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function getShareTokenFromInput(value) {
  const input = value.trim();

  try {
    const url = new URL(input);
    const segments = url.pathname.split("/").filter(Boolean);
    const importIndex = segments.indexOf("import");

    if (importIndex !== -1 && segments[importIndex + 1]) {
      return segments[importIndex + 1];
    }

    return url.searchParams.get("import") || input;
  } catch {
    const segments = input.split("/").filter(Boolean);
    const importIndex = segments.indexOf("import");

    return importIndex !== -1 && segments[importIndex + 1]
      ? segments[importIndex + 1]
      : input;
  }
}

function ImportDialog({ payload, source, setSource, selection, setSelection, url, setUrl, busy, feedback, onLoad, onImport, onClose }) {
  const items = payload?.items || [];
  const toggle = (id) => setSelection((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
  );

  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className={styles.modalHeader}>
          <div><span className={styles.sectionKicker}>IMPORT LIBRARY</span><h2 id="import-title">Bring in selected documents</h2></div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className={styles.importUrl}>
          <button type="button" className={source === "rxct" ? styles.primaryAction : styles.secondaryButton} disabled={busy} onClick={() => setSource("rxct")}>RxCT link</button>
          <button type="button" className={source === "drive" ? styles.primaryAction : styles.secondaryButton} disabled={busy} onClick={() => setSource("drive")}>Google Drive</button>
        </div>
        <p className={styles.modalIntro}>
          {source === "drive"
            ? "Paste a Google Drive PDF, file, or folder link. Sign in to Google when prompted."
            : "Paste an RxCT library link. Select the documents you want to import."}
        </p>
        <div className={styles.importUrl}>
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={source === "drive" ? "Paste Google Drive link" : "Paste library link"} aria-label={source === "drive" ? "Google Drive link" : "Library link"} />
          <button type="button" className={styles.secondaryButton} disabled={!url.trim() || busy} onClick={onLoad}>Load</button>
        </div>
        {items.length > 0 && (
          <div className={styles.modalList}>
            {items.map((item) => (
              <label key={item.id}>
                <input type="checkbox" checked={selection.includes(item.id)} onChange={() => toggle(item.id)} />
                <span>{item.name}</span>
                <small>{item.course?.code || (source === "drive" ? "Google Drive" : "Unorganized")}</small>
              </label>
            ))}
          </div>
        )}
        {feedback && (
          <div
            className={`${styles.modalFeedback} ${styles[`modalFeedback${feedback.type.charAt(0).toUpperCase()}${feedback.type.slice(1)}`] || ""}`}
            role={feedback.type === "error" ? "alert" : "status"}
          >
            {feedback.type === "progress" && <i className="fa-solid fa-spinner fa-spin" />}
            {feedback.type === "success" && <i className="fa-solid fa-circle-check" />}
            {feedback.type === "error" && <i className="fa-solid fa-triangle-exclamation" />}
            <span>{feedback.message}</span>
          </div>
        )}
        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primaryAction} disabled={!items.length || !selection.length || busy} onClick={onImport}>
            {busy ? "Importing…" : `Import ${selection.length} document${selection.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </section>
    </div>
  );
}

export default Resources;
