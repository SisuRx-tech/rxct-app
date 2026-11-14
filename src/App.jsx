import "./App.css";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";

import AuthScreen from "./components/auth/AuthScreen";
import ResetPassword from "./components/auth/ResetPassword";
import Splash from "./components/Splash";

import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Medicines from "./pages/Medicines";
import Resources from "./pages/Resources";
import History from "./pages/History";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";

function AuthGate() {
  const { user, loading } = useAuth();
  const location = useLocation();

if (loading) return null;
  if (location.pathname === "/reset-password") {
    return <ResetPassword />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/medicines" element={<Medicines />} />
        <Route path="/resources" element={<Resources />} />
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
