// src/components/shell/TopBar.jsx — MODIFIED (Phase 3 live bell; logo follows the current business)
//
// AIM
// The bar across the top of every signed-in page.
//   Phones:   logo mark, page title, theme toggle, bell, avatar menu
//   Desktop:  page title, theme toggle, bell, avatar menu with name and role
//
// PROPS
//   title            page title shown on the left
//   unreadCount      number on the bell (hidden when 0)
//   bellTo           where the bell goes (omit to hide the bell)
//   user, profileTo, onSwitchBusiness, helpHref, onSignOut   passed to UserMenu

import { Link } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import ThemeToggle from "../ui/ThemeToggle.jsx";
import BrandLogo from "./BrandLogo.jsx";
import NotificationBell from "../notifications/NotificationBell.jsx";
import UserMenu from "./UserMenu.jsx";

export default function TopBar({
  title,
  unreadCount = 0,
  bellTo,
  user,
  profileTo,
  onSwitchBusiness,
  helpHref,
  onSignOut,
}) {
  const unreadLabel =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  return (
    <header className="shell-topbar">
      <div className="shell-topbar__left">
        <BrandLogo contextual showName={false} className="shell-topbar__mark" />
        {title && <h1 className="shell-topbar__title">{title}</h1>}
      </div>

      <div className="shell-topbar__right">
        <ThemeToggle />

        {bellTo === "live" ? <NotificationBell /> : bellTo && (
          <Link to={bellTo} className="shell-topbar__bell" aria-label={unreadLabel}>
            <Icon name="bell" size={20} />
            {unreadCount > 0 && (
              <span className="shell-topbar__badge" aria-hidden="true">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        )}

        <UserMenu
          user={user}
          profileTo={profileTo}
          onSwitchBusiness={onSwitchBusiness}
          helpHref={helpHref}
          onSignOut={onSignOut}
        />
      </div>
    </header>
  );
}