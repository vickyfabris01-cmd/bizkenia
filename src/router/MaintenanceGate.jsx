// src/router/MaintenanceGate.jsx — NEW FILE (Phase 5, step 3)
//
// AIM
// Wraps every route. While maintenance mode is on (Admin > Settings), everyone except a super admin
// sees the maintenance page instead of the app. The sign-in and password pages stay open so a super
// admin can still sign in. A super admin sees the whole site plus a thin banner that says the mode is
// on and links to the switch. While maintenance is on, a visitor's browser re-checks every minute and
// the site returns on its own when the mode is switched off.
// This hides the pages in the browser only; it does not block API calls (see docs/phase-5/STEP-3.md).

import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Spinner from "../components/ui/Spinner.jsx";
import MaintenancePage from "../pages/shared/MaintenancePage.jsx";
import { usePlatformStore } from "../store/platformStore.js";
import { useSession } from "../store/sessionStore.js";
import "../pages/shared/MaintenancePage.css";

const OPEN_PATHS = ["/login", "/auth/callback", "/forgot-password", "/reset-password", "/maintenance"];
const RECHECK_MS = 60000;

export default function MaintenanceGate({ children }) {
  const { pathname } = useLocation();
  const enabled = usePlatformStore((s) => s.maintenance.enabled);
  const loaded = usePlatformStore((s) => s.loaded);
  const sessionLoading = useSession((s) => s.loading);
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const isAdmin = profile?.role === "super_admin";

  useEffect(() => { if (!loaded) usePlatformStore.getState().load(); }, [loaded]);
  useEffect(() => {
    if (!enabled || isAdmin) return undefined;
    const t = setInterval(() => usePlatformStore.getState().load(true), RECHECK_MS);
    return () => clearInterval(t);
  }, [enabled, isAdmin]);

  if (!enabled) return children;
  if (OPEN_PATHS.includes(pathname)) return children;
  if (sessionLoading || (user && !profile)) {
    return <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}><Spinner size="lg" label="Loading" /></div>;
  }
  if (!isAdmin) return <MaintenancePage />;
  return (
    <>
      <div className="maint-banner" role="status">
        <span>Maintenance mode is on. Visitors see the maintenance page; you can still use everything.</span>
        <Link to="/admin/settings">Turn it off</Link>
      </div>
      {children}
    </>
  );
}
