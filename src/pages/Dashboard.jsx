import { useOutletContext } from "react-router-dom";
import styles from "../components/dashboard/Dashboard.module.css";
import WelcomeHero from "../components/dashboard/WelcomeHero";
import NewUserView from "../components/dashboard/NewUserView";
import ContinueStudying from "../components/dashboard/ContinueStudying";
import RecentlyOpened from "../components/dashboard/RecentlyOpened";
import LibraryStats from "../components/dashboard/LibraryStats";

/* Placeholders until the shared records exist.
   Empty / null means a new user, so the new-user view renders. */
const displayName = null; // chosen name from the profile
const workspace = null; // university + programme from the profile
const lastResource = null; // { id, title, course, page, pageCount, openedAt }
const recentItems = []; // { type, id, title, detail, openedAt }
const libraryCounts = null; // { organized, savedMedicines, unorganized }

function Dashboard() {
  const { openPanel } = useOutletContext();

  const isNewUser = !lastResource && recentItems.length === 0;

  return (
    <div className={styles.page}>
      <WelcomeHero
        isNewUser={isNewUser}
        displayName={displayName}
        workspace={workspace}
        onEditProfile={() => openPanel("profile")}
      />

      {isNewUser ? (
        <NewUserView />
      ) : (
        <>
          {lastResource && <ContinueStudying resource={lastResource} />}
          {recentItems.length > 0 && <RecentlyOpened items={recentItems} />}
          {libraryCounts && <LibraryStats counts={libraryCounts} />}
        </>
      )}
    </div>
  );
}

export default Dashboard;