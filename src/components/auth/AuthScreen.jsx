import { useState } from "react";
import { useAuth } from "../../context/useAuth";
import "./AuthScreen.css";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
        transform="translate(0 5)"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.73 7.18l7.62 5.91c4.45-4.11 7.15-10.16 7.15-17.56Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.75-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.47 0 11.92-2.13 15.89-5.89l-7.62-5.91c-2.12 1.42-4.84 2.27-8.27 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v3" />
    </svg>
  );
}

function EyeIcon({ hidden }) {
  return hidden ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3 21 21" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A11 11 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.1-2.3 3.1" />
      <path d="M6.2 6.2C3.8 7.7 2.5 10 2 12c1 2.5 4.5 7 10 7 1 0 2-.2 2.9-.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ActionIcon({ mode }) {
  if (mode === "register") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21v-2a7 7 0 0 1 14 0v2" />
        <path d="M19 8v6M16 11h6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" />
    </svg>
  );
}

export default function AuthScreen() {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
  } = useAuth();

  const [mode, setMode] = useState("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const clearFeedback = () => {
    setError("");
    setMessage("");
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setPassword("");
    setShowPassword(false);
    clearFeedback();
  };

  const handleGoogle = async () => {
    clearFeedback();
    setLoading(true);

    try {
      const { error: authError } = await signInWithGoogle();

      if (authError) throw authError;
    } catch (err) {
      setError(err.message || "Google sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    clearFeedback();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const { error: authError } = await resetPassword(email);

        if (authError) throw authError;

        setMessage(
          "If an account exists for that email, a password reset link has been sent."
        );
      } else if (mode === "register") {
        if (password.length < 10) {
          throw new Error(
            "Your password must contain at least 10 characters."
          );
        }

        const { data, error: authError } = await signUpWithEmail(
          email,
          password
        );

        if (authError) throw authError;

        setMessage(
          data.session
            ? "Your account has been created."
            : "Check your email for a verification link before signing in."
        );
      } else {
        const { error: authError } = await signInWithEmail(
          email,
          password
        );

        if (authError) {
          throw new Error(
            "Unable to sign in. Check your email and password, and confirm your email address is verified."
          );
        }
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const titles = {
    register: "Create your account",
    login: "Welcome back",
    forgot: "Reset your password",
  };

  const descriptions = {
 register: "Start your pharmacy learning.",
login: "Continue where your learning left off.",
forgot: "Enter your email to receive a reset link."
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

        <header className="auth-heading">
          <h1>{titles[mode]}</h1>
          <p>{descriptions[mode]}</p>
        </header>

        {mode !== "forgot" && (
          <>
            <button
              className="auth-google"
              type="button"
              onClick={handleGoogle}
              disabled={loading}
            >
              <span className="auth-google-icon">
                <GoogleIcon />
              </span>
              Continue with Google
            </button>

            <div className="auth-divider">
              <span>or continue with email</span>
            </div>
          </>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="auth-email">Email address</label>

          <div className="auth-input-wrap">
            <span className="auth-input-icon">
              <MailIcon />
            </span>

            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          {mode !== "forgot" && (
            <>
              <label htmlFor="auth-password">Password</label>

              <div className="auth-input-wrap auth-password-field">
                <span className="auth-input-icon">
                  <LockIcon />
                </span>

                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "register"
                      ? "new-password"
                      : "current-password"
                  }
                  placeholder={
                    mode === "register"
                      ? "At least 10 characters"
                      : "Enter your password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={mode === "register" ? 10 : undefined}
                  required
                />

                <button
                  className="auth-password-toggle"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  <EyeIcon hidden={showPassword} />
                </button>
              </div>
            </>
          )}

          {error && (
            <p className="auth-feedback error" role="alert">
              {error}
            </p>
          )}

          {message && (
            <p className="auth-feedback success" role="status">
              {message}
            </p>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              "Please wait..."
            ) : (
              <>
                <ActionIcon mode={mode} />
                {mode === "register"
                  ? "Create account"
                  : mode === "login"
                    ? "Sign in"
                    : "Send reset link"}
              </>
            )}
          </button>
        </form>

        <div className="auth-links">
          {mode === "register" && (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => changeMode("login")}
              >
                Sign in
              </button>
            </p>
          )}

          {mode === "login" && (
            <>
              <button
                type="button"
                onClick={() => changeMode("forgot")}
              >
                Forgot password?
              </button>

              <p>
                New to RxCT?{" "}
                <button
                  type="button"
                  onClick={() => changeMode("register")}
                >
                  Create an account
                </button>
              </p>
            </>
          )}

          {mode === "forgot" && (
            <p>
              Remembered your password?{" "}
              <button
                type="button"
                onClick={() => changeMode("login")}
              >
                Back to sign in
              </button>
            </p>
          )}
        </div>

        <p className="auth-footer">
          Your pharmacy learning space.
        </p>

      </section>
    </main>
  );
}