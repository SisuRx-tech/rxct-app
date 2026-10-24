import ProfileHeader from "../components/profile/ProfileHeader";
import styles from "./Profile.module.css";
import avatar from "../assets/circle_avatar.png";
function Profile() {
  return (
    <div className={styles.page}>
      <ProfileHeader />

      <main className={styles.content}>
        <section className={styles.section}>
          <div className={styles.identity}>
            <img src={avatar} alt="" className={styles.avatarImage} />

            <div className={styles.identityInfo}>
              <h2>Student Name</h2>
              <p>student@example.com</p>
            </div>

            <button type="button" className={styles.editButton}>
              Edit
            </button>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Academic Information</h2>
              <p>Your current academic details</p>
            </div>

            <button type="button" className={styles.editButton}>
              Edit
            </button>
          </div>

          <div className={styles.details}>
            <div className={styles.detail}>
              <span>University</span>
              <p>Not set</p>
            </div>

            <div className={styles.detail}>
              <span>Programme</span>
              <p>Not set</p>
            </div>

            <div className={styles.detail}>
              <span>Level</span>
              <p>Not set</p>
            </div>

            <div className={styles.detail}>
              <span>Part</span>
              <p>Not set</p>
            </div>

            <div className={styles.detail}>
              <span>Semester</span>
              <p>Not set</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Profile;
