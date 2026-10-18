
import logo from "../../assets/rxct-logo.png";
import avatar from "../../assets/circle_avatar.png"
function Topbar(){
return(
  <header className="topbar">
  <div className="topbar-brand">
    <img src={logo} alt="RxCT" />
  </div>

  <h2 className="page-title">
    <i className="fa-solid fa-table-columns"></i>
    Dashboard
  </h2>

  <div className="search-wrapper">
    <i className="fa-solid fa-magnifying-glass"></i>
    <input
      type="search"
      placeholder="Search medicines, classes, symptoms..."
      className="searchbox"
    />
  </div>

  <div className="profile-panel">
    <button className="icon-btn" aria-label="Notifications">
      <i className="fa-solid fa-bell"></i>
    </button>
  </div>

  <button className="profile" aria-label="Open profile menu">
    <img src={avatar} alt="" />
  </button>
</header>  
)
}
export default Topbar;