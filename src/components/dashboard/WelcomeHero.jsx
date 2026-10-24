import styles from "./Dashboard.module.css";

function WelcomeHero({ isNewUser, displayName, workspace, onEditProfile }) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className={styles.welcome} aria-labelledby="welcome-title">
      <div className={styles.welcomeCopy}>
        <span className={styles.eyebrow}>
          {isNewUser ? "Your study space" : today}
        </span>

        <h1 id="welcome-title">
          {isNewUser ? "Welcome to RxCT" : "Welcome back"}
          {displayName && (
            <>
              , <span>{displayName}.</span>
            </>
          )}
        </h1>

        {isNewUser && (
          <p>
            Set up your library once, then keep your medicines and course
            resources close.
          </p>
        )}
      </div>

      <div className={styles.welcomeAside}>
        <span className={styles.asideLabel}>Workspace</span>
        <strong>{workspace ?? "Workspace not set"}</strong>

        <button
          type="button"
          className={styles.asideLink}
          onClick={onEditProfile}
        >
          {workspace ? "Edit profile" : "Complete profile"}
          <i
            className="fa-solid fa-arrow-up-right-from-square"
            aria-hidden="true"
          />
        </button>
      </div>
    </section>
  );
}

export default WelcomeHero;