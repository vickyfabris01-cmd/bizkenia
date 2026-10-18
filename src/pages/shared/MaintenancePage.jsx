// src/pages/shared/MaintenancePage.jsx — NEW FILE (Phase 5, step 3)
//
// AIM
// What everyone except a super admin sees while maintenance mode is on: the product name, a friendly
// heading, the message the super admin wrote (or a default), a "Check again" button and the support
// email. It has no menu and no links into the app, so nobody lands on a half-working screen.
// MaintenancePage is shown by router/MaintenanceGate.jsx; MaintenanceRoute is the /maintenance URL
// (it sends people home when maintenance is off, and shows the page to a super admin as a preview).

import "./MaintenancePage.css";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Button, Card, Icon } from "../../components/ui";
import useBrand from "../../hooks/useBrand.js";
import { usePlatformStore } from "../../store/platformStore.js";
import logo from "../../assets/bizkenia-logo.png";

const DEFAULT_TEXT = "We are making improvements and will be back shortly. Thank you for your patience.";

export default function MaintenancePage() {
  const brand = useBrand();
  const message = usePlatformStore((s) => s.maintenance.message);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    await usePlatformStore.getState().load(true);
    setChecking(false);
  }

  return (
    <main className="maint">
      <Card className="maint__card" padding="lg">
        <img className="maint__logo" src={logo} alt={brand.name} />
        <span className="maint__icon" aria-hidden="true"><Icon name="settings" size={28} /></span>
        <h1 className="maint__title">We'll be back soon</h1>
        <p className="maint__text">{message || DEFAULT_TEXT}</p>
        <div className="maint__actions">
          <Button loading={checking} onClick={check}>Check again</Button>
          <Button as="a" href={brand.mailto} variant="outline">Contact support</Button>
        </div>
        <p className="maint__small">{brand.name} is down for maintenance. Your data is safe.</p>
      </Card>
    </main>
  );
}

export function MaintenanceRoute() {
  const enabled = usePlatformStore((s) => s.maintenance.enabled);
  const loaded = usePlatformStore((s) => s.loaded);
  if (loaded && !enabled) return <Navigate to="/" replace />;
  return <MaintenancePage />;
}
