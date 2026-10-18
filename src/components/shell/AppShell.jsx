// src/components/shell/AppShell.jsx — NEW FILE
//
// AIM
// The frame around every signed-in page: sidebar (tablet and desktop), top bar, and a bottom
// tab bar with "More" (phones). It knows nothing about roles or business types. The caller
// passes the navigation list, so a rental manager, a shop owner and a super admin can all use
// the same shell with different menus.
//
// PROPS
//   nav               [{ to, label, icon, end?, section? }]  (see Sidebar.jsx)
//   tabs              optional list of `to` paths to pin as the phone tabs (see BottomTabBar.jsx)
//   user              { name, email, role, avatarUrl }
//   business          { name, subtitle }   shown at the bottom of the sidebar
//   title             page title in the top bar. When omitted it follows the active nav item.
//   unreadCount, bellTo                    the notification bell
//   profileTo, onSwitchBusiness, helpHref, onSignOut   avatar menu (see UserMenu.jsx)
//   children          the page. When omitted the matching child route renders (<Outlet />).
//
// LAYOUT RULES
//   under 768px     top bar + bottom tabs, content full width
//   768 to 1023px   icon-only sidebar rail + top bar
//   1024px and up   full sidebar + top bar
//
// USAGE (as a layout route)
//   <Route element={<AppShell nav={NAV} user={user} onSignOut={signOut} />}>
//     <Route path="/manage" element={<Dashboard />} />
//   </Route>

import "./Shell.css";
import { Outlet, useLocation } from "react-router-dom";
import BottomTabBar from "./BottomTabBar.jsx";
import Sidebar from "./Sidebar.jsx";
import TopBar from "./TopBar.jsx";

/** The nav item whose path best matches the current URL (longest match wins). */
function activeItem(nav, pathname) {
  let best = null;
  for (const item of nav) {
    const exact = pathname === item.to;
    const inside = !item.end && pathname.startsWith(`${item.to}/`);
    if ((exact || inside) && (!best || item.to.length > best.to.length)) best = item;
  }
  return best;
}

export default function AppShell({
  nav = [],
  tabs,
  user,
  business,
  title,
  unreadCount = 0,
  bellTo,
  profileTo,
  onSwitchBusiness,
  helpHref,
  onSignOut,
  children,
}) {
  const { pathname } = useLocation();
  const pageTitle = title ?? activeItem(nav, pathname)?.label;

  return (
    <div className="shell">
      <a className="shell__skip" href="#main-content">
        Skip to content
      </a>

      <Sidebar nav={nav} business={business} />

      <div className="shell__column">
        <TopBar
          title={pageTitle}
          unreadCount={unreadCount}
          bellTo={bellTo}
          user={user}
          profileTo={profileTo}
          onSwitchBusiness={onSwitchBusiness}
          helpHref={helpHref}
          onSignOut={onSignOut}
        />

        <main id="main-content" className="shell__content" tabIndex={-1}>
          {children ?? <Outlet />}
        </main>
      </div>

      <BottomTabBar nav={nav} tabs={tabs} />
    </div>
  );
}