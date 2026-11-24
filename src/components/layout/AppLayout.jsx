import logo from "../../assets/rxct-logo.png";
import Topbar from "./Topbar";
import { navItems } from "../../config/navigation";
import { MedicinesWorkspaceProvider } from "../../context/MedicinesWorkspaceContext";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Profile from "../../pages/Profile";
import Settings from "../../pages/Settings";
function AppLayout() {
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
          <Outlet context={{ openPanel }} />
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
      </div>
    </MedicinesWorkspaceProvider>
  );
}

export default AppLayout;
