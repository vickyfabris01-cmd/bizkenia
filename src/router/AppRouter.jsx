// src/router/AppRouter.jsx — MODIFIED FILE (adds /shop-rent; Phase 3: help centre, my tickets, notification centre; Phase 5 step 3: maintenance gate and /maintenance)
//
// AIM
// Every route of the site. Unbuilt screens are NOT missing: they open the ComingSoon page
// (inside /app/:slug and /admin they are driven by the module registry / admin menu).
//
//   public      /  /explore  /shop-rent  /b/:slug (shop: /browse /p/:id /cart)  /pricing  /about  /contact  /terms  /privacy  /help  /maintenance
//               /invoice/:token (one shared invoice)  /invite/:token (manager invite)
//   auth        /login  /signup  /confirm  /forgot-password  /reset-password  /auth/callback
//   signed in   /b/:slug/checkout  /orders  /orders/:id  /wishlist  /account  /account/requests  /businesses  /b/:slug/request  /start  /start/details  /start/subscribe  /start/status
//   business    /app/:slug/*   (members only; the menu comes from modules/registry.js)
//   admin       /admin/*       (super admin only)
//   developer   /preview/*     (development builds only)

import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PageErrorBoundary } from "../components/feedback/ErrorBoundary.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import { ROUTE_META } from "./routes";
import { applySeo } from "../lib/seo.js";
import { RequireAuth, RequireMember, RequireSuperAdmin } from "./guards.jsx";
import PublicLayout from "../layouts/PublicLayout.jsx";
import MaintenanceGate from "./MaintenanceGate.jsx";
import useBrand from "../hooks/useBrand.js";
import { useSession } from "../store/sessionStore.js";
import { useBusinessStore } from "../store/businessStore.js";

const page = (loader) => lazy(loader);
const HomePage = page(() => import("../pages/public/HomePage.jsx"));
const ExplorePage = page(() => import("../pages/public/ExplorePage.jsx"));
const ShopRentPage = page(() => import("../pages/public/ShopRentPage.jsx"));
const ShopBrowsePage = page(() => import("../pages/storefront/BrowsePage.jsx"));
const ShopProductPage = page(() => import("../pages/storefront/ProductPage.jsx"));
const ShopCartPage = page(() => import("../pages/storefront/CartPage.jsx"));
const ShopCheckoutPage = page(() => import("../pages/storefront/CheckoutPage.jsx"));
const MyOrdersPage = page(() => import("../pages/storefront/OrdersPage.jsx"));
const OrderDetailPage = page(() => import("../pages/storefront/OrdersPage.jsx").then((m) => ({ default: m.OrderDetail })));
const WishlistPage = page(() => import("../pages/storefront/WishlistPage.jsx"));
const BusinessPage = page(() => import("../pages/public/BusinessPage.jsx"));
const PricingPage = page(() => import("../pages/public/PricingPage.jsx"));
const NotFoundPage = page(() => import("../pages/public/NotFoundPage.jsx"));
const MaintenanceRoute = page(() => import("../pages/shared/MaintenancePage.jsx").then((m) => ({ default: m.MaintenanceRoute })));
const staticPage = (name) => page(() => import("../pages/public/StaticPages.jsx").then((m) => ({ default: m[name] })));
const AboutPage = staticPage("AboutPage");
const ContactPage = staticPage("ContactPage");
const TermsPage = staticPage("TermsPage");
const PrivacyPage = staticPage("PrivacyPage");
const HelpPage = page(() => import("../pages/help/HelpCentrePage.jsx"));
const MyTicketsPage = page(() => import("../pages/help/MyTicketsPage.jsx"));
const NotificationsPage = page(() => import("../pages/notifications/NotificationsPage.jsx"));

const LoginPage = page(() => import("../pages/auth/LoginPage.jsx"));
const SignupPage = page(() => import("../pages/auth/SignupPage.jsx"));
const ConfirmPage = page(() => import("../pages/auth/ConfirmPage.jsx"));
const ForgotPasswordPage = page(() => import("../pages/auth/ForgotPasswordPage.jsx"));
const ResetPasswordPage = page(() => import("../pages/auth/ResetPasswordPage.jsx"));
const AuthCallbackPage = page(() => import("../pages/auth/AuthCallbackPage.jsx"));

