import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getSelectedCourses } from "../services/courseSelection";
import { readAccountStorage, writeAccountStorage } from "../services/accountStorage";
import { getCoursesForProfile, OAU_PHARMD_COURSES } from "../data/oauPharmdCourses";
import {
  extractPdfText,
  fingerprint,
  hashPdfContent,
  renameDuplicateResource,
  getRememberedCorrection,
  getAdaptivePatterns,
  recordRecognitionObservation,
  getResources,
  recoverProcessingResources,
  getCourseDescriptions,
  saveCourseDescription,
  rememberCorrection,
  removeResource,
  saveResource,
} from "../services/resourceLibrary";
import { importPdfDocuments } from "../services/documentImport";
import {
  completeBackgroundJob,
  createBackgroundJob,
  failBackgroundJob,
  getBackgroundJobs,
  updateBackgroundJob,
} from "../services/backgroundJobs";
import {
  formatConfidence,
  getRecognitionFailureSignals,
  recognizeCourse,
} from "../services/courseRecognition";
import { getAllNotes } from "../services/notes";
import { normalizeUserProfile } from "../services/userProfile";
import { getStudyTasks, interpretStudyIntent, saveStudyTask, completeStudyTask, deleteStudyTask } from "../services/studyBrain";
import {
  deleteCloudResource,
  importCloudShare,
  listCloudResources,
  openCloudResource,
  updateCloudResource,
  uploadCloudPdf,
} from "../services/cloudResources";
import {
  createLibraryShare,
  getShareToken,
  resolveLibraryShare,
} from "../services/librarySharing";
import {
  preloadDriveAuthorization,
  requestDriveAccess,
  listDrivePdfs,
  downloadDrivePdf,
} from "../services/googleDriveImport";
import {
  createPortableExport,
  downloadPortableDocument,
  resolvePortableExport,
} from "../services/portableLibrary";
import styles from "./Resources.module.css";
import "./ResourcesOverrides.css";

const noteCount = (notes) => Object.values(notes || {}).reduce(
  (total, group) => total + (group.entries?.length || 0),
  0,
);

