// src/router/guards.jsx — NEW FILE
//
// AIM
// The route guards. Each one is a layout route: it renders <Outlet/> when the person may
// enter, otherwise redirects to a page that explains what to do (never a blank screen).
//
//   RequireAuth         signed in, else /login?next=…
//   RequireSuperAdmin   super admin, else the 404 page
//   RequireMember       loads the business from :slug and checks the person is an owner or
//                       manager OF THAT BUSINESS and that it is active; fills BusinessContext.
//                       The super admin gets no special entry: a business dashboard is a no-go
//                       zone for them (they see business data from /admin instead) and is sent
//                       to /admin/businesses unless they truly are a member of it.
//                       Maintenance level 3: when the business's type is switched off in Admin > Settings, everyone
//                       except a super admin sees the maintenance page here instead of the dashboard.
//   RoleRoute           ONE path, a different screen per role:
//                         <RoleRoute screens={{ owner: <A/>, manager: <B/> }} />

import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import Spinner from "../components/ui/Spinner.jsx";
import { useSession } from "../store/sessionStore.js";
import { useBusinessStore } from "../store/businessStore.js";
import { BusinessContext, useBusinessContext } from "./BusinessContext.jsx";
import { Card, EmptyState, Button } from "../components/ui";
import { Link } from "react-router-dom";
import MaintenancePage from "../pages/shared/MaintenancePage.jsx";
import { usePlatformStore } from "../store/platformStore.js";
import { typeLabel } from "../config/counties.js";

export function FullPageLoader() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60dvh" }}>
      <Spinner size="lg" label="Loading" />
    </div>
  );
}

export function RequireAuth() {
  const user = useSession((s) => s.user);
  const loading = useSession((s) => s.loading);
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

export function RequireSuperAdmin() {
  const loading = useSession((s) => s.loading);
  const profile = useSession((s) => s.profile);
  const user = useSession((s) => s.user);
  const location = useLocation();
  if (loading || (user && !profile)) return <FullPageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (profile?.role !== "super_admin") return <Navigate to="/not-found" replace />;
  return <Outlet />;
}

export function RequireMember() {
  const { slug } = useParams();
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const memberships = useBusinessStore((s) => s.memberships);
  const loadedFor = useBusinessStore((s) => s.loadedFor);
  const downTypes = usePlatformStore((s) => s.maintenance.types);

  if (!user || !profile || loadedFor !== user.id) return <FullPageLoader />;

  const own = memberships.find((m) => m.business.slug === slug) || null;

  // Super admin who is not a member of this business: send to the admin area.
  if (!own && profile.role === "super_admin") return <Navigate to="/admin/businesses" replace />;

  if (!own) {
    return (
      <Card style={{ margin: "var(--space-8) auto", maxWidth: 520 }}>
        <EmptyState
          icon="search"
          title="Business not found"
          description="This business does not exist, or you are not a member of it."
          action={<Button as={Link} to="/businesses">My businesses</Button>}
        />
      </Card>
    );
  }

  const { business, role } = own;
  if (business.status !== "active") {
    return <Navigate to={`/start/status?business=${business.slug}`} replace />;
  }
  if (downTypes.includes(business.business_type) && profile.role !== "super_admin") {
    return <MaintenancePage partial title={`${typeLabel(business.business_type)} dashboards are being updated`} />;
  }

  return (
    <BusinessContext.Provider value={{ business, role }}>
      <Outlet />
    </BusinessContext.Provider>
  );
}

/** One path, a different screen for each role. `fallback` shows for any other role. */
export function RoleRoute({ screens = {}, fallback = null }) {
  const ctx = useBusinessContext();
  const role = ctx?.role;
  const screen = screens[role] ?? fallback;
  if (screen) return screen;
  return (
    <Card style={{ margin: "var(--space-8) auto", maxWidth: 520 }}>
      <EmptyState icon="user" title="Owners only" description="This screen is only for the business owner." />
    </Card>
  );
}