const RequestRoomPage = page(() => import("../pages/rental/RequestRoomPage.jsx"));
const MyRequestsPage = page(() => import("../pages/rental/MyRequestsPage.jsx"));
const PublicInvoicePage = page(() => import("../pages/rental/PublicInvoicePage.jsx"));
const InvitePage = page(() => import("../pages/auth/InvitePage.jsx"));

const AccountPage = page(() => import("../pages/account/AccountPage.jsx"));
const MyBusinessesPage = page(() => import("../pages/account/MyBusinessesPage.jsx"));

const StartPage = page(() => import("../pages/onboarding/StartPage.jsx"));
const DetailsPage = page(() => import("../pages/onboarding/DetailsPage.jsx"));
const SubscribePage = page(() => import("../pages/onboarding/SubscribePage.jsx"));
const StatusPage = page(() => import("../pages/onboarding/StatusPage.jsx"));

const BusinessAppFrame = page(() => import("../layouts/BusinessAppFrame.jsx"));
const ModuleScreen = page(() => import("../layouts/BusinessAppFrame.jsx").then((m) => ({ default: m.ModuleScreen })));
const AdminFrame = page(() => import("../layouts/AdminFrame.jsx"));
const AdminScreen = page(() => import("../layouts/AdminFrame.jsx").then((m) => ({ default: m.AdminScreen })));

const PreviewLayout = import.meta.env.DEV ? page(() => import("../pages/preview/PreviewPage.jsx")) : null;
const PreviewSection = import.meta.env.DEV
  ? page(() => import("../pages/preview/PreviewPage.jsx").then((m) => ({ default: m.PreviewSection })))
  : null;

function PageLoader() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
      <Spinner size="lg" label="Loading" />
    </div>
  );
}

/** Starts the session, platform settings and business list once, and keeps the tab title in step. */
function Boot() {
  const { pathname } = useLocation();
  const brand = useBrand();
  const user = useSession((s) => s.user);

  useEffect(() => { useSession.getState().init(); }, []);
  useEffect(() => {
    if (user) useBusinessStore.getState().load(user.id);
    else useBusinessStore.getState().reset();
  }, [user]);
  useEffect(() => {
    const meta = ROUTE_META[pathname];
    const tagline = brand.tagline || "";
    // Fixed pages come from routes.js; unknown or data-driven addresses are not indexed until the page sets its own text.
    const known = Boolean(meta);
    const dynamicPublic = /^\/(b|invoice|invite)\//.test(pathname);
    applySeo({
      title: meta?.title, brand: brand.name, description: meta?.desc || tagline,
      noindex: known ? Boolean(meta.private) : !dynamicPublic || pathname.startsWith("/invoice/") || pathname.startsWith("/invite/") || /\/(cart|checkout|request)$/.test(pathname),
    });
  }, [pathname, brand.name, brand.tagline]);
  return null;
}

