// src/components/shell/BottomTabBar.jsx — NEW FILE
//
// AIM
// The tab bar fixed to the bottom of the screen on phones (hidden from 768px up, where the
// sidebar takes over). Shows up to four main destinations; when there are more, a "More"
// tab opens a sheet listing the rest, so nothing is out of reach.
//
// PROPS
//   nav    same array as Sidebar: { to, label, icon, end? }
//   tabs   optional array of `to` paths to pin as the main tabs (default: the first four).
//          With five items or fewer, every item becomes a tab and there is no "More".

import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import Modal from "../modals/Modal.jsx";

const MAX_TABS = 4;

export default function BottomTabBar({ nav = [], tabs }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();

  const needsMore = nav.length > MAX_TABS + 1;
  let primary = nav;
  let rest = [];

  if (needsMore) {
    primary = tabs?.length
      ? tabs.map((to) => nav.find((item) => item.to === to)).filter(Boolean).slice(0, MAX_TABS)
      : nav.slice(0, MAX_TABS);
    rest = nav.filter((item) => !primary.includes(item));
  }

  // Highlight "More" when the current page is one of the items inside it
  const moreActive = rest.some((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );

  return (
    <>
      <nav className="shell-tabbar" aria-label="Main navigation">
        <ul className="shell-tabbar__list">
          {primary.map((item) => (
            <li key={item.to} className="shell-tabbar__cell">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) => `shell-tab${isActive ? " is-active" : ""}`}
              >
                <Icon name={item.icon || "dashboard"} size={22} />
                <span className="shell-tab__label">{item.label}</span>
              </NavLink>
            </li>
          ))}

          {needsMore && (
            <li className="shell-tabbar__cell">
              <button
                type="button"
                className={`shell-tab${moreActive ? " is-active" : ""}`}
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
              >
                <Icon name="dots" size={22} />
                <span className="shell-tab__label">More</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      {needsMore && (
        <Modal isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="More" size="sm">
          <ul className="shell-more">
            {rest.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) => `shell-more__item${isActive ? " is-active" : ""}`}
                >
                  <Icon name={item.icon || "dashboard"} size={20} />
                  <span>{item.label}</span>
                  <Icon name="chevron-right" size={16} className="shell-more__arrow" />
                </NavLink>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}