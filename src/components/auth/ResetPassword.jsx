import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";

function EyeIcon({ visible }) {
  return visible ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3 21 21" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A11 11 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.1-2.3 3.1" />
      <path d="M6.2 6.2C3.8 7.7 2.5 10 2 12c1 2.5 4.5 7 10 7 1 0 2-.2 2.9-.5" />
    </svg>
  );
}

export default function ResetPassword() {
  const { user, loading: authLoading, isPasswordRecovery, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!user || !isPasswordRecovery) {
      setError(
        "This password reset link is invalid or has expired. Request a new one."
      );
      return;
    }

    if (password.length < 10) {
      setError("Your password must contain at least 10 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await updatePassword(password);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess("Your password has been updated. Please sign in with your new password.");

      const { error: signOutError } = await signOut();
      if (signOutError) {
        setError("Your password changed, but this recovery session could not be closed. Please sign out and sign in again.");
        return;
      }

      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err.message || "Unable to update your password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <img
            className="auth-wordmark"
            src="/rxct-logo.png"
            alt="RxCT"
          />
        </div>

        <div className="auth-heading">
          <h1>Set a new password</h1>
          <p>Choose a new password for your RxCT account.</p>
        </div>

        <form
          className="auth-form reset-password-form"
          onSubmit={handleSubmit}
        >
          <label htmlFor="new-password">New password</label>

          <div className="auth-input-wrap auth-password-field">
            <input
              className="reset-password-input"
              id="new-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <button
              className="auth-password-toggle"
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <EyeIcon visible={showPassword} />
            </button>
          </div>

          <label htmlFor="confirm-password">Confirm new password</label>

          <div className="auth-input-wrap auth-password-field">
            <input
              className="reset-password-input"
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={10}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />

            <button
              className="auth-password-toggle"
              type="button"
              onClick={() =>
                setShowConfirmPassword((value) => !value)
              }
              aria-label={
                showConfirmPassword
                  ? "Hide password"
                  : "Show password"
              }
            >
              <EyeIcon visible={showConfirmPassword} />
            </button>
          </div>

          {error && (
            <p className="auth-feedback error" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="auth-feedback success" role="status">
              {success}
            </p>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading || authLoading || !user || !isPasswordRecovery}
          >
            {loading
              ? "Updating..."
              : authLoading
                ? "Checking reset link..."
                : "Update password"}
          </button>
        </form>

        {!authLoading && (!user || !isPasswordRecovery) && (
          <div className="auth-links">
            <p>
              This reset link is invalid, expired, or was not opened correctly. Request a new one from sign in.
            </p>

            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
            >
              Return to sign in
            </button>
          </div>
        )}
      </section>
    </main>
  );
}