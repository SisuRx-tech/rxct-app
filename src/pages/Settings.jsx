import { useState } from "react";
import { useAuth } from "../context/useAuth";
import "./Settings.css";

function Settings() {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const provider =
    user?.app_metadata?.provider ||
    user?.app_metadata?.providers?.[0] ||
    "email";

  const handleSignOut = async () => {
    setLoading(true);
    setError("");

    const { error: signOutError } = await signOut();

    if (signOutError) {
      setError("Unable to sign out. Please try again.");
      setLoading(false);
      return;
    }

    setConfirming(false);
  };

  return (
    <main className="settings-page">
      <header className="settings-header">
        <span className="settings-eyebrow">PREFERENCES</span>
        <h1>Settings</h1>
        <p>Manage your account and application preferences.</p>
      </header>

      <section className="settings-section">
        <div className="settings-section-heading">
          <h2>Account</h2>
          <p>Your authenticated RxCT account.</p>
        </div>

        <div className="settings-account-card">
          <div className="settings-account-avatar">
            {(user?.email?.[0] || "U").toUpperCase()}
          </div>

          <div className="settings-account-details">
            <strong>{user?.email || "Unknown account"}</strong>
            <span>Signed in with {provider}</span>
          </div>

          <span className="settings-status">Active</span>
        </div>
      </section>

      <section className="settings-section settings-security">
        <div className="settings-section-heading">
          <h2>Security</h2>
          <p>Control access to this device.</p>
        </div>

        {!confirming ? (
          <button
            className="settings-signout"
            type="button"
            onClick={() => setConfirming(true)}
          >
            Sign out
          </button>
        ) : (
          <div className="settings-confirm">
            <div>
              <strong>Sign out of RxCT?</strong>
              <p>You will need to authenticate again to access your workspace.</p>
            </div>

            <div className="settings-confirm-actions">
              <button
                type="button"
                className="settings-cancel"
                onClick={() => setConfirming(false)}
                disabled={loading}
              >
                Cancel
              </button>

              <button
                type="button"
                className="settings-signout"
                onClick={handleSignOut}
                disabled={loading}
              >
                {loading ? "Signing out..." : "Confirm sign out"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

export default Settings;
