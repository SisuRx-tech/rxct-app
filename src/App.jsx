import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Medicines from "./pages/Medicines";
import Resources from "./pages/Resources";
import History from "./pages/History";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";

function App() {
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

export default App;
