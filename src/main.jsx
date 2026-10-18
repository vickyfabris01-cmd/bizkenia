// src/main.jsx — MODIFIED FILE (global style imports, plus the hero photo preload below)
import "./styles/tokens.css";   // design tokens: colours, type, spacing, radii, motion
import "./styles/base.css";     // global reset + defaults built from the tokens

import React                from "react";
import ReactDOM             from "react-dom/client";
import AppRouter            from "./router/AppRouter.jsx";
import { ToastContainer }   from "./components/feedback/Toast.jsx";
import { RootErrorBoundary } from "./components/feedback/ErrorBoundary.jsx";
import { startHeroPreload } from "./lib/heroPreload.js";
import { installMonitor } from "./lib/monitor.js";
import { registerServiceWorker } from "./lib/pwa.js";

// =============================================================================
// main.jsx — application entry point
//
// Renders:
//   <StrictMode>
//     <RootErrorBoundary>    ← Catches any crash that escapes page boundaries.
//       <AppRouter />        ← BrowserRouter + all routes + AppLoader bootstrap
//       <ToastContainer />   ← Global toast overlay, portal-rendered
//     </RootErrorBoundary>
//   </StrictMode>
// =============================================================================

// Home page hero photo: start getting it now, before React renders, so it is ready (or
// settled) by the time the home page draws. Only on the home address; other pages skip it.
if (window.location.pathname === "/") startHeroPreload();
installMonitor();
registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <AppRouter />
      <ToastContainer />
    </RootErrorBoundary>
  </React.StrictMode>
);