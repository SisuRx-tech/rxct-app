import logo from "../../assets/rxct-logo.png";
import Topbar from "./Topbar";
import { navItems } from "../../config/navigation";
function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <Topbar />
      <aside className="sidebar">
        <div className="brand">
          <img className="logo" src={logo} alt="RxCT" />
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <a href={item.path} key={item.path} className="sidebar-item">
              <i className={`fa-solid ${item.icon}`}></i>
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <main className="main-content">{children}</main>

      <nav className="bottom-nav">
    
          {navItems.map((item) => (
            <a href={item.path} key={item.path} className="bottom-nav-item">
              <i className={`fa-solid ${item.icon}`}></i>
              {item.label}
            </a>
          ))}

      </nav>
    </div>
  );
}

export default AppLayout;
