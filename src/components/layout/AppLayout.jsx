import logo from "../../assets/rxct-logo.png";
function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <header className="mobile-header">
        <div className="mobile-brand">
          <img src={logo} alt="RxCT" />
        </div>
        <button className="menu-toggle" aria-label="Open menu">
          ☰
        </button>
      </header>
      <aside className="sidebar">
        <div className="brand">
          <img className="logo" src={logo} alt="RxCT" />
        </div>

        <nav className="sidebar-nav">
          <a href="/" className="sidebar-item active">
            <i className="fa-solid fa-table-columns"></i>
            Dashboard
          </a>

          <a href="/medicines" className="sidebar-item">
            <i className="fa-solid fa-pills"></i>
            Medicines
          </a>
          <a href="/resources" className="sidebar-item">
            <i className="fa-solid fa-book-open"></i>
            Resources
          </a>

          <a href="/history" className="sidebar-item">
            <i className="fa-solid fa-clock-rotate-left"></i>
            History
          </a>
        </nav>

  
      </aside>

      <main className="main-content">{children}</main>

      <nav className="bottom-nav">
        <a href="/">Dashboard</a>
        <a href="/medicines">Medicines</a>
        <a href="/resources">Resources</a>
        <a href="/history">History</a>
      </nav>
    </div>
  );
}

export default AppLayout;
