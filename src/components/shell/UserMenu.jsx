// src/components/shell/UserMenu.jsx — MODIFIED (Phase 3: extra links so it also serves the public site)
//
// AIM
// The avatar button in the top bar and the menu it opens: who is signed in, Profile,
// Switch business, Theme (Light / Dark / System), Help & Support, Sign out.
// Matches the "Avatar menu" in the design system sheet.
//
// PROPS
//   user              { name, email, role, avatarUrl, avatarId, avatarDesign }  (the last two draw a designed avatar when there is no photo)
//   links             extra links [{ to, label, icon }] shown after Profile (Phase 3)
//   profileTo         link for "Profile" (omit to hide it)
//   onSwitchBusiness  function; "Switch business" shows only when given
//   helpHref          link for "Help & Support" (default: mailto the support address from brand.js)
//   onSignOut         function; "Sign out" shows only when given
//
// BEHAVIOUR
// A disclosure button (aria-expanded). Closes on Escape, on a click outside, and after a choice.
// Escape returns focus to the avatar button.

import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import useBrand from "../../hooks/useBrand.js";
import "./Shell.css";
import Avatar from "../ui/Avatar.jsx";
import Icon from "../ui/Icon.jsx";
import ThemeToggle from "../ui/ThemeToggle.jsx";

export default function UserMenu({ user, profileTo, links = [], onSwitchBusiness, helpHref, onSignOut }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);
  const brand = useBrand();
  const help = helpHref || brand.mailto;

  return (
    <div className="shell-user" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="shell-user__button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Account menu for ${user?.name || "you"}`}
      >
        <Avatar name={user?.name} src={user?.avatarUrl} id={user?.avatarId} design={user?.avatarDesign} size="md" />
        <span className="shell-user__who">
          <span className="shell-user__name">{user?.name || "Account"}</span>
          {user?.role && <span className="shell-user__role">{user.role}</span>}
        </span>
        <Icon name="chevron-down" size={16} className="shell-user__chevron" />
      </button>

      {open && (
        <div id={panelId} className="shell-menu">
          <div className="shell-menu__head">
            <Avatar name={user?.name} src={user?.avatarUrl} id={user?.avatarId} design={user?.avatarDesign} size="lg" />
            <div className="shell-menu__ident">
              <p className="shell-menu__name">{user?.name || "Account"}</p>
              {user?.email && <p className="shell-menu__email">{user.email}</p>}
            </div>
          </div>

          <ul className="shell-menu__list">
            {profileTo && (
              <li>
                <Link className="shell-menu__item" to={profileTo} onClick={close}>
                  <Icon name="user" size={18} />
                  <span>Profile</span>
                </Link>
              </li>
            )}
            {links.map((l) => (
              <li key={l.to}>
                <Link className="shell-menu__item" to={l.to} onClick={close}>
                  <Icon name={l.icon || "file"} size={18} />
                  <span>{l.label}</span>
                </Link>
              </li>
            ))}
            {onSwitchBusiness && (
              <li>
                <button
                  type="button"
                  className="shell-menu__item"
                  onClick={() => {
                    close();
                    onSwitchBusiness();
                  }}
                >
                  <Icon name="swap" size={18} />
                  <span>Switch business</span>
                </button>
              </li>
            )}
            <li className="shell-menu__theme">
              <span className="shell-menu__label">Theme</span>
              <ThemeToggle variant="segmented" />
            </li>
            <li>
              <a className="shell-menu__item" href={help} onClick={close}>
                <Icon name="help" size={18} />
                <span>Help &amp; Support</span>
              </a>
            </li>
            {onSignOut && (
              <li>
                <button
                  type="button"
                  className="shell-menu__item shell-menu__item--danger"
                  onClick={() => {
                    close();
                    onSignOut();
                  }}
                >
                  <Icon name="logout" size={18} />
                  <span>Sign out</span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}