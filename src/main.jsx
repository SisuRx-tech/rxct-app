import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";
// Capture PWA installation prompt before React mounts
window.__rxctInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();

  window.__rxctInstallPrompt = event;

  window.dispatchEvent(new Event("rxct-install-prompt-ready"));
});
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <StrictMode>
      <App />
    </StrictMode>
  </BrowserRouter>,
);
