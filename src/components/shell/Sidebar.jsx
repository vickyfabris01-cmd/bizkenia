// src/components/shell/Sidebar.jsx — MODIFIED (logo follows the current business)
//
// AIM
// The left navigation on tablets and desktops. Full width (labels) from 1024px, an icon-only
// rail from 768px. It is hidden on phones, where the bottom tab bar takes over.
// It only draws the nav items it is given, so every business type can supply its own.
//
// PROPS
//   nav       array of { to, label, icon, end?, section? }
//               to       route path        label  text    icon  a name from ui/Icon.jsx
//               end      match this path exactly (use for the "Dashboard" root item)
//               section  optional small heading shown above the first item of a group
//   business  optional { name, subtitle } shown at the bottom (the business being managed)

import { NavLink } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import BrandLogo from "./BrandLogo.jsx";

export default function Sidebar({ nav = [], business }) {
  let lastSection = null;

  return (
    <aside className="shell-sidebar" aria-label="Main navigation">
      <div className="shell-sidebar__brand">
        <BrandLogo contextual />
      </div>

      <nav className="shell-sidebar__nav">
        <ul className="shell-sidebar__list">
          {nav.map((item) => {
            const showSection = item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;
            return (
              <li key={item.to}>
                {showSection && <p className="shell-sidebar__section">{item.section}</p>}
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `shell-navlink${isActive ? " is-active" : ""}`
                  }
                  title={item.label}
                >
                  <Icon name={item.icon || "dashboard"} size={20} />
                  <span className="shell-navlink__label">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {business?.name && (
        <div className="shell-sidebar__business">
          <span className="shell-sidebar__business-mark" aria-hidden="true">
            {business.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="shell-sidebar__business-text">
            <span className="shell-sidebar__business-name">{business.name}</span>
            {business.subtitle && (
              <span className="shell-sidebar__business-sub">{business.subtitle}</span>
            )}
          </span>
        </div>
      )}
    </aside>
  );
}