// src/components/notifications/NotificationBell.jsx — NEW FILE
//
// AIM
// The bell in the top bar and on the public header: unread count, a dropdown with the latest alerts,
// "Mark all read" and "See all". New alerts arrive live (realtime) and also pop up as a toast, so a
// person sees an in-app alert without opening anything. Falls back to a count refresh every minute.

import "./Notifications.css";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { useSession } from "../../store/sessionStore.js";
import { listNotifications, subscribeNotifications } from "../../lib/api/people.js";
import { markAllRead, markNotificationRead, unreadCount } from "../../lib/api/notifications.js";
import { formatDateTime } from "../../lib/format.js";

export default function NotificationBell() {
  const user = useSession((s) => s.user);
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const root = useRef(null);
  const btn = useRef(null);
  const panel = useRef(null);
  const panelId = useId();

  const refresh = useCallback(async () => {
    const [n, l] = await Promise.all([unreadCount(), listNotifications({ limit: 6 })]);
    setCount(n || 0); setItems(l.data || []);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    refresh();
    const off = subscribeNotifications(user.id, (row) => {
      toast.info(row.body || "", row.title);
      refresh();
    });
    const timer = setInterval(refresh, 60000);
    return () => { off(); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  // On phones the panel is fixed under the header; tell the CSS where the header ends (re-measured on resize / rotate).
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const edge = (btn.current?.closest("header") || btn.current)?.getBoundingClientRect();
      if (edge && panel.current) panel.current.style.setProperty("--nc-top", `${Math.round(edge.bottom + 6)}px`);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  async function openItem(n) {
    setOpen(false);
    if (!n.is_read) { await markNotificationRead(n.id); refresh(); }
    if (n.link) navigate(n.link);
  }
  async function readAll() { await markAllRead(); refresh(); }

  return (
    <div className="nc-bell" ref={root}>
      <button ref={btn} type="button" className="nc-bell__btn" aria-expanded={open} aria-controls={open ? panelId : undefined}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"} onClick={() => { setOpen((v) => !v); if (!open) refresh(); }}>
        <Icon name="bell" size={20} />
        {count > 0 && <span className="nc-bell__badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div id={panelId} ref={panel} className="nc-panel" role="region" aria-label="Latest notifications">
          <div className="nc-panel__head">
            <strong>Notifications</strong>
            {count > 0 && <button type="button" className="nc-link" onClick={readAll}>Mark all read</button>}
          </div>
          {items.length === 0 ? <p className="nc-panel__empty">You are all caught up.</p> : (
            <ul className="nc-panel__list">
              {items.map((n) => (
                <li key={n.id} className={n.is_read ? "" : "is-unread"}>
                  <button type="button" onClick={() => openItem(n)}>
                    <strong>{n.title}</strong>
                    {n.body && <span>{n.body}</span>}
                    <small>{formatDateTime(n.created_at)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="nc-panel__all" onClick={() => { setOpen(false); navigate("/notifications"); }}>See all notifications</button>
        </div>
      )}
    </div>
  );
}
