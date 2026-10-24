import { useNavigate } from "react-router-dom";
import styles from "./ProfileHeader.module.css";

function ProfileHeader() {
const navigate = useNavigate();

function handleBack() {
if (window.history.length > 1) {
navigate(-1);
} else {
navigate("/");
}
}

return (
<div className={styles.container}>
<h1 className={styles.header}>Profile</h1>
<p className={styles.subtitle}>
Manage your personal and academic information
</p>
<button
type="button"
className={styles.link}
onClick={handleBack}
>
← Back
</button>
</div>
);
}

export default ProfileHeader;