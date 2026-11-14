import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";

export default function ResetPassword() {
  const { user, updatePassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!user) {
      setError("This password reset link is invalid or has expired. Request a new one.");
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

    const { error: updateError } = await updatePassword(password);

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess("Your password has been updated.");

    setTimeout(() => navigate("/", { replace: true }), 1200);
  };

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-mark">X</div>
          <span>RxCT</span>
        </div>

        <div className="auth-heading">
          <h1>Set a new password</h1>
          <p>Choose a new password for your RxCT account.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />

          {error && <p className="auth-feedback error" role="alert">{error}</p>}
          {success && <p className="auth-feedback success" role="status">{success}</p>}

          <button className="auth-submit" type="submit" disabled={loading || !user}>
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>

        {!user && (
          <div className="auth-links">
            <button type="button" onClick={() => navigate("/", { replace: true })}>
              Return to sign in
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
