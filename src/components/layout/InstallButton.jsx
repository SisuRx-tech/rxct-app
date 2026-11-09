import { useEffect, useRef, useState } from "react";
import styles from "./InstallButton.module.css";

const DISMISSED_KEY = "rxct-install-dismissed";

function InstallButton() {
  const [installPrompt, setInstallPrompt] = useState(null);

  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
  );

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartY = useRef(null);
  const dragMoved = useRef(false);

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" &&
      navigator.maxTouchPoints > 1);

  const isAndroid = /Android/i.test(navigator.userAgent);
  const isMobile = isIOS || isAndroid;

  // Installation prompt listener
  useEffect(() => {
    const syncInstallPrompt = () => {
      if (window.__rxctInstallPrompt) {
        setInstallPrompt(window.__rxctInstallPrompt);
      }
    };

    const handleInstalled = () => {
      setInstalled(true);
      setShowOnboarding(false);
      setInstallPrompt(null);
      window.__rxctInstallPrompt = null;
    };

    syncInstallPrompt();

    window.addEventListener(
      "rxct-install-prompt-ready",
      syncInstallPrompt
    );

    window.addEventListener("appinstalled", handleInstalled);

    if (
      isMobile &&
      !installed &&
      sessionStorage.getItem(DISMISSED_KEY) !== "true"
    ) {
      const timer = setTimeout(() => {
        setShowOnboarding(true);
      }, 2000);

      return () => {
        clearTimeout(timer);
        window.removeEventListener(
          "rxct-install-prompt-ready",
          syncInstallPrompt
        );
        window.removeEventListener("appinstalled", handleInstalled);
      };
    }

    return () => {
      window.removeEventListener(
        "rxct-install-prompt-ready",
        syncInstallPrompt
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [installed, isMobile]);

  // Prevent background scrolling
  useEffect(() => {
    if (!showOnboarding) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showOnboarding]);

  // Drag interaction
  function handleDragStart(event) {
    if (event.target.closest("button, a")) return;

    dragStartY.current = event.clientY;
    dragMoved.current = false;

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDragMove(event) {
    if (dragStartY.current === null) return;

    const distance = Math.max(
      0,
      event.clientY - dragStartY.current
    );

    if (distance > 5) {
      dragMoved.current = true;
      setIsDragging(true);
    }

    setDragY(distance);
  }

  function handleDragEnd() {
    if (dragStartY.current === null) return;

    if (dragY > 90) {
      handleDismiss();
    }

    dragStartY.current = null;
    setIsDragging(false);
    setDragY(0);
  }

  // Installation
async function handleInstall() {
  const promptEvent =
    installPrompt || window.__rxctInstallPrompt;

  if (!promptEvent) {
    setShowInstructions(true);
    return;
  }

  try {
    await promptEvent.prompt();

    const { outcome } = await promptEvent.userChoice;

    setInstallPrompt(null);
    window.__rxctInstallPrompt = null;

    if (outcome === "accepted") {
      setShowOnboarding(false);
      setShowInstructions(false);
    } else {
      setShowInstructions(true);
    }
  } catch (error) {
    console.error("RxCT installation failed:", error);
    setShowInstructions(true);
  }
}
  function handleDismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "true");
    setShowOnboarding(false);
    setDragY(0);
  }

  if (installed) return null;

  return (
    <>
      {/* Existing install button placement */}
    {!isMobile && installPrompt && (
          <button
            type="button"
            className={styles.installButton}
            onClick={() => {
              setShowInstructions(false);
              setShowOnboarding(true);
            }}
          >
            <img src="/pwa-192.png" alt="" />
            <span>Install RxCT</span>
          </button>
        )}

      {showOnboarding && (
        <div
          className={styles.overlay}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleDismiss();
            }
          }}
        >
          <section
            className={styles.installSheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-title"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            onClick={(event) => {
              if (dragMoved.current) {
                event.preventDefault();
                event.stopPropagation();
                dragMoved.current = false;
              }
            }}
            style={{
              transform: `translateY(${dragY}px)`,
              transition: isDragging
                ? "none"
                : "transform 220ms ease",
            }}
          >
            <div className={styles.sheetHandle} />

            <img
              src="/pwa-512.png"
              alt="RxCT"
              className={styles.logo}
            />

            <h2 id="install-title">Make RxCT yours.</h2>

            <p>
              Keep your pharmacy workspace one tap away.
              Install RxCT on your home screen for a dedicated
              app experience and quicker access.
            </p>

            {showInstructions && (
              <div className={styles.instructions}>
                {isIOS ? (
                  <>
                    <p>To install RxCT on your iPhone or iPad:</p>
                    <ol>
                      <li>Open RxCT in Safari.</li>
                      <li>Tap the Share button.</li>
                      <li>Select Add to Home Screen.</li>
                      <li>Tap Add.</li>
                    </ol>
                  </>
                ) : (
                  <>
                    <p>To install RxCT on Android:</p>
                    <ol>
                      <li>Open your browser menu (⋮).</li>
                      <li>Select Install app or Add to Home screen.</li>
                      <li>Confirm the installation.</li>
                    </ol>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              className={styles.primaryAction}
              onClick={
                showInstructions ? handleDismiss : handleInstall
              }
            >
              {showInstructions ? "Got it" : "Install RxCT"}
            </button>

            <button
              type="button"
              className={styles.secondaryAction}
              onClick={handleDismiss}
            >
              Maybe later
            </button>
          </section>
        </div>
      )}
    </>
  );
}

export default InstallButton;