import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import { getSelectedCourses } from "../services/courseSelection";
import { getCoursesForProfile, OAU_PHARMD_COURSES } from "../data/oauPharmdCourses";
import {
  extractPdfText,
  fingerprint,
  hashPdfContent,
  findDuplicateResource,
  renameDuplicateResource,
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
  deleteCloudResource,
  listCloudResources,
  openCloudResource,
  updateCloudResource,
  uploadCloudPdf,
} from "../services/cloudResources";
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

function Resources() {
  const { user } = useAuth();
  const fileInput = useRef(null);
  const [resources, setResources] = useState([]);
  const [activeTab, setActiveTab] = useState("Organized");
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(null);
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
  const exportController = useRef(null);
  const importController = useRef(null);
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

  useEffect(() => {
    preloadDriveAuthorization().catch((error) => {
      console.warn("Google Drive authorization preload failed:", error);
    });
  }, []);

  const refresh = async () => {
    if (!accountId) return;
    const [localItems, descriptions] = await Promise.all([
      getResources(accountId),
      Promise.resolve(getCourseDescriptions(accountId)),
    ]);
    let items = localItems;
    try {
      const cloud = await listCloudResources();
      const byHash = new Map(localItems.filter((item) => item.contentHash).map((item) => [item.contentHash, item]));
      const byCloudId = new Map(localItems.filter((item) => item.cloudItemId).map((item) => [item.cloudItemId, item]));
      const cloudItems = (cloud.items || []).map((item) => cloudItemToResource(
        item,
        accountId,
        byCloudId.get(item.id) || byHash.get(item.document?.content_hash),
      ));
      const cloudIds = new Set(cloudItems.map((item) => item.cloudItemId));
      const localOnly = localItems.filter((item) => !item.cloudItemId || !cloudIds.has(item.cloudItemId));
      items = [...cloudItems, ...localOnly];
      await Promise.all(cloudItems.map((item) => saveResource(item).catch(() => {})));
    } catch (cloudError) {
      notify("progress", "Cloud library unavailable. Showing your offline library.");
    }
    setResources(items);
    setCourseDescriptions(descriptions);
  };

  useEffect(() => {
    if (!accountId) return undefined;
    let active = true;

    refresh().catch((loadError) => {
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

    let saved = 0;
    let duplicates = 0;
    let failed = 0;
    const newlyPending = [];

    try {
      for (let index = 0; index < validFiles.length; index += 1) {
        const file = validFiles[index];

        notify(
          "progress",
          `Processing ${index + 1} of ${validFiles.length}: ${file.name}`,
        );

        try {
          const contentHash = await hashPdfContent(file);
          const duplicate = await findDuplicateResource(accountId, contentHash);

          if (duplicate) {
            if (duplicate.cloudItemId) {
              await updateCloudResource(duplicate.cloudItemId, {
                display_name: file.name,
              });
            }

            await renameDuplicateResource(accountId, duplicate, file.name);
            duplicates += 1;
            continue;
          }

          const { text, pageCount } = await extractPdfText(file);
          const documentFingerprint = await fingerprint(file, text);
          const recognition = recognizeCourse(text, OAU_PHARMD_COURSES);

          const learned = getRememberedCorrection(
            accountId,
            documentFingerprint,
            text,
          );

          const learnedCourse = learned
            ? OAU_PHARMD_COURSES.find(
                (course) => course.id === learned.courseId,
              )
            : null;

          const assignedCourse =
            learnedCourse ||
            (recognition.highConfidence ? recognition.best?.course : null);

          const now = new Date().toISOString();

          const resource = {
            id: `${accountId}-${documentFingerprint}`,
            accountId,
            fingerprint: documentFingerprint,
            contentHash,
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
              : assignedCourse
                ? "auto"
                : "unassigned",
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

          let cloudItem = null;

          try {
            const cloudResult = await uploadCloudPdf(
              file,
              assignedCourse?.id || null,
              {
                last_opened_section: "Document",
                progress: {},
              },
            );
            cloudItem = cloudResult.item;
          } catch (cloudError) {
            notify(
              "progress",
              `${file.name}: cloud upload unavailable; saving locally.`,
            );
          }

          const savedResource = cloudItem
            ? cloudItemToResource(cloudItem, accountId, resource)
            : resource;

          await saveResource(savedResource);
          saved += 1;

          if (!assignedCourse) {
            newlyPending.push({
              resource: savedResource,
              suggestedCourseId: recognition.best?.course?.id || "",
            });
          }
        } catch (fileError) {
          failed += 1;
          console.error(`Failed to import ${file.name}:`, fileError);
        }
      }

      if (newlyPending.length) {
        setPendingResources((current) => [...current, ...newlyPending]);

        if (!pendingResources.length) {
          setPendingCourseId(newlyPending[0].suggestedCourseId);
        }
      }

      await refresh();

      const summary = [
        `${saved} saved`,
        `${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped`,
        ...(failed ? [`${failed} failed`] : []),
        ...(unsupported ? [`${unsupported} unsupported file${unsupported === 1 ? "" : "s"} skipped`] : []),
      ].join(" · ");

      if (saved > 0) {
        notify("success", `Import complete: ${summary}.`);
      } else if (failed || unsupported) {
        notify("error", `No PDFs were saved: ${summary}.`);
      } else {
        notify("success", `Import complete: ${summary}.`);
      }
    } finally {
      setUploading(false);
    }
  };
    let savedCount = 0;
    let duplicateCount = 0;
    const failures = [];
    const unassignedResources = [];

    try {
      for (let index = 0; index < validFiles.length; index += 1) {
        const file = validFiles[index];

        notify(
          "progress",
          `Processing ${index + 1} of ${validFiles.length}: ${file.name}`,
        );

        try {
          const contentHash = await hashPdfContent(file);
          const duplicate = await findDuplicateResource(
            accountId,
            contentHash,
          );

          if (duplicate) {
            if (duplicate.cloudItemId) {
              await updateCloudResource(duplicate.cloudItemId, {
                display_name: file.name,
              });
            }

            await renameDuplicateResource(
              accountId,
              duplicate,
              file.name,
            );

            duplicateCount += 1;
            continue;
          }

          const { text, pageCount } = await extractPdfText(file);
          const documentFingerprint = await fingerprint(file, text);

          const recognition = recognizeCourse(
            text,
            OAU_PHARMD_COURSES,
          );

          const learned = getRememberedCorrection(
            accountId,
            documentFingerprint,
            text,
          );

          const learnedCourse = learned
            ? OAU_PHARMD_COURSES.find(
                (course) => course.id === learned.courseId,
              )
            : null;

          const assignedCourse =
            learnedCourse ||
            (recognition.highConfidence
              ? recognition.best?.course
              : null);

          const now = new Date().toISOString();

          const resource = {
            id: `${accountId}-${documentFingerprint}`,
            accountId,
            fingerprint: documentFingerprint,
            contentHash,
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
              : assignedCourse
                ? "auto"
                : "unassigned",
            confidence: learned
              ? Math.round(learned.confidence * 100)
              : recognition.confidence,
            suggestions: recognition.suggestions.map(
              ({ course, score }) => ({
                courseId: course.id,
                score,
              }),
            ),
            createdAt: now,
            updatedAt: now,
          };

          let cloudItem = null;

          try {
            const cloudResult = await uploadCloudPdf(
              file,
              assignedCourse?.id || null,
              {
                last_opened_section: "Document",
                progress: {},
              },
            );

            cloudItem = cloudResult.item;
          } catch (cloudError) {
            console.warn(
              `Cloud upload failed for ${file.name}:`,
              cloudError,
            );
          }

          const savedResource = cloudItem
            ? cloudItemToResource(
                cloudItem,
                accountId,
                resource,
              )
            : resource;

          await saveResource(savedResource);

          savedCount += 1;

          if (!assignedCourse) {
            unassignedResources.push({
              resource: savedResource,
              suggestedCourseId:
                recognition.best?.course?.id || "",
            });
          }
        } catch (fileError) {
          failures.push(
            `${file.name}: ${fileError.message || "Could not process this file."}`,
          );
        }
      }

      await refresh();

      if (unassignedResources.length) {
        if (!pendingResources.length) {
          setPendingCourseId(
            unassignedResources[0].suggestedCourseId,
          );
        }

        setPendingResources((current) => [
          ...current,
          ...unassignedResources,
        ]);
      }

      const summary = [
        `${savedCount} saved`,
        duplicateCount ? `${duplicateCount} duplicates skipped` : "",
        failures.length ? `${failures.length} failed` : "",
        invalidCount ? `${invalidCount} unsupported files skipped` : "",
      ].filter(Boolean).join(" · ");

      if (failures.length || invalidCount) {
        notify(
          savedCount || duplicateCount ? "success" : "error",
          `${summary}${failures.length ? `. ${failures.slice(0, 2).join("; ")}` : ""}`,
        );
      } else {
        notify(
          "success",
          `${summary}. Your library has been updated.`,
        );
      }
    } catch (batchError) {
      notify(
        "error",
        batchError.message || "The document batch could not be processed.",
      );
    } finally {
      setUploading(false);
    }
  };
   setUploading(true);
    notify("progress", `Reading ${file.name} locally…`);

    try {
      const contentHash = await hashPdfContent(file);
      const duplicate = await findDuplicateResource(accountId, contentHash);

      if (duplicate) {
        if (duplicate.cloudItemId) {
          await updateCloudResource(duplicate.cloudItemId, { display_name: file.name });
        }
        await renameDuplicateResource(accountId, duplicate, file.name);
        await refresh();
        notify("success", `Already in your library. Renamed to ${file.name}; no second PDF was stored.`);
        return;
      }

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
        contentHash,
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

      let cloudItem = null;
      try {
        const cloudResult = await uploadCloudPdf(file, assignedCourse?.id || null, {
          last_opened_section: "Document",
          progress: {},
        });
        cloudItem = cloudResult.item;
      } catch (cloudError) {
        notify("progress", "Saved offline. Cloud upload will be available when the connection returns.");
      }

      const savedResource = cloudItem
        ? cloudItemToResource(cloudItem, accountId, resource)
        : resource;
      await saveResource(savedResource);
      await refresh();

      if (assignedCourse) {
        notify(
          "success",
          `${file.name} saved and organized under ${assignedCourse.code}.`,
        );
      } else {
        setPendingResources((current) => [
          ...current,
          { resource: savedResource, suggestedCourseId: recognition.best?.course?.id || "" },
        ]);
        if (!pendingResources.length) {
          setPendingCourseId(recognition.best?.course?.id || "");
        }
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
    setShareSelection(resources.map((resource) => resource.id));
    setShareLink("");
    setShareError("");
    setShareOpen(true);
  };

  const makeShare = async () => {
    if (exportController.current) return;

    const controller = new AbortController();
    exportController.current = controller;
    setBusyExport(true);
    setShareError("");
    setShareProgress({ stage: "uploading", completed: 0, total: shareSelection.length });

    try {
            const selectedResources = resources.filter((resource) =>
        shareSelection.includes(resource.id)
      );

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
        importedCount = await importLibraryItems(
          importPayload.items,
          importSelection,
          accountId,
          saveResource,
          updateProgress,
          controller.signal,
          {
            findDuplicate: (hash) => findDuplicateResource(accountId, hash),
            renameDuplicate: (resource, name) =>
              renameDuplicateResource(accountId, resource, name),
            hashPdfContent,
          },
        );

        await refresh();

        setImportFeedback({
          type: controller.signal.aborted ? "success" : "success",
          message: controller.signal.aborted
            ? `Import cancelled. ${importedCount} document${importedCount === 1 ? "" : "s"} completed before cancellation.`
            : `${importedCount} document${importedCount === 1 ? "" : "s"} imported successfully.`,
        });
        return;
      }

      if (!driveToken) {
        throw new Error("Google Drive authorization expired. Load the link again.");
      }

      for (let index = 0; index < selectedItems.length; index += 1) {
        if (controller.signal.aborted) break;

        const item = selectedItems[index];
        const now = new Date().toISOString();
        const documentText = `${item.folderPath || ""} ${item.name}`;
        const documentFingerprint = `drive:${item.id}`;
        const recognition = recognizeCourse(documentText, OAU_PHARMD_COURSES);
        const learned = getRememberedCorrection(
          accountId,
          documentFingerprint,
          documentText,
        );

        const learnedCourse = learned
          ? OAU_PHARMD_COURSES.find((course) => course.id === learned.courseId)
          : null;

        const assignedCourse = learnedCourse
          || (recognition.highConfidence ? recognition.best?.course : null);

        const resource = {
          id: `${accountId}-drive-${item.id}`,
          accountId,
          fingerprint: documentFingerprint,
          text: documentText,
          source: "google-drive",
          driveFileId: item.id,
          driveUrl: `https://drive.google.com/open?id=${encodeURIComponent(item.id)}`,
          name: item.name,
          folderPath: item.folderPath || "",
          mimeType: item.mimeType || "application/pdf",
          size: Number(item.size) || 0,
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
          lastOpenedAt: null,
          lastOpenedSection: "Document",
          progress: {},
          createdAt: now,
          updatedAt: now,
        };

        await saveResource(resource);

        if (!assignedCourse) {
          unassignedResources.push({
            resource,
            suggestedCourseId: recognition.best?.course?.id || "",
          });
        }

        importedCount += 1;

        updateProgress({
          stage: "saving",
          completed: importedCount,
          total: selectedItems.length,
          name: item.name,
          message: `Added Drive reference: ${item.name}`,
        });
      }

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
    } finally {
      if (importController.current === controller) importController.current = null;
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
              key={activeCourse.id}
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
            if (shareLink) await navigator.clipboard?.writeText(shareLink);
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

function CourseFolder({ course, resources, description, onBack, onSaveDescription, onOpen, onAssign, onDelete }) {
  const [draft, setDraft] = useState(description);

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
  const suggestions = resource.suggestions || [];
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
          <button className={styles.deleteButton} type="button" onClick={() => onDelete(resource)}>
            <i className="fa-solid fa-trash" /> Remove
          </button>
        </div>
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
function ShareDialog({ resources, selection, setSelection, link, error, busy, progress, onCreate, onCopy, onClose }) {
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
            {link && <button type="button" className="copyIconButton" onClick={onCopy} aria-label="Copy library link"><i className="fa-regular fa-copy" /></button>}
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
        {link && <div className={styles.shareResult}><input readOnly value={link} aria-label="Library share link" /><button type="button" className="copyTextButton" onClick={onCopy}>Copy link</button></div>}
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
            <div>
              <button type="button" className={styles.secondaryButton}
                disabled={busy || selection.length === items.length}
                onClick={() => setSelection(items.map((item) => item.id))}>
                Select all
              </button>
              <button type="button" className={styles.secondaryButton}
                disabled={busy || selection.length === 0}
                onClick={() => setSelection([])}>
                Select none
              </button>
            </div>
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
