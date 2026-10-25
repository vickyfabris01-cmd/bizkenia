// src/layouts/BusinessAppFrame.jsx — MODIFIED FILE (Phase 3 live bell; shows the business logo)
//
// AIM
// The signed-in frame for one business (/app/:slug/*): the AppShell with the menu supplied by
// the business type's module and the person's role. Every menu item opens a screen: the real
// one when the module registered an `element`, otherwise the ComingSoon page naming the phase.
//
// HOW A SCREEN IS CHOSEN (ModuleScreen)
//   /app/:slug                  -> the nav item with path ""
//   /app/:slug/properties/12    -> the nav item with path "properties" (first segment)
//   the same path can belong to different roles (staff and residents both have "")
//   no such item for this role  -> "No access" card (if another role has it) or "not found"

import { Suspense } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/shell/AppShell.jsx";
import { Button, Card, EmptyState } from "../components/ui";
import { FullPageLoader } from "../router/guards.jsx";
import { useBusinessContext } from "../router/BusinessContext.jsx";
import ComingSoonPage from "../pages/shared/ComingSoonPage.jsx";
import { getModule, navFor } from "../modules/index.js";
import { ROLE_LABEL } from "../lib/permissions.js";
import { useSession } from "../store/sessionStore.js";
import { useBusinessStore } from "../store/businessStore.js";
import useBrand from "../hooks/useBrand.js";
import useBusinessBrand from "../hooks/useBusinessBrand.js";
import { typeLabel } from "../config/counties.js";

export function ModuleScreen() {
  const { business, role } = useBusinessContext();
  const params = useParams();
  const first = (params["*"] || "").split("/")[0];
  const mod = getModule(business.business_type);
  const all = mod?.nav || [];
  const item = all.find((i) => i.path === first && i.roles.includes(role)) || all.find((i) => i.path === first);
  const base = `/app/${business.slug}`;

  if (!item) {
    return <Card style={{ margin: "var(--space-8) auto", maxWidth: 520 }}>
      <EmptyState icon="search" title="Page not found" description="This page does not exist in this business."
        action={<Button as={Link} to={base}>Go to the dashboard</Button>} /></Card>;
  }
  if (!item.roles.includes(role)) {
    return <Card style={{ margin: "var(--space-8) auto", maxWidth: 520 }}>
      <EmptyState icon="user" title="No access" description="Your role in this business does not include this screen."
        action={<Button as={Link} to={base}>Go to the dashboard</Button>} /></Card>;
  }
  if (!item.element) return <ComingSoonPage titleAs="h2" name={item.label} phase={item.phase} backTo={base} backLabel="Back to dashboard" />;
  const Screen = item.element;
  return <Suspense fallback={<FullPageLoader />}><Screen /></Suspense>;
}

export default function BusinessAppFrame() {
  const { business, role } = useBusinessContext();
  const navigate = useNavigate();
  const brand = useBrand();
  const profile = useSession((s) => s.profile);
  const user = useSession((s) => s.user);
  useBusinessBrand(business); // sidebar and top bar: this business logo, or its first letter

  const nav = navFor(business.business_type, role).map((i) => ({
    to: i.path ? `/app/${business.slug}/${i.path}` : `/app/${business.slug}`,
    label: i.label, icon: i.icon, end: i.end,
  }));

  async function signOut() {
    await useSession.getState().signOut();
    useBusinessStore.getState().reset();
    navigate("/", { replace: true });
  }

  return (
    <AppShell
      nav={nav}
      user={{ name: profile?.full_name || user?.email, email: user?.email, role: ROLE_LABEL[role] || role, avatarUrl: profile?.avatar_url, avatarId: user?.id, avatarDesign: profile?.avatar_design }}
      business={{ name: business.name, subtitle: `${typeLabel(business.business_type)} business` }}
      bellTo="live"
      profileTo="/account"
      helpHref={brand.mailto}
      onSwitchBusiness={() => navigate("/businesses")}
      onSignOut={signOut}
    />
  );
}