function progressLabel(progress, mode = "import") {
  if (!progress) return "";
  const { stage, completed = 0, total = 0, name } = progress;
  const count = total ? `${completed} of ${total}` : "";

  if (stage === "cancel-requested") return progress.message || "Cancellation requested…";
  if (stage === "uploading") return `Uploading documents · ${count} complete`;
  if (stage === "downloading") return `Downloading documents · ${count} complete`;
  if (stage === "saving") return mode === "export"
    ? "Saving the share manifest…"
    : `Saving documents · ${count} complete`;
  if (stage === "scanning") return progress.message || "Scanning Drive folder…";
  if (stage === "connecting") return "Connecting to Google Drive…";
  if (stage === "resolving") return "Checking the shared library link…";
  if (stage === "manifest") return "Reading the shared library list…";
  if (stage === "complete") return "Transfer complete.";
  if (stage === "file") return name ? `Processing: ${name}` : progress.message || "Processing document…";
  return progress.message || (mode === "export" ? "Preparing export…" : "Preparing import…");
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function cloudItemToResource(item, accountId, local = null) {
  const document = item.document || {};
  return {
    ...local,
    id: local?.id || `${accountId}-cloud-${item.id}`,
    accountId,
    cloudItemId: item.id,
    contentHash: document.content_hash || local?.contentHash || "",
    name: item.display_name || local?.name || "document.pdf",
    mimeType: document.mime_type || local?.mimeType || "application/pdf",
    size: Number(document.file_size || local?.size || 0),
    courseId: item.course_id || null,
    course: item.course || local?.course || OAU_PHARMD_COURSES.find((course) => course.id === item.course_id) || null,
    assignmentStatus: item.assignment_status || (item.course_id ? "assigned" : "unassigned"),
    lastOpenedAt: item.last_opened_at || local?.lastOpenedAt || null,
    lastOpenedSection: item.last_opened_section || local?.lastOpenedSection || "Document",
    progress: item.progress || local?.progress || {},
    createdAt: item.created_at || local?.createdAt || new Date().toISOString(),
    updatedAt: item.updated_at || local?.updatedAt || new Date().toISOString(),
  };
}

function getCurriculumPlacement(resource, currentCourseIds) {
  if (resource.curriculumOverride === "include") return "explicitly-included";
  if (!resource.courseId) return "curriculum-mapping-unavailable";
  return currentCourseIds.has(resource.courseId)
    ? "eligible"
    : "outside-current-curriculum";
}

function getDocumentUnderstandingStatus(recognition, assignedCourse) {
  if (assignedCourse) return "classified";
  if (!recognition || recognition.noMatch || recognition.ambiguous) return "recognition-uncertain";
  return "recognized";
}

function buildImportedResource(item, contentHash, accountId, status = "processing", source = "local") {
  const now = new Date().toISOString();
  return {
    id: `${accountId}-${contentHash}`,
    accountId,
    fingerprint: `${accountId}-${contentHash}`,
    contentHash,
    name: item.name,
    mimeType: "application/pdf",
    size: item.file.size,
    lastModified: item.file.lastModified,
    blob: item.file,
    text: "",
    pageCount: 0,
    courseId: null,
    course: null,
    source,
    sourceImportedAt: now,
    assignmentStatus: status,
    recognitionStatus: status,
    confidence: 0,
    suggestions: [],
    lastOpenedAt: null,
    lastOpenedSection: "Document",
    progress: {},
    createdAt: now,
    updatedAt: now,
  };
}

async function understandImportedResource(resource, pdfBytes, accountId) {
  if (resource.portableIntelligence?.text && resource.portableIntelligence.pageCount) {
    const intelligence = resource.portableIntelligence;
    return {
      ...resource,
      ...intelligence,
      id: resource.id,
      accountId: resource.accountId,
      blob: resource.blob,
      contentHash: resource.contentHash,
      source: resource.source,
      portableIntelligence: null,
      recognitionStatus: intelligence.recognitionStatus || "restored",
      assignmentStatus: intelligence.assignmentStatus || "unassigned",
      updatedAt: new Date().toISOString(),
    };
  }
  let documentFingerprint = resource.fingerprint;
  try {
    const { text, pageCount } = await extractPdfText(resource.blob, pdfBytes);
    documentFingerprint = await fingerprint(resource.blob, text);
    const recognition = recognizeCourse(text, OAU_PHARMD_COURSES, getAdaptivePatterns(accountId));
    if (!recognition.highConfidence) {
      recordRecognitionObservation(accountId, {
        fingerprint: documentFingerprint,
        failureSignals: getRecognitionFailureSignals(text, recognition),
        confidence: recognition.confidence,
        candidateCourseId: recognition.best?.course?.id || null,
      });
    }
    const learned = getRememberedCorrection(accountId, documentFingerprint, text);
    const learnedCourse = learned ? OAU_PHARMD_COURSES.find((course) => course.id === learned.courseId) : null;
    const assignedCourse = learnedCourse || (recognition.highConfidence ? recognition.best?.course : null);
    return {
      ...resource,
      fingerprint: documentFingerprint,
      text,
      pageCount,
      courseId: assignedCourse?.id || null,
      course: assignedCourse || null,
      assignmentStatus: learnedCourse ? "learned" : assignedCourse ? "auto" : "unassigned",
      recognitionStatus: getDocumentUnderstandingStatus(recognition, assignedCourse),
      confidence: learned ? Math.round(learned.confidence * 100) : recognition.confidence,
      suggestions: recognition.suggestions.map(({ course, score }) => ({ courseId: course.id, score })),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    recordRecognitionObservation(accountId, {
      fingerprint: documentFingerprint,
      failureSignals: ["pdf-text-extraction-failed", "scanned-or-unreadable-document"],
    });
    throw error;
  }
}

function Resources() {
  const { user } = useAuth();
  const { setUploadStatus } = useOutletContext();
  const fileInput = useRef(null);
  const [resources, setResources] = useState([]);
  const [activeTab, setActiveTab] = useState("Organized");
  const tabsRef = useRef(null);
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(null);
  const [toastClosing, setToastClosing] = useState(false);
  const [toastPosition, setToastPosition] = useState(null);
  const toastTouchStart = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pendingResources, setPendingResources] = useState([]);
  const [pendingCourseId, setPendingCourseId] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearCountdown, setClearCountdown] = useState(3);
  const [clearingAll, setClearingAll] = useState(false);
  const pendingResource = pendingResources[0]?.resource || null;
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
  const [shareProgress, setShareProgress] = useState("");
  const [portableOpen, setPortableOpen] = useState(false);
  const [portableSelection, setPortableSelection] = useState([]);
  const [portableLink, setPortableLink] = useState("");
  const [portablePayload, setPortablePayload] = useState(null);
  const [portableRestoreSelection, setPortableRestoreSelection] = useState([]);
  const [portableProgress, setPortableProgress] = useState(null);
  const [portableError, setPortableError] = useState("");
  const [portableBusy, setPortableBusy] = useState(false);
  const portableController = useRef(null);
  const exportController = useRef(null);
  const importController = useRef(null);
  const localImportController = useRef(null);
  const loadController = useRef(null);

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

  const profileCourses = useMemo(() => getCoursesForProfile({
    level: profileLevel,
    semester: profileSemester,
  }), [profileLevel, profileSemester]);

  const selectedCourses = useMemo(
    () => accountId ? getSelectedCourses(OAU_PHARMD_COURSES, accountId) : [],
    [accountId],
  );

  const offeredCourses = useMemo(
    () => selectedCourses.length ? selectedCourses : profileCourses,
    [profileCourses, selectedCourses],
  );
  const currentCurriculumIds = useMemo(
    () => new Set(offeredCourses.map((course) => course.id)),
    [offeredCourses],
  );

  const suggestedCourses = offeredCourses.slice(0, 2);

  const notify = useCallback((type, message) => {
    const bell = document.querySelector('button[aria-label="Notifications"]');
    const rect = bell?.getBoundingClientRect();
    const toastWidth = Math.min(360, window.innerWidth - 32);

    setToastPosition(
      rect
        ? {
            top: rect.bottom + 12,
            originX: rect.left + rect.width / 2 - (window.innerWidth - toastWidth) / 2,
            originY: -(rect.height / 2 + 12),
          }
        : { top: 62, originX: 0, originY: 0 }
    );

    setToastClosing(false);
    setToast({ type, message, id: Date.now() });
  }, []);

  const dismissToast = () => setToastClosing(true);

  useEffect(() => {
    preloadDriveAuthorization().catch((error) => {
      console.warn("Google Drive authorization preload failed:", error);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!accountId) return;
    const [localItems, descriptions] = await Promise.all([
      getResources(accountId),
      Promise.resolve(getCourseDescriptions(accountId)),
    ]);
    const activeJobs = await getBackgroundJobs(accountId).catch(() => []);
    // Do not resume PDF extraction while the page is mounting. A prior job may
    // contain many large PDFs; running recognition here blocks Chrome's main
    // thread before the library can paint. Preserve the PDFs and surface them
    // as recoverable failures instead.
    await Promise.all(activeJobs
      .filter((job) => job.type === "import" && job.status === "running")
      .map((job) => failBackgroundJob(
        accountId,
        job.id,
        new Error("Import was interrupted. The saved PDFs are available for recovery."),
      ).catch(() => {})));
    const recovered = await recoverProcessingResources(accountId);
    const currentLocalItems = recovered.length
      ? localItems.map((item) => recovered.find((resource) => resource.id === item.id) || item)
      : localItems;
    // IndexedDB is the source of truth for ordinary resources. Show it before
    // attempting the optional legacy-cloud reconciliation.
    const applyCurriculumPlacement = (itemsToPlace) => itemsToPlace.map((resource) => ({
      ...resource,
      curriculumStatus: getCurriculumPlacement(resource, currentCurriculumIds),
    }));
    const placedLocalItems = applyCurriculumPlacement(currentLocalItems);
    let items = placedLocalItems;
    setResources(items);
    setCourseDescriptions(descriptions);
    await Promise.all(placedLocalItems
      .filter((item, index) => item.curriculumStatus !== currentLocalItems[index].curriculumStatus)
      .map((item) => saveResource(item).catch(() => {})));
    try {
      const cloud = await listCloudResources();
      const byHash = new Map(currentLocalItems.filter((item) => item.contentHash).map((item) => [item.contentHash, item]));
      const byCloudId = new Map(currentLocalItems.filter((item) => item.cloudItemId).map((item) => [item.cloudItemId, item]));
      const cloudItems = applyCurriculumPlacement((cloud.items || []).map((item) => cloudItemToResource(
        item,
        accountId,
        byCloudId.get(item.id) || byHash.get(item.document?.content_hash),
      )));
      const cloudIds = new Set(cloudItems.map((item) => item.cloudItemId));
      const localOnly = currentLocalItems.filter((item) => !item.cloudItemId || !cloudIds.has(item.cloudItemId));
      items = applyCurriculumPlacement([...cloudItems, ...localOnly]);
      await Promise.all(cloudItems.map((item) => saveResource(item).catch(() => {})));
    } catch {
      // Offline access is expected; local resources are already visible.
    }
    setResources(items);
    setCourseDescriptions(descriptions);
  }, [accountId, currentCurriculumIds]);

  useEffect(() => {
    if (!accountId) return undefined;
    let active = true;

    Promise.resolve()
      .then(() => refresh())
      .catch((loadError) => {
        if (active) notify("error", loadError.message || "Could not load your library.");
      });

    return () => { active = false; };
  }, [accountId, refresh, notify]);

  useEffect(() => {
    if (!accountId) return;
    const outside = resources.find(
      (resource) => resource.curriculumStatus === "outside-current-curriculum" && resource.course,
    );
    if (!outside) return;

    const key = "resource-curriculum-notifications";
    const notified = readAccountStorage(key, {}, accountId) || {};
    if (notified[outside.id]) return;

    notified[outside.id] = new Date().toISOString();
    writeAccountStorage(key, notified, accountId);
    const levelLabel = outside.course.level ? ` ${outside.course.level} Level` : " another level";
    const timer = window.setTimeout(() => {
      notify(
        "progress",
        `Recognized as ${outside.course.code}${levelLabel}. Outside your current curriculum; found in All Documents.`,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accountId, notify, resources]);

  useEffect(() => {
    if (!toast) return undefined;

    const timer = window.setTimeout(() => {
      if (toastClosing) {
        setToast(null);
        setToastClosing(false);
      } else {
        setToastClosing(true);
      }
    }, toastClosing ? 340 : 5200);

    return () => window.clearTimeout(timer);
  }, [toast, toastClosing]);

  useEffect(() => {
    if (!clearAllOpen || clearCountdown <= 0 || clearingAll) return undefined;
    const timer = window.setTimeout(
      () => setClearCountdown((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [clearAllOpen, clearCountdown, clearingAll]);

  useEffect(() => {
    const token = getShareToken();
    if (!token) return undefined;

    let active = true;
    const timer = window.setTimeout(() => {
      setImportOpen(true);
      setBusyImportLoad(true);
      setImportFeedback({ type: "progress", message: "Loading shared library…" });

      resolveLibraryShare(
        token,
        (progress) => {
          setImportFeedback({
            type: "progress",
            stage: progress.stage,
            message:
              progress.stage === "resolving"
                ? "Resolving RxCT import link…"
                : progress.total > 0
                  ? `Loading shared documents (${progress.completed || 0}/${progress.total})…`
                  : "Loading shared library…",
          });
        },
        loadController.current?.signal,
      )
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

  useEffect(() => {
    const container = tabsRef.current;
    const selectedTab = container?.querySelector('[aria-selected="true"]');

    if (!container || !selectedTab) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = selectedTab.getBoundingClientRect();

    const targetLeft =
      container.scrollLeft +
      (tabRect.left - containerRect.left) -
      (container.clientWidth - tabRect.width) / 2;

    container.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: "smooth",
    });
  }, [activeTab]);

  const filteredResources = useMemo(() => resources.filter((resource) => {
    const searchable = [
      resource.name,
      resource.course?.title,
      resource.course?.code,
    ].join(" ").toLowerCase();

    return searchable.includes(query.toLowerCase());
  }), [query, resources]);

  const organizedResources = filteredResources.filter((item) =>
    item.courseId && ["eligible", "explicitly-included"].includes(item.curriculumStatus),
  );
  const unorganizedResources = filteredResources.filter((item) =>
    !item.courseId || item.curriculumStatus === "curriculum-mapping-unavailable",
  );
  const activeCourse = offeredCourses.find((course) => course.id === activeCourseId);
  const courseResources = activeCourse
    ? organizedResources.filter((item) => item.courseId === activeCourse.id)
    : [];

  const lastResource = useMemo(() => resources
    .filter((resource) => resource.lastOpenedAt)
    .sort((a, b) => new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt))[0] || null,
  [resources]);
  const handleFile = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length || !accountId) return;

    const validFiles = files.filter(
      (file) =>
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf"),
    );
    const unsupported = files.length - validFiles.length;

    if (!validFiles.length) {
      notify("error", "Please choose PDF files.");
      return;
    }

    setUploading(true);
    const controller = new AbortController();
    localImportController.current = controller;
    let job = null;
    const importStartedAt = Date.now();
    setUploadStatus({
      status: "uploading",
      stage: "hashing",
      completed: 0,
      total: validFiles.length,
      activeFiles: [],
      message: "Checking selected PDF files…",
    });

    try {
      job = await createBackgroundJob({
        accountId,
        type: "import",
        totalItems: validFiles.length,
        totalBytes: validFiles.reduce((sum, file) => sum + file.size, 0),
        checkpoint: { source: "local", names: validFiles.map((file) => file.name) },
      });
      setUploadStatus({
        status: "uploading",
        stage: "processing",
        completed: 0,
        total: validFiles.length,
        activeFiles: [],
        message: "Preparing documents for your library…",
      });

      const batch = await importPdfDocuments({
        accountId,
        items: validFiles.map((file) => ({ file, name: file.name })),
        signal: controller.signal,
        onProgress: (progress) => {
          setUploadStatus({
            status: "uploading",
            stage: progress.stage,
            completed: progress.completed,
            total: progress.total,
            activeFiles: progress.name ? [progress.name] : [],
            message: progress.name ? `Processing ${progress.name}` : "Saving your library changes…",
          });
          if (job) updateBackgroundJob(accountId, job.id, {
            stage: progress.stage,
            processedItems: progress.completed || 0,
            totalItems: progress.total || validFiles.length,
            processedBytes: validFiles.slice(0, progress.completed || 0).reduce((sum, file) => sum + file.size, 0),
            estimatedRemainingSeconds: (() => {
              const processedBytes = validFiles.slice(0, progress.completed || 0).reduce((sum, file) => sum + file.size, 0);
              const elapsed = Math.max(1, Date.now() - importStartedAt) / 1000;
              const speed = processedBytes / elapsed;
              return speed ? Math.max(0, (validFiles.reduce((sum, file) => sum + file.size, 0) - processedBytes) / speed) : null;
            })(),
          }).catch(() => {});
        },
        onCheckpoint: (checkpoint) => {
          if (job) updateBackgroundJob(accountId, job.id, {
            stage: checkpoint.stage,
            checkpoint: { ...job.checkpoint, ...checkpoint },
            processedItems: checkpoint.processed || 0,
          }).catch(() => {});
        },
        onDuplicate: async ({ item }, duplicate) => {
          if (duplicate.cloudItemId) await updateCloudResource(duplicate.cloudItemId, { display_name: item.name });
          await renameDuplicateResource(accountId, duplicate, item.name);
        },
        buildResource: (item, contentHash, status) => buildImportedResource(item, contentHash, accountId, status, "local"),
        understand: (resource, pdfBytes) => understandImportedResource(resource, pdfBytes, accountId),
      });

      const newlyPending = batch.resources
        .filter((resource) => !resource.courseId)
        .map((resource) => ({ resource, suggestedCourseId: resource.suggestions?.[0]?.courseId || "" }));
      if (newlyPending.length) {
        setPendingResources((current) => [...current, ...newlyPending]);
        setPendingCourseId((current) => current || newlyPending[0].suggestedCourseId);
      }

      await refresh();

      const summary = [
        `${batch.imported} saved`,
        `${batch.duplicates} duplicate${batch.duplicates === 1 ? "" : "s"} skipped`,
        ...(batch.failed ? [`${batch.failed} failed`] : []),
        ...(unsupported ? [`${unsupported} unsupported file${unsupported === 1 ? "" : "s"} skipped`] : []),
      ].join(" · ");

      const finalMessage = batch.imported > 0
        ? `Import complete: ${summary}.`
        : batch.failed || unsupported
          ? `No PDFs were saved: ${summary}.`
          : `Import complete: ${summary}.`;

      const finalStatus = batch.failed || unsupported
        ? (batch.imported > 0 || batch.duplicates > 0 ? "partial" : "error")
        : "complete";

      setUploadStatus({
        status: finalStatus,
        stage: "complete",
        completed: validFiles.length,
        total: validFiles.length,
        activeFiles: [],
        message: finalMessage,
      });
      if (job) await completeBackgroundJob(accountId, job.id, {
        processedItems: validFiles.length,
        processedBytes: validFiles.reduce((sum, file) => sum + file.size, 0),
        checkpoint: { imported: batch.imported, duplicates: batch.duplicates, failed: batch.failed },
      });
    } catch (uploadError) {
      console.error("Resource import failed:", uploadError);
      setUploadStatus({
        status: "error",
        stage: "complete",
        completed: 0,
        total: validFiles.length,
        activeFiles: [],
        message: uploadError.message || "The import could not be completed.",
      });
      if (job) await failBackgroundJob(accountId, job.id, uploadError).catch(() => {});
    } finally {
      if (localImportController.current === controller) localImportController.current = null;
      setUploading(false);
    }
  };
   
  const assignResource = async (resource, courseId) => {
    const course = OAU_PHARMD_COURSES.find((item) => item.id === courseId);
    if (!course || !accountId) return;

    try {
      const updatedResource = {
        ...resource,
        courseId,
        course,
        assignmentStatus: "manual",
        updatedAt: new Date().toISOString(),
      };
      await saveResource(updatedResource);
      if (resource.cloudItemId) {
        await updateCloudResource(resource.cloudItemId, {
          course_id: courseId,
          assignment_status: "manual",
        });
      }

      rememberCorrection(
        accountId,
        resource.fingerprint,
        courseId,
        resource.text || "",
        {
          previousCourseId: resource.courseId || null,
          previousConfidence: resource.confidence || null,
          evidenceLevel:
            resource.assignmentStatus === "auto" || resource.assignmentStatus === "learned"
              ? "strong"
              : "weak",
        },
      );

      await refresh();
      setPendingResources((current) => current.slice(1));
      setPendingCourseId(pendingResources[1]?.suggestedCourseId || "");
      notify("success", `Assigned to ${course.code}. RxCT will use this correction for similar documents.`);
    } catch (saveError) {
      notify("error", saveError.message || "Could not save that course assignment.");
    }
  };

  const skipCourseAssignment = async () => {
    if (!pendingResource) return;
    const skippedName = pendingResource.name;
    setPendingResources((current) => current.slice(1));
    setPendingCourseId(pendingResources[1]?.suggestedCourseId || "");
    notify("success", `${skippedName} remains in Unorganized. You can assign it later.`);
  };

  const skipAllCourseAssignments = () => {
    const count = pendingResources.length;
    setPendingResources([]);
    setPendingCourseId("");
    notify("success", `${count} document${count === 1 ? "" : "s"} left in Unorganized. You can assign them later.`);
  };

  const deleteResource = (resource) => setRemoveTarget(resource);

  const confirmDeleteResource = async () => {
    if (!removeTarget) return;

    const resource = removeTarget;

    try {
      if (resource.cloudItemId) {
        try {
          await deleteCloudResource(resource.cloudItemId);
        } catch (cloudError) {
          const message = String(cloudError?.message || "");
          const alreadyMissing =
            /resource not found|not in your library|library item not found/i.test(message);

          if (!alreadyMissing) throw cloudError;
        }
      }

      await removeResource(accountId, resource.id);

      setPendingResources((current) =>
        current.filter((item) => item.resource.id !== resource.id)
      );

      setRemoveTarget(null);
      await refresh();

      notify("success", "Document removed from this account's library.");
    } catch (deleteError) {
      notify("error", deleteError.message || "Could not remove this document.");
    }
  };

  const openClearAll = () => {
    setClearCountdown(3);
    setClearAllOpen(true);
  };

  const clearAllResources = async () => {
    if (!accountId || clearingAll || clearCountdown > 0) return;

    setClearingAll(true);
    const snapshot = [...resources];
    const removedIds = new Set();
    const failures = [];

    try {
      for (const resource of snapshot) {
        try {
          if (resource.cloudItemId) {
            try {
              await deleteCloudResource(resource.cloudItemId);
            } catch (cloudError) {
              const message = String(cloudError?.message || "");
              const alreadyMissing =
                /resource not found|not in your library|library item not found/i.test(message);
              if (!alreadyMissing) throw cloudError;
            }
          }

          await removeResource(accountId, resource.id);
          removedIds.add(resource.id);
        } catch (error) {
          failures.push(
            `${resource.name || "A document"}: ${error.message || "could not be removed"}`
          );
        }
      }

      if (removedIds.size) {
        setPendingResources((current) =>
          current.filter((item) => !removedIds.has(item.resource.id))
        );
      }

      await refresh();
      setClearAllOpen(false);
      setClearCountdown(3);

      if (failures.length) {
        notify("error", `${removedIds.size} removed; ${failures.length} could not be cleared. ${failures[0]}`);
      } else {
        notify("success", `${removedIds.size} resource${removedIds.size === 1 ? "" : "s"} cleared from this account.`);
      }
    } catch (error) {
      notify("error", error.message || "Could not clear the resource library.");
    } finally {
      setClearingAll(false);
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
    let driveWindow = null;

    try {
      let blob = resource.blob;

      // First open of a Google Drive document: download and cache it.
      if (!blob && resource.driveFileId) {
        driveWindow = window.open("about:blank", "_blank");

        if (!driveWindow) {
          notify("error", "Your browser blocked the document window. Allow pop-ups and try again.");
          return;
        }

        driveWindow.document.title = "Loading document…";
        driveWindow.document.body.innerHTML =
          "<p style='font-family:sans-serif;padding:24px'>Downloading and saving your document for offline access…</p>";

        const token = await requestDriveAccess();

        blob = await downloadDrivePdf(
          {
            id: resource.driveFileId,
            name: resource.name,
            mimeType: resource.mimeType,
          },
          token,
        );

        const contentHash = await hashPdfContent(blob);

        const openedResource = {
          ...resource,
          blob,
          contentHash,
          size: blob.size,
          mimeType: "application/pdf",
          lastOpenedAt: new Date().toISOString(),
          lastOpenedSection: resource.lastOpenedSection || "Document",
          updatedAt: new Date().toISOString(),
        };

        await saveResource(openedResource);

        const url = URL.createObjectURL(blob);
        driveWindow.location.replace(url);

        await refresh();
        notify("success", "Document saved for offline access.");
        return;
      }

      // RxCT cloud document: retrieve it if no local copy exists.
      if (!blob && resource.cloudItemId) {
        const openedCloud = await openCloudResource(resource.cloudItemId);
        const response = await fetch(openedCloud.url);

        if (!response.ok) {
          throw new Error("The cloud document could not be downloaded.");
        }

        blob = await response.blob();
      }

      if (!blob) {
        throw new Error("The original PDF is unavailable on this device.");
      }

      const openedResource = {
        ...resource,
        blob,
        lastOpenedAt: new Date().toISOString(),
        lastOpenedSection: resource.lastOpenedSection || "Document",
      };

      await saveResource(openedResource);

      if (resource.cloudItemId) {
        await updateCloudResource(resource.cloudItemId, {
          last_opened_at: openedResource.lastOpenedAt,
          last_opened_section: openedResource.lastOpenedSection,
          progress: openedResource.progress || {},
        });
      }

      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");

      if (!opened) {
        URL.revokeObjectURL(url);
        throw new Error("Your browser blocked the document window. Allow pop-ups and try again.");
      }

      await refresh();
    } catch (openError) {
      if (driveWindow && !driveWindow.closed) {
        driveWindow.close();
      }

      notify("error", openError.message || "Could not open this document.");
    }
  };
  const startShare = () => {
    setPortableSelection([]);
    setPortablePayload(null);
    setPortableRestoreSelection([]);
    setPortableLink("");
    setPortableError("");
    setPortableProgress(null);
    setPortableOpen(true);
  };

  const createPortableBackup = async () => {
    if (portableBusy) return;
    const controller = new AbortController();
    portableController.current = controller;
    setPortableBusy(true);
    setPortableError("");
    const selected = resources.filter((resource) => portableSelection.includes(resource.id));
    let job = null;
    try {
      job = await createBackgroundJob({
        accountId,
        type: "export",
        totalItems: selected.length,
        totalBytes: selected.reduce((sum, resource) => sum + Number(resource.blob?.size || 0), 0),
        checkpoint: { source: "portable", resourceIds: selected.map((resource) => resource.id) },
      });
      const result = await createPortableExport(
        selected,
        (progress) => {
          setPortableProgress(progress);
          if (job) updateBackgroundJob(accountId, job.id, {
            stage: progress.stage || "uploading",
            processedBytes: progress.uploadedBytes || 0,
            totalBytes: progress.totalBytes || selected.reduce((sum, resource) => sum + Number(resource.blob?.size || 0), 0),
            estimatedRemainingSeconds: progress.etaSeconds ?? null,
          }).catch(() => {});
        },
        controller.signal,
      );
      const origin = typeof window !== "undefined" ? window.location.origin : "https://rxct.vercel.app";
      setPortableLink(`${origin}/resources?backup=${encodeURIComponent(result.token)}`);
      setPortableProgress({ stage: "complete", completed: selected.length, total: selected.length });
      if (job) await completeBackgroundJob(accountId, job.id, {
        processedItems: selected.length,
        processedBytes: selected.reduce((sum, resource) => sum + Number(resource.blob?.size || 0), 0),
      });
      notify("success", "Portable backup created.");
    } catch (error) {
      if (error.name !== "AbortError") setPortableError(error.message || "Could not create the portable backup.");
      if (job) await failBackgroundJob(accountId, job.id, error).catch(() => {});
    } finally {
      if (portableController.current === controller) portableController.current = null;
      setPortableBusy(false);
    }
  };

  const loadPortableBackup = useCallback(async (token) => {
    setPortableBusy(true);
    setPortableError("");
    try {
      const payload = await resolvePortableExport(token);
      setPortablePayload(payload);
      setPortableRestoreSelection((payload.items || []).map((item) => item.content_hash));
      setPortableProgress(null);
    } catch (error) {
      setPortableError(error.message || "That portable backup could not be opened.");
    } finally {
      setPortableBusy(false);
    }
  }, []);

  useEffect(() => {
    const token = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("backup")
      : "";
    if (!token) return undefined;
    const timer = window.setTimeout(() => {
      setPortableOpen(true);
      loadPortableBackup(token);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPortableBackup]);

  const restorePortableBackup = async () => {
    if (!portablePayload || portableBusy) return;
    const controller = new AbortController();
    portableController.current = controller;
    setPortableBusy(true);
    setPortableError("");
    const selected = (portablePayload.items || []).filter((item) => portableRestoreSelection.includes(item.content_hash));
    const manifestByHash = new Map((portablePayload.manifest?.documents || []).map((document) => [document.contentHash, document]));
    let job = null;
    try {
      job = await createBackgroundJob({
        accountId,
        type: "import",
        totalItems: selected.length,
        totalBytes: selected.reduce((sum, item) => sum + Number(item.file_size || 0), 0),
        checkpoint: { source: "portable", token: portablePayload.token, hashes: selected.map((item) => item.content_hash) },
      });
      const totalBytes = selected.reduce((sum, candidate) => sum + Number(candidate.file_size || 0), 0);
      const startedAt = Date.now();
      const batch = await importPdfDocuments({
        accountId,
        items: selected,
        signal: controller.signal,
        loadItem: async (item, signal) => ({
          ...item,
          file: await downloadPortableDocument(portablePayload.token, item, signal),
        }),
        validateEntry: ({ item, contentHash }) => {
          if (contentHash !== item.content_hash) throw new Error(`${item.display_name} failed hash validation.`);
        },
        onProgress: (progress) => {
          const processedBytes = selected
            .slice(0, progress.completed || 0)
            .reduce((sum, item) => sum + Number(item.file_size || 0), 0);
          const elapsed = Math.max(1, Date.now() - startedAt) / 1000;
          const speedBytesPerSecond = processedBytes / elapsed;
          const etaSeconds = speedBytesPerSecond ? Math.max(0, (totalBytes - processedBytes) / speedBytesPerSecond) : null;
          setPortableProgress({ ...progress, uploadedBytes: processedBytes, totalBytes, speedBytesPerSecond, etaSeconds });
          updateBackgroundJob(accountId, job.id, {
            stage: progress.stage,
            processedItems: progress.completed || 0,
            totalItems: selected.length,
            processedBytes,
            totalBytes,
            estimatedRemainingSeconds: etaSeconds,
          }).catch(() => {});
        },
        onCheckpoint: (checkpoint) => updateBackgroundJob(accountId, job.id, {
          stage: checkpoint.stage,
          checkpoint: { ...job.checkpoint, ...checkpoint },
          processedItems: checkpoint.processed || 0,
        }).catch(() => {}),
        buildResource: (item, contentHash, status) => ({
          ...buildImportedResource({ ...item, name: manifestByHash.get(contentHash)?.name || item.display_name }, contentHash, accountId, status, "portable-library"),
          portableIntelligence: manifestByHash.get(contentHash) || null,
          id: `${accountId}-${contentHash}`,
          accountId,
          name: manifestByHash.get(contentHash)?.name || item.display_name,
          mimeType: "application/pdf",
          size: item.file.size,
          blob: item.file,
          contentHash,
          source: "portable-library",
          assignmentStatus: status,
          recognitionStatus: status,
          updatedAt: new Date().toISOString(),
        }),
        understand: (resource, pdfBytes) => understandImportedResource(resource, pdfBytes, accountId),
      });
      const restored = batch.imported;
      await refresh();
      await completeBackgroundJob(accountId, job.id, {
        processedItems: selected.length,
        processedBytes: totalBytes,
        checkpoint: { imported: batch.imported, duplicates: batch.duplicates, failed: batch.failed },
      });
      notify("success", `${restored} document${restored === 1 ? "" : "s"} restored.`);
    } catch (error) {
      if (error.name !== "AbortError") setPortableError(error.message || "Could not restore that backup.");
      if (job) await failBackgroundJob(accountId, job.id, error).catch(() => {});
    } finally {
      if (portableController.current === controller) portableController.current = null;
      setPortableBusy(false);
    }
  };

  const makeShare = async () => {
    if (exportController.current) return;

    const controller = new AbortController();
    exportController.current = controller;
    setBusyExport(true);
    setShareError("");
    setShareProgress({ stage: "uploading", completed: 0, total: shareSelection.length });
    let job = null;

    try {
      const selectedResources = resources.filter((resource) =>
        shareSelection.includes(resource.id)
      );
      job = await createBackgroundJob({
        accountId,
        type: "export",
        totalItems: selectedResources.length,
        totalBytes: selectedResources.reduce((sum, resource) => sum + Number(resource.blob?.size || resource.size || 0), 0),
        checkpoint: { source: "legacy-cloud-share", resourceIds: selectedResources.map((resource) => resource.id) },
      });

      const shareResources = [];

      for (let index = 0; index < selectedResources.length; index += 1) {
        const resource = selectedResources[index];

        // Google Drive documents stay on Google Drive.
        if (resource.driveFileId && resource.driveUrl) {
          shareResources.push(resource);
          continue;
        }

        // Already-uploaded RxCT documents need no re-upload.
        if (resource.cloudItemId) {
          shareResources.push(resource);
          continue;
        }

        // Upload local PDFs to RxCT before sharing.
        if (!resource.blob) {
          throw new Error(
            `${resource.name} is local-only and its PDF is unavailable for automatic upload.`
          );
        }

        setShareProgress({
          stage: "uploading",
          completed: index,
          total: selectedResources.length,
          name: resource.name,
        });
        await updateBackgroundJob(accountId, job.id, {
          stage: "uploading",
          processedItems: index,
          processedBytes: selectedResources.slice(0, index).reduce((sum, item) => sum + Number(item.blob?.size || item.size || 0), 0),
        }).catch(() => {});

        const uploaded = await uploadCloudPdf(
          resource.blob,
          resource.courseId || null,
          {
            last_opened_at: resource.lastOpenedAt || null,
            last_opened_section: resource.lastOpenedSection || "Document",
            progress: resource.progress || {},
          }
        );

        const syncedResource = cloudItemToResource(
          uploaded.item,
          accountId,
          resource
        );

        await saveResource(syncedResource);
        shareResources.push(syncedResource);
      }

await refresh();

const link = await createLibraryShare(shareResources);

if (controller.signal.aborted) return;
      setShareLink(link);
      setShareProgress({ stage: "complete", completed: shareSelection.length, total: shareSelection.length });
      await completeBackgroundJob(accountId, job.id, { processedItems: selectedResources.length });

      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(link);
        notify("success", "Library link created and copied.");
      } catch {
        notify("success", "Library link created. Use Copy link to copy it.");
      }
    } catch (shareFailure) {
      if (controller.signal.aborted) {
        setShareProgress({ stage: "cancel-requested", message: "Export cancelled. Cleaning up completed uploads…" });
      } else {
        setShareError(shareFailure.message || "Could not create the library link.");
        setShareProgress("");
      }
      if (job) await failBackgroundJob(accountId, job.id, shareFailure).catch(() => {});
    } finally {
      if (exportController.current === controller) exportController.current = null;
      setBusyExport(false);
    }
  };

  const importSelected = async () => {
    if (!importPayload?.items?.length || !accountId || !importSelection.length || importController.current) return;

    const controller = new AbortController();
    importController.current = controller;
    setBusyImport(true);
    setImportFeedback({ type: "progress", message: "Preparing import…" });

    const selectedItems = importPayload.items.filter((item) =>
      importSelection.includes(item.id),
    );
    let importedCount = 0;
    const failedFiles = [];
    const unassignedResources = [];
    let job = null;
    const importStartedAt = Date.now();

    const updateProgress = (progress) => {
      const details = typeof progress === "string"
        ? { message: progress }
        : progress || {};
      setImportFeedback({
        type: "progress",
        ...details,
        message: progressLabel(details, "import"),
      });
    };

    try {
      if (importSource === "rxct") {
        job = await createBackgroundJob({
          accountId,
          type: "import",
          totalItems: selectedItems.length,
          totalBytes: selectedItems.reduce((sum, item) => sum + Number(item.size || 0), 0),
          checkpoint: { source: "legacy-cloud-share", itemIds: selectedItems.map((item) => item.id) },
        });
        const cloudSelected = selectedItems.filter((item) => item.type !== "google-drive");
        const driveSelected = selectedItems.filter((item) => item.type === "google-drive");
        const shareToken = importPayload.token || importPayload.items.shareToken;
        const shared = await importCloudShare(
          shareToken,
          cloudSelected.map((item) => item.cloudDocumentId || item.id),
          driveSelected.map((item) => item.driveFileId),
        );
        const sharedItems = (shared.items || []).map((item) => {
          const source = cloudSelected.find((candidate) => candidate.cloudDocumentId === item.document_id);
          return {
            ...item,
            id: item.id || item.document_id,
            name: item.display_name || source?.name || "document.pdf",
            mimeType: item.document?.mime_type || source?.mimeType || "application/pdf",
            type: source ? "rxct" : "google-drive",
            driveFileId: item.drive_file_id,
          };
        });
        const sharedDriveToken = driveSelected.length ? (driveToken || await requestDriveAccess()) : null;
        const batch = await importPdfDocuments({
          accountId,
          items: sharedItems,
          signal: controller.signal,
          loadItem: async (item, signal) => {
            if (item.type === "google-drive") {
              return {
                ...item,
                file: await downloadDrivePdf({ id: item.driveFileId, name: item.name, mimeType: item.mimeType }, sharedDriveToken, signal),
              };
            }
            const opened = await openCloudResource(item.id);
            const response = await fetch(opened.url, { signal });
            if (!response.ok) throw new Error(`Could not download ${item.name}.`);
            const blob = await response.blob();
            return { ...item, file: new File([blob], item.name, { type: "application/pdf", lastModified: Date.now() }) };
          },
          onProgress: (progress) => {
            updateProgress(progress);
            updateBackgroundJob(accountId, job.id, {
              stage: progress.stage,
              processedItems: progress.completed || 0,
              totalItems: sharedItems.length,
            }).catch(() => {});
          },
          onCheckpoint: (checkpoint) => updateBackgroundJob(accountId, job.id, {
            stage: checkpoint.stage,
            checkpoint: { ...job.checkpoint, ...checkpoint },
            processedItems: checkpoint.processed || 0,
          }).catch(() => {}),
          buildResource: (item, contentHash, status) => buildImportedResource(item, contentHash, accountId, status, "shared-library"),
          understand: (resource, pdfBytes) => understandImportedResource(resource, pdfBytes, accountId),
        });
        importedCount = batch.imported;
        failedFiles.push(...batch.failures.map(({ item, error }) => `${item.name}: ${error.message || "could not be imported"}`));
        unassignedResources.push(...batch.resources
          .filter((resource) => !resource.courseId)
          .map((resource) => ({ resource, suggestedCourseId: resource.suggestions?.[0]?.courseId || "" })));

        await completeBackgroundJob(accountId, job.id, {
          processedItems: importedCount,
          checkpoint: { imported: importedCount, failed: failedFiles.length },
        });

        await refresh();

        setImportFeedback({
          type: failedFiles.length ? "success" : "success",
          message: failedFiles.length
            ? `${importedCount} imported; ${failedFiles.length} failed.`
            : `${importedCount} document${importedCount === 1 ? "" : "s"} downloaded and imported successfully.`,
        });
        return;
      }

      const activeDriveToken = driveToken || await requestDriveAccess();
      job = await createBackgroundJob({
        accountId,
        type: "import",
        totalItems: selectedItems.length,
        totalBytes: selectedItems.reduce((sum, item) => sum + Number(item.size || 0), 0),
        checkpoint: { source: "google-drive", itemIds: selectedItems.map((item) => item.id) },
      });

      const batch = await importPdfDocuments({
        accountId,
        items: selectedItems,
        signal: controller.signal,
        loadItem: async (item, signal) => ({
          ...item,
          file: await downloadDrivePdf(item, activeDriveToken, signal),
        }),
        onProgress: (progress) => {
          updateProgress(progress);
          updateBackgroundJob(accountId, job.id, {
            stage: progress.stage,
            processedItems: progress.completed || 0,
            totalItems: progress.total || selectedItems.length,
            processedBytes: progress.uploadedBytes || 0,
            estimatedRemainingSeconds: progress.etaSeconds ?? (() => {
              const processedBytes = progress.uploadedBytes || 0;
              const elapsed = Math.max(1, Date.now() - importStartedAt) / 1000;
              const speed = processedBytes / elapsed;
              const totalBytes = selectedItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
              return speed ? Math.max(0, (totalBytes - processedBytes) / speed) : null;
            })(),
          }).catch(() => {});
        },
        onCheckpoint: (checkpoint) => updateBackgroundJob(accountId, job.id, {
          stage: checkpoint.stage,
          checkpoint: { ...job.checkpoint, ...checkpoint },
          processedItems: checkpoint.processed || 0,
        }).catch(() => {}),
        onDuplicate: async ({ item }, duplicate) => {
          await renameDuplicateResource(accountId, duplicate, item.name);
        },
        buildResource: (item, contentHash, status) => ({
          ...buildImportedResource(item, contentHash, accountId, status, "google-drive"),
          folderPath: item.folderPath || "",
        }),
        understand: (resource, pdfBytes) => understandImportedResource(resource, pdfBytes, accountId),
      });

      importedCount = batch.imported;
      failedFiles.push(...batch.failures.map(({ item, error }) => `${item.name}: ${error.message || "could not be imported"}`));
      unassignedResources.push(...batch.resources
        .filter((resource) => !resource.courseId)
        .map((resource) => ({ resource, suggestedCourseId: resource.suggestions?.[0]?.courseId || "" })));

      await refresh();

      if (unassignedResources.length) {
        setPendingResources((current) => {
          if (!current.length) {
            setPendingCourseId(unassignedResources[0].suggestedCourseId);
          }
          return [...current, ...unassignedResources];
        });
      }

      if (controller.signal.aborted) {
        setImportFeedback({
          type: "success",
          message: `Import cancelled. ${importedCount} of ${selectedItems.length} selected documents completed.`,
        });
      } else if (failedFiles.length) {
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

      await completeBackgroundJob(accountId, job.id, {
        processedItems: selectedItems.length,
        processedBytes: selectedItems.reduce((sum, item) => sum + Number(item.size || 0), 0),
        checkpoint: { imported: importedCount, failed: failedFiles.length },
      });

      setDriveToken("");
    } catch (importError) {
      if (controller.signal.aborted || importError.name === "AbortError") {
        setImportFeedback({
          type: "success",
          message: `Import cancelled. ${importedCount} documents completed.`,
        });
      } else {
        setImportFeedback({
          type: "error",
          message: importError.message || "Could not import those documents.",
        });
      }
      if (job) await failBackgroundJob(accountId, job.id, importError).catch(() => {});
    } finally {
      if (importController.current === controller) importController.current = null;
      setBusyImport(false);
    }
  };

  const levelText = profileLevel > 0 ? `${profileLevel}L` : "";
  const levelLabel = [levelText, profile.semester]
    .filter(Boolean)
    .join(" · ");

  const openUpload = () => {
    if (!uploading) fileInput.current?.click();
  };

  return (
    <div className={styles.page}>
      {toast && (
        <div
          key={toast.id}
          className={`resourceToast resourceToast-${toast.type}${toastClosing ? " resourceToast-closing" : ""}`}
          onTouchStart={(event) => {
            toastTouchStart.current = {
              x: event.touches[0].clientX,
              y: event.touches[0].clientY,
            };
          }}
          onTouchEnd={(event) => {
            if (!toastTouchStart.current) return;
            const dx = event.changedTouches[0].clientX - toastTouchStart.current.x;
            const dy = event.changedTouches[0].clientY - toastTouchStart.current.y;
            toastTouchStart.current = null;
            if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) {
              dismissToast();
            }
          }}
          style={toastPosition ? {
            top: `${toastPosition.top}px`,
            left: "50%",
            right: "auto",
            "--toast-origin-x": `${toastPosition.originX}px`,
            "--toast-origin-y": `${toastPosition.originY}px`,
          } : undefined}
          role={toast.type === "error" ? "alert" : "status"}
        >
          <i className={`fa-solid ${
            toast.type === "error"
              ? "fa-triangle-exclamation"
              : toast.type === "progress"
                ? "fa-spinner fa-spin"
                : "fa-circle-check"
          }`} />
          <span>{toast.message}</span>
          <button type="button" onClick={dismissToast} aria-label="Dismiss notification">
            {!toastClosing && (
              <svg className="resourceToast-countdown" viewBox="0 0 27 27" aria-hidden="true">
                <circle className="resourceToast-countdown-track" cx="13.5" cy="13.5" r="11" />
                <circle className="resourceToast-countdown-progress" cx="13.5" cy="13.5" r="11" />
              </svg>
            )}
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
              {uploading ? "Reading PDFs…" : "Upload documents"}
            </button>
            <span>{levelLabel || "Your course-aware archive"}</span>
          </div>
                    <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={handleFile}
            hidden
          />
        </div>

        <div className={styles.heroAside}>
          <span className={styles.heroLabel}>
            <i className="fa-solid fa-book-open" /> SUGGESTIONS
          </span>
          {suggestedCourses.length ? suggestedCourses.map((course) => (
            <div className={styles.courseSuggestion} key={course.id}>
              <strong>{course.code}</strong>
              <small>{course.title}</small>
            </div>
          )) : (
            <p className={styles.noSuggestions}>
              Course suggestions will appear here.
            </p>
          )}
        </div>
      </section>

      <section className={styles.resumeSection}>
        <div>
          <span className={styles.sectionKicker}>LAST RESOURCE SESSION</span>
          <h2>Pick up where you left off</h2>
          {lastResource
            ? <p><i className="fa-solid fa-file-lines" /> {lastResource.name}</p>
            : <p>Your recent documents will appear here once you open a resource.</p>}
        </div>
        {lastResource && (
          <button className={styles.continueButton} type="button" onClick={() => openResource(lastResource)}>
            Open again <i className="fa-solid fa-arrow-right" />
          </button>
        )}
      </section>

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

        <div ref={tabsRef} className={`${styles.libraryTabs} libraryTabsRoot`} role="tablist" aria-label="Library organization">
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
              resources={organizedResources}
              onOpen={openResource}
            />
          ) : activeTab === "Organized" && activeCourse ? (
            <CourseFolder
              key={`${accountId}:${activeCourse.id}`}
              accountId={accountId}
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
                {[...offeredCourses].sort((a, b) =>
                  String(a.code || "").localeCompare(String(b.code || ""), undefined, {
                    numeric: true,
                    sensitivity: "base",
                  })
                ).map((course) => {
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
          <i className="fa-solid fa-cloud-arrow-up" /> Upload documents
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

      <section className="resourceClearAllSection" aria-label="Library maintenance">
        <div>
          <strong>Clear all resources</strong>
          <p>Remove this account's resource entries from this device and cloud library.</p>
        </div>
        <button
          type="button"
          className="resourceClearAllTrigger"
          onClick={openClearAll}
          disabled={!resources.length || clearingAll}
        >
          Clear library
        </button>
      </section>

      {clearAllOpen && (
        <div className={styles.modalBackdrop}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="clear-all-resources-title">
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.sectionKicker}>DESTRUCTIVE ACTION</span>
                <h2 id="clear-all-resources-title">Clear all resources?</h2>
              </div>
            </div>
            <p className={styles.modalIntro}>
              This will remove <strong>{resources.length} resource{resources.length === 1 ? "" : "s"}</strong> from your account's library and this device. This cannot be undone.
            </p>
            <p className="resourceClearAllNote">
              Original shared PDFs, other users' copies, shared access, Jotters and course descriptions will not be deleted.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className="resourceDeleteAction"
                onClick={clearAllResources}
                disabled={clearCountdown > 0 || clearingAll}
              >
                {clearingAll ? "Clearing…" : clearCountdown > 0 ? `Wait ${clearCountdown}s` : "Clear all resources"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => { setClearAllOpen(false); setClearCountdown(3); }}
                disabled={clearingAll}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingResource && (
        <CoursePrompt
          resource={pendingResource}
          selectedCourseId={pendingCourseId}
          setSelectedCourseId={setPendingCourseId}
          suggestions={pendingResource.suggestions || []}
          queueCount={pendingResources.length}
          onAssign={() => assignResource(pendingResource, pendingCourseId)}
          onSkip={skipCourseAssignment}
          onSkipAll={skipAllCourseAssignments}
        />
      )}

      {removeTarget && (
        <div className={styles.modalBackdrop}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="remove-resource-title">
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.sectionKicker}>REMOVE DOCUMENT</span>
                <h2 id="remove-resource-title">Remove this document?</h2>
              </div>
            </div>
            <p className={styles.modalIntro}>
              <strong>{removeTarget.name}</strong> will be removed from this account's library. This cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className="resourceDeleteAction" onClick={confirmDeleteResource}>Remove document</button>
              <button type="button" className={styles.secondaryButton} onClick={() => setRemoveTarget(null)}>Keep document</button>
            </div>
          </section>
        </div>
      )}

      {shareOpen && (
        <ShareDialog
          resources={resources}
          selection={shareSelection}
          setSelection={setShareSelection}
          link={shareLink}
          error={shareError}
          busy={busyExport && shareProgress?.stage !== "cancel-requested"}
          progress={shareProgress}
          onCreate={makeShare}
          onCopy={async () => {
            if (!shareLink || !navigator.clipboard?.writeText) {
              throw new Error("Clipboard access is unavailable.");
            }
            await navigator.clipboard.writeText(shareLink);
          }}
          onClose={() => {
            if (busyExport && shareProgress?.stage !== "cancel-requested") {
              exportController.current?.abort();
              setShareProgress({ stage: "cancel-requested", message: "Cancellation requested. Stopping queued uploads and cleaning up…" });
              return;
            }
            setShareOpen(false);
          }}
        />
      )}

      {portableOpen && (
        <PortableDialog
          resources={resources}
          selection={portableSelection}
          setSelection={setPortableSelection}
          link={portableLink}
          payload={portablePayload}
          restoreSelection={portableRestoreSelection}
          setRestoreSelection={setPortableRestoreSelection}
          progress={portableProgress}
          error={portableError}
          busy={portableBusy}
          onCreate={createPortableBackup}
          onLoad={loadPortableBackup}
          onRestore={restorePortableBackup}
          onClose={() => {
            if (portableBusy) {
              portableController.current?.abort();
              return;
            }
            setPortableOpen(false);
          }}
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
          busy={busyImport && importFeedback?.stage !== "cancel-requested"}
          loading={busyImportLoad && importFeedback?.stage !== "cancel-requested"}          feedback={importFeedback}
          onLoad={async () => {
            if (loadController.current) return;
            const controller = new AbortController();
            loadController.current = controller;
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
                if (controller.signal.aborted) return;
                setDriveToken(token);
                payload = await listDrivePdfs(importUrl, token, (progress) => {
                  setImportFeedback({
                    type: "progress",
                    ...progress,
                    message: progressLabel(progress),
                  });
                }, controller.signal);
              } else {
                const token = getShareTokenFromInput(importUrl);
                payload = await resolveLibraryShare(token, (progress) => {
                  setImportFeedback({
                    type: "progress",
                    ...progress,
                    message: progressLabel(progress),
                  });
                }, controller.signal);
              }
              if (controller.signal.aborted) return;

              setImportPayload(payload);
              setImportSelection((payload.items || []).map((item) => item.id));
              setImportFeedback({
                type: "success",
                message: `${payload.items.length} document${payload.items.length === 1 ? "" : "s"} ready to import.`,
              });
            } catch (loadError) {
              if (!controller.signal.aborted) {
                setDriveToken("");
                setImportFeedback({
                  type: "error",
                  message: loadError.message || "That link could not be opened.",
                });
              }
            } finally {
              if (loadController.current === controller) loadController.current = null;
              setBusyImportLoad(false);
            }
          }}
          onImport={importSelected}
          onClose={() => {
            if (busyImport && importFeedback?.stage !== "cancel-requested") {
              importController.current?.abort();
              setImportFeedback({
                type: "progress",
                stage: "cancel-requested",
                message: "Cancellation requested. Stopping queued documents; finishing the active document safely…",
              });
              return;
            }
            if (busyImportLoad && importFeedback?.stage !== "cancel-requested") {
              loadController.current?.abort();
              setImportFeedback({
                type: "progress",
                stage: "cancel-requested",
                message: "Cancellation requested. Stopping the current Drive or link request…",
              });
              return;
            }
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
          key={`${resource.id}-${resource.courseId || "unassigned"}`}
          resource={resource}
          onOpen={onOpen}
          onAssign={onAssign}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function CourseFolder({ accountId, course, resources, description, onBack, onSaveDescription, onOpen, onAssign, onDelete }) {
  const [draft, setDraft] = useState(description);
  const [tasks, setTasks] = useState(() => getStudyTasks(accountId, course.id));
  const [actionTaskId, setActionTaskId] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState(null);
  const [taskMessage, setTaskMessage] = useState("");
  const holdTimer = useRef(null);

  const finishBrainTask = (taskId) => {
    try {
      setTasks(completeStudyTask(accountId, course.id, taskId));
    } catch (error) {
      console.error("Could not update reminder:", error);
    }
  };

  const removeBrainTask = () => {
    if (!pendingDeleteTaskId) return;
    try {
      setTasks(deleteStudyTask(accountId, course.id, pendingDeleteTaskId));
      setPendingDeleteTaskId(null);
      setActionTaskId(null);
      setTaskMessage("");
    } catch (error) {
      console.error("Could not delete reminder:", error);
      setTaskMessage(error.message || "Could not delete this reminder.");
    }
  };

  const editBrainTask = (task) => {
    setEditingTaskId(task.id);
    setEditDraft(task.sourceText || task.title);
    setActionTaskId(null);
  };

  const saveBrainEdit = (event, task) => {
    event.preventDefault();
    const text = editDraft.trim();
    if (!text) {
      setTaskMessage("Enter a reminder before saving.");
      return;
    }

    const interpreted = interpretStudyIntent(text);

    try {
      const updatedTask = {
        ...task,
        ...(interpreted || {}),
        id: task.id,
        title: interpreted?.title || text,
        sourceText: text,
        type: interpreted?.type || task.type,
        dueAt: interpreted?.dueAt || task.dueAt || "",
        completed: task.completed,
      };

      setTasks(saveStudyTask(accountId, course.id, updatedTask));
      setEditingTaskId(null);
      setEditDraft("");
      setActionTaskId(null);
    } catch (error) {
      console.error("Could not edit reminder:", error);
      setTaskMessage(error.message || "Could not save this reminder.");
    }
  };

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
      <section className="resourceUsefulPanel">
      <form
        className="resourceDescriptionForm"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveDescription(course.id, draft);

          try {
            const interpreted = interpretStudyIntent(draft);
            if (interpreted) {
              setTasks([...saveStudyTask(accountId, course.id, interpreted)]);
            }
          } catch (error) {
            console.error("Could not interpret course information:", error);
          }
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
      {tasks.length > 0 && (
        <div className="resourceBrainTasks">
          {tasks.map((task) => (
            <div
              className={`resourceBrainTask${task.completed ? " isCompleted" : ""}`}
              key={task.id}
              onContextMenu={(event) => {
                event.preventDefault();
                setActionTaskId(task.id);
              }}
              onTouchStart={() => {
                holdTimer.current = setTimeout(() => setActionTaskId(task.id), 550);
              }}
              onTouchEnd={() => clearTimeout(holdTimer.current)}
              onTouchMove={() => clearTimeout(holdTimer.current)}
            >
              {editingTaskId === task.id ? (
                <form className="resourceBrainEdit" onSubmit={(event) => saveBrainEdit(event, task)}>
                  <input
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    aria-label="Edit reminder"
                    maxLength={240}
                    autoFocus
                  />
                  <button type="submit">Save</button>
                  <button type="button" onClick={() => setEditingTaskId(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="resourceBrainComplete"
                    onClick={() => finishBrainTask(task.id)}
                    disabled={task.completed}
                    aria-label={task.completed ? "Task completed" : "Mark task complete"}
                  >
                    <i className={`fa-solid ${task.completed ? "fa-check-circle" : "fa-circle"}`} />
                  </button>
                  <div className="resourceBrainTaskContent">
                    <strong>{task.title}</strong>
                    <span>
                      {task.type === "assessment" ? "Assessment" : task.type === "study" ? "Study task" : "Reminder"}
                      {task.dueAt && ` · Due ${new Date(`${task.dueAt}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`}
                    </span>
                    {actionTaskId === task.id && (
                      <div className="resourceBrainActions">
                        <button type="button" onClick={() => editBrainTask(task)}>
                          <i className="fa-regular fa-pen-to-square" /> Edit
                        </button>
                        <button type="button" onClick={() => { setPendingDeleteTaskId(task.id); setActionTaskId(null); setTaskMessage(""); }}>
                          <i className="fa-regular fa-trash-can" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="resourceBrainMore"
                    onClick={() => setActionTaskId(actionTaskId === task.id ? null : task.id)}
                    aria-label="Reminder actions"
                    title="Reminder actions"
                  >
                    <i className="fa-solid fa-ellipsis-vertical" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
        {taskMessage && (
          <p className="resourceTaskMessage" role="status">{taskMessage}</p>
        )}

        {pendingDeleteTaskId && (
          <div className="resourceConfirmBackdrop" onClick={() => setPendingDeleteTaskId(null)}>
            <div
              className="resourceConfirmDialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="resource-confirm-title"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="resourceConfirmIcon"><i className="fa-regular fa-trash-can" /></span>
              <h4 id="resource-confirm-title">Delete this reminder?</h4>
              <p>This reminder will be permanently removed from this course.</p>
              <div className="resourceConfirmActions">
                <button type="button" onClick={() => setPendingDeleteTaskId(null)}>Cancel</button>
                <button type="button" className="isDanger" onClick={removeBrainTask}>Delete reminder</button>
              </div>
            </div>
          </div>
        )}
      </section>
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

function CoursePrompt({ resource, selectedCourseId, setSelectedCourseId, suggestions, queueCount, onAssign, onSkip, onSkipAll }) {
  return (
    <div className={styles.modalBackdrop}>
      <section className={`${styles.modal} resourceCoursePrompt`} role="dialog" aria-modal="true" aria-labelledby="course-prompt-title">
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.sectionKicker}>COURSE ORGANIZATION · {queueCount} UNASSIGNED</span>
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
          <button type="button" className={styles.secondaryButton} onClick={onSkip}>Skip this</button>
          <button type="button" className={styles.secondaryButton} onClick={onSkipAll}>Skip all</button>
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
      {courses.length ? [...courses].sort((a, b) =>
        String(a.code || "").localeCompare(String(b.code || ""), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      ).map((course) => {
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
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [courseSearch, setCourseSearch] = useState("");
  const assignmentRef = useRef(null);

  useEffect(() => {
    if (!assignmentOpen) return;

    const handleOutsideTap = (event) => {
      if (!assignmentRef.current?.contains(event.target)) {
        setAssignmentOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleOutsideTap);
    return () => document.removeEventListener("pointerdown", handleOutsideTap);
  }, [assignmentOpen]);

  const suggestions = resource.suggestions || [];
  const normalizedCourseSearch = courseSearch.trim().toLowerCase();

  const matchesCourse = (course) =>
    `${course.code} ${course.title}`.toLowerCase().includes(normalizedCourseSearch);

  const suggestedCourses = suggestions
    .map((suggestion) =>
      OAU_PHARMD_COURSES.find((course) => course.id === suggestion.courseId)
    )
    .filter((course, index, list) =>
      course && matchesCourse(course) &&
      list.findIndex((item) => item?.id === course.id) === index
    );

  const suggestedCourseIds = new Set(
    suggestedCourses.map((course) => course.id)
  );

  const otherCourses = OAU_PHARMD_COURSES.filter(
    (course) => !suggestedCourseIds.has(course.id) && matchesCourse(course)
  );

  const selectedCourse = OAU_PHARMD_COURSES.find(
    (course) => course.id === courseId
  );

  const hasDriveSource = Boolean(resource.driveUrl);
  const hasOpenSource = Boolean(
    resource.blob || resource.cloudItemId || hasDriveSource,
  );

  return (
    <article className={styles.resourceCard}>
      <span className={`${styles.resourceIcon} ${resource.courseId ? styles.green : styles.orange}`}>
        <i className="fa-solid fa-file-pdf" />
      </span>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.fileType}>PDF · {resource.pageCount || "?"} pages</span>
          <span className={styles.cardUpdated}>
            <i className={`fa-solid ${
              hasDriveSource
                ? "fa-cloud"
                : resource.cloudItemId
                  ? "fa-cloud"
                  : "fa-hard-drive"
            }`} />
            {hasDriveSource
              ? "Google Drive"
              : resource.cloudItemId
                ? "Cloud saved"
                : "Local only"}
          </span>
        </div>

        <h4>{resource.name}</h4>
        <p>
          {resource.course
            ? <><i className="fa-solid fa-layer-group" /> {resource.course.code} · {resource.course.title}</>
            : "Needs a course assignment"}
        </p>
        {resource.curriculumStatus === "outside-current-curriculum" && (
          <small className={styles.cardUpdated}>Outside current curriculum · All Documents</small>
        )}
        {resource.curriculumStatus === "curriculum-mapping-unavailable" && resource.courseId && (
          <small className={styles.cardUpdated}>Curriculum placement unavailable · All Documents</small>
        )}

        <div className={styles.cardActions}>
          <button
            className={styles.openButton}
            type="button"
            disabled={!hasOpenSource}
            onClick={() => onOpen(resource)}
          >
            <i className="fa-solid fa-file-arrow-up" />
            {hasOpenSource ? "Open document" : "Source unavailable"}
          </button>
          <button
            className={styles.deleteButton}
            type="button"
            onClick={() => onDelete(resource)}
          >
            <i className="fa-solid fa-trash" /> Remove
          </button>
        </div>

        <div className={styles.assignment} ref={assignmentRef}>
          <button
            className={styles.assignmentTrigger}
            type="button"
            aria-expanded={assignmentOpen}
            onClick={() => {
              setCourseSearch("");
              setAssignmentOpen(true);
            }}
          >
            <span>{resource.courseId ? "Change course" : "Assign a course"}</span>
            <i className="fa-solid fa-chevron-down" aria-hidden="true" />
          </button>

          {assignmentOpen && (
            <div
              className={`${styles.modalBackdrop} ${styles.courseAssignmentBackdrop}`}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setAssignmentOpen(false);
                  setCourseSearch("");
                }
              }}
            >
              <section
                className={`${styles.modal} ${styles.courseAssignmentModal}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`course-assignment-title-${resource.id}`}
              >
                <div className={styles.modalHeader}>
                  <div>
                    <span className={styles.sectionKicker}>RESOURCE ORGANIZATION</span>
                    <h2 id={`course-assignment-title-${resource.id}`}>
                      {resource.courseId ? "Change course" : "Assign a course"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={() => {
                      setAssignmentOpen(false);
                      setCourseSearch("");
                    }}
                    aria-label="Close course picker"
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>

                <p className={styles.modalIntro}>
                  Choose the course for <strong>{resource.name}</strong>.
                </p>

                <div className={styles.coursePicker}>
                  <label className={styles.coursePickerSearch}>
                    <i className="fa-solid fa-magnifying-glass" />
                    <input
                      type="search"
                      value={courseSearch}
                      onChange={(event) => setCourseSearch(event.target.value)}
                      placeholder="Search course code or title"
                      aria-label={`Search courses for ${resource.name}`}
                    />
                  </label>

                  <div className={styles.coursePickerList}>
                    {suggestedCourses.length > 0 && (
                      <div className={styles.coursePickerGroup}>
                        <span className={styles.coursePickerHeading}>
                          Suggested for this document
                        </span>

                        {suggestedCourses.map((course) => {
                          const suggestion = suggestions.find(
                            (item) => item.courseId === course.id
                          );

                          return (
                          <button
                            type="button"
                            key={`suggested-${course.id}`}
                            className={`${styles.coursePickerOption} ${
                              courseId === course.id ? styles.coursePickerSelected : ""
                            }`}
                            aria-pressed={courseId === course.id}
                            onClick={() => setCourseId(course.id)}
                          >
                            <span>
                              <strong>{course.code}</strong>
                              <small>{course.title}</small>
                            </span>
                            <span className={styles.coursePickerMeta}>
                              {suggestion?.score != null && (
                                <small>{formatConfidence(suggestion.score * 100)} match</small>
                              )}
                              {courseId === course.id && (
                                <i className="fa-solid fa-check" />
                              )}
                            </span>
                          </button>
                          );
                        })}
                      </div>
                    )}

                    <div className={styles.coursePickerGroup}>
                      <span className={styles.coursePickerHeading}>
                        {suggestedCourses.length ? "Other courses" : "All courses"}
                      </span>

                      {otherCourses.map((course) => (
                        <button
                          type="button"
                          key={course.id}
                          className={`${styles.coursePickerOption} ${
                            courseId === course.id ? styles.coursePickerSelected : ""
                          }`}
                          aria-pressed={courseId === course.id}
                          onClick={() => setCourseId(course.id)}
                        >
                          <span>
                            <strong>{course.code}</strong>
                            <small>{course.title}</small>
                          </span>
                          {courseId === course.id && (
                            <i className="fa-solid fa-check" />
                          )}
                        </button>
                      ))}

                      {!suggestedCourses.length && !otherCourses.length && (
                        <p className={styles.coursePickerEmpty}>
                          No matching courses found.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className={styles.coursePickerFooter}>
                    <span>
                      {selectedCourse
                        ? `${selectedCourse.code} selected`
                        : "Choose a course"}
                    </span>
                    <button
                      className={styles.assignButton}
                      type="button"
                      disabled={!courseId || courseId === resource.courseId}
                      onClick={() => {
                        onAssign(resource, courseId);
                        setAssignmentOpen(false);
                        setCourseSearch("");
                      }}
                    >
                      {resource.courseId ? "Save" : "Assign"}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
function PortableDialog({ resources, selection, setSelection, link, payload, restoreSelection, setRestoreSelection, progress, error, busy, onCreate, onLoad, onRestore, onClose }) {
  const [token, setToken] = useState("");
  const items = payload?.items || [];
  const allSelected = resources.length > 0 && resources.every((resource) => selection.includes(resource.id));
  const allRestoreSelected = items.length > 0 && items.every((item) => restoreSelection.includes(item.content_hash));
  const selectedBytes = resources
    .filter((resource) => selection.includes(resource.id) && resource.blob)
    .reduce((sum, resource) => sum + resource.blob.size, 0);
  const restoreBytes = items
    .filter((item) => restoreSelection.includes(item.content_hash))
    .reduce((sum, item) => sum + item.file_size, 0);

  const toggle = (id) => setSelection((current) => current.includes(id)
    ? current.filter((item) => item !== id)
    : [...current, id]);
  const toggleRestore = (hash) => setRestoreSelection((current) => current.includes(hash)
    ? current.filter((item) => item !== hash)
    : [...current, hash]);

  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="portable-title">
        <div className={styles.modalHeader}>
          <div><span className={styles.sectionKicker}>PORTABLE LIBRARY</span><h2 id="portable-title">Share or restore library</h2></div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
        </div>
        <p className={styles.modalIntro}>Portable packages preserve PDFs and document metadata. Share links expire after seven days of inactivity.</p>
        {error && <div className="shareError" role="alert"><strong>Backup unavailable</strong><p>{error}</p></div>}
        {progress && (
          <div className={styles.modalFeedback} role="status">
            <span>{progress.name ? `${progress.stage === "downloading" ? "Restoring" : "Uploading"} ${progress.name}` : progressLabel(progress, "export")}</span>
            {progress.totalBytes > 0 && (
              <small>{formatBytes(progress.uploadedBytes || 0)} of {formatBytes(progress.totalBytes)}
                {progress.speedBytesPerSecond ? ` · ${formatBytes(progress.speedBytesPerSecond)}/s` : ""}
                {progress.etaSeconds ? ` · about ${Math.ceil(progress.etaSeconds)}s left` : ""}
              </small>
            )}
            {progress.total > 0 && <progress value={progress.completed || 0} max={progress.total} aria-label="Backup progress" style={{ display: "block", width: "100%", marginTop: 9 }} />}
          </div>
        )}
        <div className={styles.selectionActions}>
          <span>{selection.filter((id) => resources.some((resource) => resource.id === id)).length} selected · {formatBytes(selectedBytes)}</span>
          <label className="selectAllCheckbox">
            <input type="checkbox" checked={allSelected} disabled={busy} onChange={(event) => setSelection(event.target.checked ? resources.map((resource) => resource.id) : [])} />
            <span>Select all</span>
          </label>
        </div>
        <div className={styles.modalList}>
          {resources.map((resource) => (
            <label key={resource.id}>
              <input type="checkbox" checked={selection.includes(resource.id)} disabled={!resource.blob || busy} onChange={() => toggle(resource.id)} />
              <span>{resource.name}</span>
              <small>{resource.blob ? `${Math.round((resource.blob.size || 0) / 1024)} KB` : "PDF unavailable"}</small>
            </label>
          ))}
        </div>
        <div className={styles.importUrl}>
          <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste backup link or token to restore" aria-label="Portable backup link" />
          <button type="button" className={styles.secondaryButton} disabled={!token.trim() || busy} onClick={() => onLoad(token.trim())}>Load package</button>
        </div>
        {items.length > 0 && (
          <>
            <div className={styles.selectionActions}>
              <span>{restoreSelection.length} of {items.length} selected · {formatBytes(restoreBytes)}</span>
              <label className="selectAllCheckbox">
                <input type="checkbox" checked={allRestoreSelected} disabled={busy} onChange={(event) => setRestoreSelection(event.target.checked ? items.map((item) => item.content_hash) : [])} />
                <span>Select all</span>
              </label>
            </div>
            <div className={styles.modalList}>
              {items.map((item) => (
                <label key={item.content_hash}>
                  <input type="checkbox" checked={restoreSelection.includes(item.content_hash)} disabled={busy} onChange={() => toggleRestore(item.content_hash)} />
                  <span>{item.display_name}</span>
                  <small>
                    {Math.round(item.file_size / 1024)} KB
                    {item.text || item.course_id || item.course ? " · intelligence included" : " · PDF only"}
                  </small>
                </label>
              ))}
            </div>
          </>
        )}
        {link && <div className={styles.shareResult}><input readOnly value={link} aria-label="Portable backup link" /></div>}
        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>{busy ? "Cancel" : "Close"}</button>
          {items.length > 0 && <button type="button" className={styles.secondaryButton} disabled={!restoreSelection.length || busy} onClick={onRestore}>{busy ? "Restoring…" : `Restore ${restoreSelection.length}`}</button>}
          <button type="button" className={styles.primaryAction} disabled={!selection.some((id) => resources.find((resource) => resource.id === id)?.blob) || busy} onClick={onCreate}>{busy ? "Creating…" : `Create package (${selection.length})`}</button>
        </div>
      </section>
    </div>
  );
}

function ShareDialog({ resources, selection, setSelection, link, error, busy, progress, onCreate, onCopy, onClose }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await onCopy();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const toggle = (id) => setSelection((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
  );
    const orderedResources = [...resources].sort(
    (a, b) =>
      Number(selection.includes(b.id)) -
      Number(selection.includes(a.id))
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
            {link && <button type="button" className={`copyIconButton${copied ? " isCopied" : ""}`} onClick={copyLink} aria-label={copied ? "Link copied" : "Copy library link"}><i className={copied ? "fa-solid fa-check" : "fa-regular fa-copy"} /></button>}
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
          </div>
        </div>
        <p className={styles.modalIntro}>RxCT documents use temporary library links. Google Drive documents share their original Drive link; access follows Google Drive permissions.</p>
        {error && <div className="shareError" role="alert"><strong>Export could not be created</strong><p>{error}</p></div>}
        {progress && (
          <div className={styles.modalFeedback} role="status">
            {busy && <i className="fa-solid fa-spinner fa-spin" />}
            <span>{typeof progress === "string" ? progress : progressLabel(progress, "export")}</span>
            {progress.total > 0 && (
              <progress
                value={progress.completed || 0}
                max={progress.total}
                aria-label="Export progress"
                style={{ display: "block", width: "100%", marginTop: 9 }}
              />
            )}
          </div>
        )}
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
         {orderedResources.map((resource) => (
            <label key={resource.id}>
              <input type="checkbox" checked={selection.includes(resource.id)} onChange={() => toggle(resource.id)} />
              <span>{resource.name}</span>
              <small>{resource.course?.code || "Unorganized"}</small>
            </label>
          ))}
        </div>
        {link && <div className={styles.shareResult}><input readOnly value={link} aria-label="Library share link" /><button type="button" className="copyTextButton" onClick={copyLink}>{copied ? "Copied ✓" : "Copy link"}</button></div>}
        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>{busy ? "Cancel export" : "Close"}</button>
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

function ImportDialog({ payload, source, setSource, selection, setSelection, url, setUrl, busy, loading, feedback, onLoad, onImport, onClose }) {
  const items = payload?.items || [];
  const allSelected = items.length > 0 && items.every((item) => selection.includes(item.id));
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
          <button type="button" className={source === "rxct" ? styles.primaryAction : styles.secondaryButton} disabled={busy || loading} onClick={() => setSource("rxct")}>RxCT link</button>
          <button type="button" className={source === "drive" ? styles.primaryAction : styles.secondaryButton} disabled={busy || loading} onClick={() => setSource("drive")}>Google Drive</button>
        </div>
        <p className={styles.modalIntro}>
          {source === "drive"
            ? "Paste a Google Drive PDF, file, or folder link. Sign in to Google when prompted."
            : "Paste an RxCT library link. Select the documents you want to import."}
        </p>
        <div className={styles.importUrl}>
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={source === "drive" ? "Paste Google Drive link" : "Paste library link"} aria-label={source === "drive" ? "Google Drive link" : "Library link"} />
          <button type="button" className={styles.secondaryButton} disabled={!url.trim() || busy || loading} onClick={onLoad}>{loading ? "Loading…" : "Load"}</button>
        </div>
        {items.length > 0 && (
          <div className={styles.selectionActions}>
            <span>{selection.length} of {items.length} selected</span>
            <label className="selectAllCheckbox">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={busy}
                onChange={(event) => setSelection(
                  event.target.checked ? items.map((item) => item.id) : []
                )}
              />
              <span>Select all</span>
            </label>
          </div>
        )}
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
            {feedback.total > 0 && (
              <progress
                value={feedback.completed || 0}
                max={feedback.total}
                aria-label="Import progress"
                style={{ display: "block", width: "100%", marginTop: 9 }}
              />
            )}
          </div>
        )}
        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>{busy ? "Cancel import" : loading ? "Cancel loading" : "Close"}</button>
          <button type="button" className={styles.primaryAction} disabled={!items.length || !selection.length || busy || loading} onClick={onImport}>
            {busy ? "Importing…" : `Import ${selection.length} document${selection.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </section>
    </div>
  );
}

export default Resources;