function Guarded({ children }) {
  return <PageErrorBoundary>{children}</PageErrorBoundary>;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Boot />
      <Suspense fallback={<PageLoader />}>
        <MaintenanceGate>
        <Routes>
          {/* Public site */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Guarded><HomePage /></Guarded>} />
            <Route path="/explore" element={<Guarded><ExplorePage /></Guarded>} />
            <Route path="/shop-rent" element={<Guarded><ShopRentPage /></Guarded>} />
            <Route path="/b/:slug" element={<Guarded><BusinessPage /></Guarded>} />
            <Route path="/b/:slug/browse" element={<Guarded><ShopBrowsePage /></Guarded>} />
            <Route path="/b/:slug/p/:productId" element={<Guarded><ShopProductPage /></Guarded>} />
            <Route path="/b/:slug/cart" element={<Guarded><ShopCartPage /></Guarded>} />
            <Route element={<RequireAuth />}>
              <Route path="/b/:slug/checkout" element={<Guarded><ShopCheckoutPage /></Guarded>} />
              <Route path="/orders" element={<Guarded><MyOrdersPage /></Guarded>} />
              <Route path="/orders/:id" element={<Guarded><OrderDetailPage /></Guarded>} />
              <Route path="/wishlist" element={<Guarded><WishlistPage /></Guarded>} />
              <Route path="/b/:slug/request" element={<Guarded><RequestRoomPage /></Guarded>} />
            </Route>
            <Route path="/pricing" element={<Guarded><PricingPage /></Guarded>} />
            <Route path="/about" element={<Guarded><AboutPage /></Guarded>} />
            <Route path="/contact" element={<Guarded><ContactPage /></Guarded>} />
            <Route path="/terms" element={<Guarded><TermsPage /></Guarded>} />
            <Route path="/privacy" element={<Guarded><PrivacyPage /></Guarded>} />
            <Route path="/help" element={<Guarded><HelpPage /></Guarded>} />

            {/* Signed-in pages that use the public frame */}
            <Route element={<RequireAuth />}>
              <Route path="/help/tickets" element={<Guarded><MyTicketsPage /></Guarded>} />
              <Route path="/notifications" element={<Guarded><NotificationsPage /></Guarded>} />
              <Route path="/account" element={<Guarded><AccountPage /></Guarded>} />
              <Route path="/account/requests" element={<Guarded><MyRequestsPage /></Guarded>} />
              <Route path="/businesses" element={<Guarded><MyBusinessesPage /></Guarded>} />
              <Route path="/start" element={<Guarded><StartPage /></Guarded>} />
              <Route path="/start/details" element={<Guarded><DetailsPage /></Guarded>} />
              <Route path="/start/subscribe" element={<Guarded><SubscribePage /></Guarded>} />
              <Route path="/start/status" element={<Guarded><StatusPage /></Guarded>} />
            </Route>
          </Route>

          {/* Shared links: open without signing in */}
          <Route path="/invoice/:token" element={<Guarded><PublicInvoicePage /></Guarded>} />
          <Route path="/invite/:token" element={<Guarded><InvitePage /></Guarded>} />

          {/* Authentication (own centred layout) */}
          <Route path="/login" element={<Guarded><LoginPage /></Guarded>} />
          <Route path="/signup" element={<Guarded><SignupPage /></Guarded>} />
          <Route path="/confirm" element={<Guarded><ConfirmPage /></Guarded>} />
          <Route path="/forgot-password" element={<Guarded><ForgotPasswordPage /></Guarded>} />
          <Route path="/reset-password" element={<Guarded><ResetPasswordPage /></Guarded>} />
          <Route path="/auth/callback" element={<Guarded><AuthCallbackPage /></Guarded>} />

          {/* One business */}
          <Route element={<RequireAuth />}>
            <Route path="/app/:slug" element={<RequireMember />}>
              <Route element={<BusinessAppFrame />}>
                <Route index element={<Guarded><ModuleScreen /></Guarded>} />
                <Route path="*" element={<Guarded><ModuleScreen /></Guarded>} />
              </Route>
            </Route>
          </Route>

          {/* Platform admin */}
          <Route element={<RequireSuperAdmin />}>
            <Route path="/admin" element={<AdminFrame />}>
              <Route index element={<Guarded><AdminScreen /></Guarded>} />
              <Route path="*" element={<Guarded><AdminScreen /></Guarded>} />
            </Route>
          </Route>

          {/* Developer preview (development builds only) */}
          {PreviewLayout && (
            <Route path="/preview" element={<PreviewLayout />}>
              <Route index element={<Navigate to="components" replace />} />
              <Route path=":section" element={<PreviewSection />} />
            </Route>
          )}

          <Route path="/maintenance" element={<MaintenanceRoute />} />
          <Route path="/not-found" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </MaintenanceGate>
      </Suspense>
    </BrowserRouter>
  );
}