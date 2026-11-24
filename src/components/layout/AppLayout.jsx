import { useState } from "react";
import logo from "../../assets/rxct-logo.png";
import Topbar from "./Topbar";
import { navItems } from "../../config/navigation";
import { MedicinesWorkspaceProvider } from "../../context/MedicinesWorkspaceContext";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Profile from "../../pages/Profile";
import Settings from "../../pages/Settings";
function AppLayout() {
  const [uploadStatus, setUploadStatus] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const openPanel = (panel) => {
    navigate(location.pathname + location.search + location.hash, {
      state: { ...location.state, rxctPanel: panel },
      replace: panelOpen,
    });
  };
  const panel = location.state?.rxctPanel;
  const panelOpen = panel === "profile" || panel === "settings";
  const activePanel = panelOpen ? panel : "profile";
  const closePanel = () => {
    navigate(location.pathname + location.search + location.hash, {
      state: { ...location.state, rxctPanel: null },
      replace: true,
    });
  };
  return (
    <MedicinesWorkspaceProvider>
      <div className={panelOpen ? "app-layout panel-open" : "app-layout"}>
        <Topbar onOpenPanel={openPanel} panelOpen={panelOpen} />
        <aside className="sidebar">
          <div className="brand">
            <img className="logo" src={logo} alt="RxCT" />
          </div>

          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <NavLink to={item.path} key={item.path} className="sidebar-item">
                <i className={`fa-solid ${item.icon}`}></i>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main
          className="main-content"
          onClick={panelOpen ? closePanel : undefined}
        >
          <Outlet context={{ openPanel, setUploadStatus }} />
        </main>
        {panelOpen && (
          <aside className="side-panel">
            {activePanel === "profile" ? <Profile /> : <Settings />}
          </aside>
        )}
        <nav className="bottom-nav">
          {navItems.map((item) => (
            <NavLink
              to={item.path}
              key={item.path}
              className={({ isActive }) =>
                isActive ? "bottom-nav-item active" : "bottom-nav-item"
              }
            >
              <i className={`fa-solid ${item.icon}`}></i>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {uploadStatus && (
          <section
            className={`global-upload-status global-upload-${uploadStatus.status}`}
            role="status"
            aria-live="polite"
          >
            <div className="global-upload-heading">
              <span className="global-upload-indicator">
                <i className={`fa-solid ${
                  uploadStatus.status === "uploading"
                    ? "fa-spinner fa-spin"
                    : uploadStatus.status === "error" || uploadStatus.status === "partial"
                      ? "fa-triangle-exclamation"
                      : "fa-circle-check"
                }`} />
              </span>
              <div className="global-upload-copy">
                <strong>
                  {uploadStatus.status === "uploading"
                    ? "Import in progress"
                    : uploadStatus.status === "partial"
                      ? "Import finished with issues"
                      : uploadStatus.status === "error"
                        ? "Import failed"
                        : "Import complete"}
                </strong>
                <span>{uploadStatus.message}</span>
              </div>
              {uploadStatus.status !== "uploading" && (
                <button
                  type="button"
                  onClick={() => setUploadStatus(null)}
                  aria-label="Dismiss upload status"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>

            {uploadStatus.status === "uploading" && (
              <>
                <div className="global-upload-progress-track">
                  <span
                    style={{
                      width: `${uploadStatus.total
                        ? Math.round((uploadStatus.completed / uploadStatus.total) * 100)
                        : 0}%`,
                    }}
                  />
                </div>
                <div className="global-upload-details">
                  <span>
                    {uploadStatus.stage === "hashing"
                      ? "Checking PDF files"
                      : "Processing documents"}
                  </span>
                  <span>
                    {uploadStatus.completed} / {uploadStatus.total}
                  </span>
                </div>
                {uploadStatus.activeFiles?.length > 0 && (
                  <div className="global-upload-files">
                    {uploadStatus.activeFiles.map((name) => (
                      <span key={name}>{name}</span>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </MedicinesWorkspaceProvider>
  );
}

export default AppLayout;
