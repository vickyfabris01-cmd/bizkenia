// src/layouts/PublicLayout.jsx — MODIFIED (header links: Explore businesses, Shop and rent; footer Sign in / Sign out follows the session)
//
// AIM
// The frame for every public page: header (logo, links, theme, sign in / account), the page,
// and the footer. On phones the links move into a menu drawer. The product name and support
// address come from useBrand(), so a change in Admin > Settings shows everywhere.
//
// USAGE (as a layout route)  <Route element={<PublicLayout />}> ...pages... </Route>

import "./PublicLayout.css";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button, Icon, ThemeToggle } from "../components/ui";
import { Drawer } from "../components/modals/Modal.jsx";
import NotificationBell from "../components/notifications/NotificationBell.jsx";
import UserMenu from "../components/shell/UserMenu.jsx";
import BrandLogo from "../components/shell/BrandLogo.jsx";
import useBrand from "../hooks/useBrand.js";
import { useSession } from "../store/sessionStore.js";
import { useBusinessStore } from "../store/businessStore.js";

const LINKS = [
  { to: "/explore", label: "Explore businesses" },
  { to: "/shop-rent", label: "Shop and rent" },
  { to: "/about", label: "About" },
  { to: "/help", label: "Help" },
  { to: "/pricing", label: "For business owners" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const hasBusiness = useBusinessStore((s) => s.memberships.length > 0);
  const name = profile?.full_name || user?.email || "";
  const navigate = useNavigate();

  const signOut = async () => {
    setOpen(false);
    await useSession.getState().signOut();
    useBusinessStore.getState().reset();
    navigate("/");
  };
  const menuLinks = [
    ...(hasBusiness ? [{ to: "/businesses", label: "My businesses", icon: "building" }] : []),
    { to: "/orders", label: "My orders", icon: "file" },
    { to: "/wishlist", label: "Wishlist", icon: "check" },
    { to: "/account/requests", label: "My requests", icon: "file" },
    { to: "/notifications", label: "Notifications", icon: "bell" },
    { to: "/help/tickets", label: "My tickets", icon: "help" },
  ];

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__brand" aria-label="Home">
          <BrandLogo contextual />
        </Link>

        <nav className="site-header__nav" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `site-link${isActive ? " is-active" : ""}`}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-header__actions">
          <ThemeToggle />
          {user ? (
            <NotificationBell />
          ) : null}
          {user ? (
            <div className="site-hide-sm">
              <UserMenu
                user={{ name, email: user.email, avatarUrl: profile?.avatar_url, avatarId: user?.id, avatarDesign: profile?.avatar_design }}
                profileTo="/account"
                links={menuLinks}
                onSignOut={signOut}
              />
            </div>
          ) : (
            <>
              <Button as={Link} to="/login" variant="ghost" size="sm" className="site-hide-sm">Sign in</Button>
              <Button as={Link} to="/signup" size="sm" className="site-hide-sm">Create account</Button>
            </>
          )}
          <button type="button" className="site-header__menu" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Icon name="menu" size={22} />
          </button>
        </div>
      </div>

      <Drawer isOpen={open} onClose={() => setOpen(false)} title="Menu" width={320}>
        <ul className="site-drawer">
          {LINKS.map((l) => (
            <li key={l.to}><Link to={l.to} onClick={() => setOpen(false)}>{l.label}</Link></li>
          ))}
          <li className="site-drawer__sep" />
          {user ? (
            <>
              {hasBusiness && <li><Link to="/businesses" onClick={() => setOpen(false)}>My businesses</Link></li>}
              <li><Link to="/orders" onClick={() => setOpen(false)}>My orders</Link></li>
              <li><Link to="/wishlist" onClick={() => setOpen(false)}>Wishlist</Link></li>
              <li><Link to="/account/requests" onClick={() => setOpen(false)}>My requests</Link></li>
              <li><Link to="/notifications" onClick={() => setOpen(false)}>Notifications</Link></li>
              <li><Link to="/help/tickets" onClick={() => setOpen(false)}>My tickets</Link></li>
              <li><Link to="/account" onClick={() => setOpen(false)}>My account</Link></li>
              <li><button type="button" className="site-drawer__out" onClick={signOut}>Sign out</button></li>
            </>
          ) : (
            <>
              <li><Link to="/login" onClick={() => setOpen(false)}>Sign in</Link></li>
              <li><Link to="/signup" onClick={() => setOpen(false)}>Create an account</Link></li>
            </>
          )}
        </ul>
      </Drawer>
    </header>
  );
}

export function SiteFooter() {
  const brand = useBrand();
  const user = useSession((s) => s.user);
  const navigate = useNavigate();

  const signOut = async () => {
    await useSession.getState().signOut();
    useBusinessStore.getState().reset();
    navigate("/");
  };

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__about">
          <BrandLogo variant="full" size={72} />
          <p>{brand.tagline}</p>
          <a href={brand.mailto}>{brand.supportEmail}</a>
        </div>
        <nav aria-label="Company">
          <h2>Company</h2>
          <Link to="/about">About</Link>
          <Link to="/pricing">Pricing for owners</Link>
          <Link to="/contact">Contact</Link>
        </nav>
        <nav aria-label="Support">
          <h2>Support</h2>
          <Link to="/help">Help centre</Link>
          <Link to="/terms">Terms of use</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
        <nav aria-label="Discover">
          <h2>Discover</h2>
          <Link to="/explore">Find a business</Link>
          <Link to="/shop-rent">Shop and rent</Link>
          <Link to="/explore?type=rental">Rentals</Link>
          <Link to="/start">List your business</Link>
          {user ? (
            <button type="button" className="site-footer__out" onClick={signOut}>Sign out</button>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </nav>
      </div>
      <p className="site-footer__copy">© {new Date().getFullYear()} {brand.name}. All rights reserved.</p>
    </footer>
  );
}

export default function PublicLayout() {
  return (
    <div className="site">
      <a className="site-skip" href="#main-content">Skip to content</a>
      <SiteHeader />
      <main id="main-content" className="site__main" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}