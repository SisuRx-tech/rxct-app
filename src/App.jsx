import "./App.css";
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";

import AuthScreen from "./components/auth/AuthScreen";
import ResetPassword from "./components/auth/ResetPassword";
import AcademicOnboarding from "./components/auth/AcademicOnboarding";
import Splash from "./components/Splash";

import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Medicines from "./pages/Medicines";
import History from "./pages/History";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";

const Resources = lazy(() => import("./pages/Resources"));

import {
  normalizeUserProfile,
  isUserProfileComplete,
  getAcademicWorkspaceStatus,
} from "./services/userProfile";

function UnavailableWorkspace({ message }) {
  const { signOut } = useAuth();

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        boxSizing: "border-box",
        background: "#eef3ef",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "30px",
          boxSizing: "border-box",
          background: "#faf9f5",
          border: "1px solid #dce6df",
          borderRadius: "14px",
          color: "#24332f",
        }}
      >
        <p style={{ color: "#164a45", fontWeight: 750, fontSize: "22px" }}>
          RxCT
        </p>
        <h1 style={{ color: "#164a45", fontSize: "22px" }}>
          Workspace not available yet
        </h1>
        <p style={{ color: "#68756e", lineHeight: 1.6, fontSize: "14px" }}>
          {message}
        </p>
        <p style={{ color: "#68756e", lineHeight: 1.6, fontSize: "13px" }}>
          Your account and academic profile are saved. You can return when
          your programme's workspace becomes available.
        </p>
        <Link
          to="/profile"
          style={{
            display: "inline-block",
            marginTop: "12px",
            color: "#164a45",
            fontWeight: 600,
          }}
        >
          Review academic profile
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          style={{
            display: "block",
            marginTop: "22px",
            padding: "10px 16px",
            border: "1px solid #dce5de",
            borderRadius: "8px",
            background: "white",
            color: "#164a45",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}

function AuthGate() {
  const { user, loading, isPasswordRecovery } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (location.pathname === "/reset-password" || isPasswordRecovery) {
    return <ResetPassword />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  const profile = normalizeUserProfile(user);

  if (!isUserProfileComplete(profile)) {
    return <AcademicOnboarding />;
  }

  const workspace = getAcademicWorkspaceStatus(profile);

  if (!workspace.available) {
    return (
      <Routes>
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="*"
          element={<UnavailableWorkspace message={workspace.message} />}
        />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/medicines" element={<Medicines />} />
        <Route
          path="/resources"
          element={
            <Suspense
              fallback={
                <main
                  style={{
                    minHeight: "40vh",
                    display: "grid",
                    placeItems: "center",
                    color: "#164a45",
                    fontSize: "14px",
                  }}
                >
                  Loading Resources…
                </main>
              }
            >
              <Resources />
            </Suspense>
          }
        />
        <Route path="/history" element={<History />} />
      </Route>

      <Route path="/profile" element={<Profile />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthGate />
      <Splash />
    </AuthProvider>
  );
}

export default App;
