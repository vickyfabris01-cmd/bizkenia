// src/components/feedback/MaintenanceBanner.jsx — NEW FILE (maintenance levels)
//
// AIM
// A warning strip under the header that says what is in maintenance. It shows whenever ANY level or page is on
// (see store/platformStore.js), for visitors and signed-in people alike, and has a close button (X).
// The X hides it for this browser session only; it comes back when the super admin changes the settings
// (the saved updated_at is different). A super admin also gets a link to the switches.
// Mounted in components/shell/AppShell.jsx (signed-in pages) and layouts/PublicLayout.jsx (public pages).
//
// The text is built from what is on, then the super admin's own message is added. Icons are the shared SVG set.

import "./MaintenanceBanner.css";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui";
import { PAGE_OPTIONS } from "../../router/routes";
import { typeLabel } from "../../config/counties.js";
import { maintenanceActive, usePlatformStore } from "../../store/platformStore.js";
import { useSession } from "../../store/sessionStore.js";

const STORAGE_KEY = "maint-notice-dismissed";
const readDismissed = () => { try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; } };
const writeDismissed = (v) => { try { sessionStorage.setItem(STORAGE_KEY, v); } catch { /* private window: the notice just comes back on reload */ } };

const joinWords = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** One plain sentence per thing that is switched on. */
export function describeMaintenance(m) {
  const parts = [];
  if (m.system) parts.push("The whole site is in maintenance. Only super admins can use it.");
  if (m.allDashboards) parts.push("Business dashboards are being updated.");
  if (m.types.length) parts.push(`${joinWords(m.types.map(typeLabel))} dashboards are being updated.`);
  if (m.pages.length) {
    const names = m.pages.map((k) => PAGE_OPTIONS.find((p) => p.key === k)?.label).filter(Boolean);
    const shown = names.slice(0, 3);
    const more = names.length - shown.length;
    if (shown.length) parts.push(`${joinWords(shown)}${more > 0 ? ` and ${more} more` : ""} ${names.length === 1 ? "is" : "are"} being updated.`);
    else parts.push("Some pages are being updated.");
  }
  if (m.payments) parts.push("M-Pesa payments are paused.");
  else if (m.businesses.length) parts.push("M-Pesa subscription payments are paused for some new businesses.");
  return parts.join(" ");
}

export default function MaintenanceBanner() {
  const m = usePlatformStore((s) => s.maintenance);
  const isAdmin = useSession((s) => s.profile?.role === "super_admin");
  const [dismissed, setDismissed] = useState(readDismissed);
  const stamp = m.updated_at || "none";

  if (!maintenanceActive(m) || dismissed === stamp) return null;

  function close() {
    writeDismissed(stamp);
    setDismissed(stamp);
  }

  return (
    <div className="maint-notice" role="status">
      <span className="maint-notice__icon"><Icon name="warning" size={20} /></span>
      <p className="maint-notice__text">
        {describeMaintenance(m)}
        {m.message ? ` ${m.message}` : ""}
        {isAdmin && <> <Link to="/admin/settings" className="maint-notice__link">Manage maintenance</Link></>}
      </p>
      <button type="button" className="maint-notice__close" onClick={close} aria-label="Dismiss maintenance notice">
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
