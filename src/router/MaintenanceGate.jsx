// src/router/MaintenanceGate.jsx — NEW FILE (Phase 5, step 3; maintenance levels 1, 2 and page level)
//
// AIM
// Wraps every route and shows the maintenance page instead of the app when the address is in maintenance.
// A super admin is never held back (so they can test and switch things off); everyone else is.
//   level 1  system          every address except sign-in (and /maintenance)
//   level 2  allDashboards   every address under /app
//   page     pages[]         the addresses whose page key (routes.js, pageKeyFor) is in the list
// Level 3 (one business type) is decided in router/guards.jsx RequireMember, which knows the business.
// Levels 4 and 5 (M-Pesa) are enforced by the mpesa-stk-push Edge Function; the browser only shows a friendly message.
// The sign-in and password pages stay open so a super admin can still sign in.
// The "maintenance is on" notice for everyone, super admins included, is components/feedback/MaintenanceBanner.jsx.
// The browser re-checks the settings every minute while anything is on (every 5 minutes otherwise), so the site
// comes back, or goes down, without a reload. This hides pages in the browser only; it does not block API calls
// (see docs/phase-5/STEP-3.md), except M-Pesa prompts, which the server blocks itself.

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Spinner from "../components/ui/Spinner.jsx";
import MaintenancePage from "../pages/shared/MaintenancePage.jsx";
import { maintenanceActive, usePlatformStore } from "../store/platformStore.js";
import { useSession } from "../store/sessionStore.js";
import { pageKeyFor } from "./routes";
import "../pages/shared/MaintenancePage.css";

const OPEN_PATHS = ["/login", "/auth/callback", "/forgot-password", "/reset-password", "/maintenance"];
const RECHECK_ACTIVE_MS = 60000;
const RECHECK_IDLE_MS = 300000;

export const isDashboardPath = (pathname) => pathname === "/app" || pathname.startsWith("/app/");

export default function MaintenanceGate({ children }) {
  const { pathname } = useLocation();
  const m = usePlatformStore((s) => s.maintenance);
  const loaded = usePlatformStore((s) => s.loaded);
  const sessionLoading = useSession((s) => s.loading);
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const isAdmin = profile?.role === "super_admin";
  const active = maintenanceActive(m);

  useEffect(() => { if (!loaded) usePlatformStore.getState().load(); }, [loaded]);
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      usePlatformStore.getState().refreshMaintenance();
    }, active ? RECHECK_ACTIVE_MS : RECHECK_IDLE_MS);
    return () => clearInterval(t);
  }, [active]);

  // Dashboards wait for the settings: otherwise a sign-in redirect can fire before we know they are in maintenance.
  // Public pages render at once (waiting would slow every first visit by one round trip).
  const loader = <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}><Spinner size="lg" label="Loading" /></div>;
  if (!loaded && isDashboardPath(pathname)) return loader;

  const key = pageKeyFor(pathname);
  const pageDown = Boolean(key) && m.pages.includes(key);
  const dashboardsDown = m.allDashboards && isDashboardPath(pathname);
  if (!(m.system || dashboardsDown || pageDown)) return children;
  if (OPEN_PATHS.includes(pathname)) return children;
  if (sessionLoading || (user && !profile)) return loader;
  if (isAdmin) return children;
  if (m.system) return <MaintenancePage />;
  return <MaintenancePage partial title={dashboardsDown ? "Dashboards are being updated" : "This page is being updated"} />;
}
