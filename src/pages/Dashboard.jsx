import { useOutletContext } from "react-router-dom";
import styles from "../components/dashboard/Dashboard.module.css";
import WelcomeHero from "../components/dashboard/WelcomeHero";
import NewUserView from "../components/dashboard/NewUserView";
import ContinueStudying from "../components/dashboard/ContinueStudying";
import RecentlyOpened from "../components/dashboard/RecentlyOpened";
import { useAuth } from "../context/useAuth";
import { getRecentActivity, getResumePoint } from "../services/activity";
import { getAcademicContext } from "../services/academicContext";
import { getProfileDisplayName } from "../services/userProfile";

function Dashboard() {
  const { openPanel } = useOutletContext();
  const { user } = useAuth();
  const recentItems = getRecentActivity(5);
  const lastResource = getResumePoint();
  const academic = getAcademicContext(user);
  const displayName = getProfileDisplayName(user);
  const workspace = [academic.university, academic.programme].filter(Boolean).join(" · ") || null;
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
        </>
      )}
    </div>
  );
}

export default Dashboard;
