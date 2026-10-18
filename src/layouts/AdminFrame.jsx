// src/layouts/AdminFrame.jsx — MODIFIED (Phase 3: live notification bell)
//
// AIM
// The frame for platform admin pages (/admin/*): the AppShell with the admin menu. Screens that
// are not built yet (transactions, reports, audit, support) show the ComingSoon page.
// The business detail page /admin/businesses/:id is handled by AdminBusinesses' child route.

import { Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/shell/AppShell.jsx";
import ComingSoonPage from "../pages/shared/ComingSoonPage.jsx";
import { FullPageLoader } from "../router/guards.jsx";
import { ADMIN_NAV } from "../modules/adminNav.js";
import { useSession } from "../store/sessionStore.js";
import { useBusinessStore } from "../store/businessStore.js";
import useBrand from "../hooks/useBrand.js";

export function AdminScreen() {
  const params = useParams();
  const first = (params["*"] || "").split("/")[0];
  const item = ADMIN_NAV.find((i) => i.path === first);
  if (!item) return <ComingSoonPage titleAs="h2" name="Page not found" backTo="/admin" backLabel="Back to dashboard" />;
  if (!item.element) return <ComingSoonPage titleAs="h2" name={item.label} phase={item.phase} backTo="/admin" backLabel="Back to dashboard" />;
  const Screen = item.element;
  return <Suspense fallback={<FullPageLoader />}><Screen /></Suspense>;
}

export default function AdminFrame() {
  const navigate = useNavigate();
  const brand = useBrand();
  const profile = useSession((s) => s.profile);
  const user = useSession((s) => s.user);
  const nav = ADMIN_NAV.map((i) => ({ to: i.path ? `/admin/${i.path}` : "/admin", label: i.label, icon: i.icon, end: i.end }));

  async function signOut() {
    await useSession.getState().signOut();
    useBusinessStore.getState().reset();
    navigate("/", { replace: true });
  }

  return (
    <AppShell nav={nav} tabs={["/admin", "/admin/businesses", "/admin/users", "/admin/settings"]}
      user={{ name: profile?.full_name || user?.email, email: user?.email, role: "Super admin", avatarUrl: profile?.avatar_url }}
      business={{ name: `${brand.name} admin`, subtitle: "Platform" }}
      bellTo="live" profileTo="/account" helpHref={brand.mailto}
      onSwitchBusiness={() => navigate("/businesses")} onSignOut={signOut} />
  );
}
