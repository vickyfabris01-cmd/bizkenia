import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { create } from "zustand";
import { supabase } from "../config/supabase.js";
import { ADMIN_NAV } from "../modules/adminNav.js";
import { navFor } from "../modules/index.js";
import { useBusinessStore } from "./businessStore.js";

// =============================================================================
// actionCountsStore — NEW FILE (Part 8)
//
// The small floating numbers on the menu ("3 pending"). One store feeds both the Sidebar and the
// BottomTabBar, so the frames (AdminFrame, BusinessAppFrame) need no change.
//
// Where the numbers come from (migration 20261028100003_action_counts.sql):
//   admin pages      rpc admin_action_counts()                  (super admin only)
//   business pages   rpc business_action_counts(business_id)    (staff get numbers, others get none)
// Each answer is a list of { nav_key, n }. A menu item shows the number whose nav_key equals its
// `badgeKey` (set on the item in src/modules/adminNav.js and src/modules/<type>/index.js).
//
// Refresh pattern (copied from notificationStore): fetch once when a menu appears, again every
// 60 seconds while the tab is visible, and again when the tab comes back into focus. Several
// components may ask for the numbers at once; they share ONE timer and ONE request.
//
// Usage:
//   const badgeFor = useNavBadges();          // inside Sidebar / BottomTabBar
//   const b = badgeFor(item);                 // null, or { count, shown, label, to }
//   useActionCountsStore.getState().markSeen("errors");   // a page the admin has just opened
//   refreshActionCounts();                    // after something changes the numbers (e.g. a decision)
// =============================================================================

export const REFRESH_MS = 60_000;
const MIN_GAP_MS = 5_000;           // focus events never refresh more often than this
const ADMIN_SCOPE = "admin";

// What the number means, for the screen reader ("3 pending approval"). Keyed by badgeKey.
const BADGE_TEXT = {
  businesses: "pending approval",
  errors: "new errors",
  files: "unused files",
  support: "open tickets",
  "rental-requests": "pending",
  invoices: "overdue",
  complaints: "need action",
  transfers: "pending",
  orders: "new",
  tasks: "due",
};

// Where a click on the badge lands. Only pages that read the filter from the address are listed.
const BADGE_QUERY = {
  businesses: "status=pending",
  errors: "status=new",
};

let _timer = null;
let _listening = false;
let _subscribers = 0;
let _inFlight = null;
let _lastAt = 0;

const useActionCountsStore = create((set, get) => ({
  /** { [badgeKey]: number } for the current menu */
  counts: {},
  /** "admin", a business id, or null when no menu is open */
  scope: null,
  error: null,

  /** Point the store at another menu (admin or one business). Clears the old numbers. */
  setScope: (scope) => {
    if (get().scope === scope) return;
    set({ scope, counts: {}, error: null });
    _lastAt = 0;
    if (scope && _subscribers > 0) get().refresh(true);
  },

  /** Fetch the numbers now. `force` skips the "not twice within 5 seconds" guard. */
  refresh: async (force = false) => {
    const { scope } = get();
    if (!supabase || !scope) return;
    if (!force && Date.now() - _lastAt < MIN_GAP_MS) return;
    if (_inFlight && _inFlight.scope === scope) return _inFlight.promise;

    _lastAt = Date.now();
    const promise = (async () => {
      const { data, error } = scope === ADMIN_SCOPE
        ? await supabase.rpc("admin_action_counts")
        : await supabase.rpc("business_action_counts", { p_business: scope });
      if (get().scope !== scope) return;             // the person moved to another menu meanwhile
      if (error) {
        console.warn("[actionCountsStore] refresh error:", error.message);
        set({ error: error.message });              // keep the old numbers; the menu must not flicker
        return;
      }
      const next = {};
      for (const row of data || []) next[row.nav_key] = Number(row.n) || 0;
      set({ counts: next, error: null });
    })().finally(() => { if (_inFlight?.promise === promise) _inFlight = null; });
    _inFlight = { scope, promise };
    return promise;
  },

  /**
   * The admin has just opened a page whose badge clears when seen ("errors", "files").
   * The badge goes to 0 at once; the database is told, then the numbers are fetched again.
   */
  markSeen: async (key) => {
    if (!supabase) return;                       // the database refuses anyone who is not a super admin
    set((s) => ({ counts: { ...s.counts, [key]: 0 } }));
    const { error } = await supabase.rpc("mark_nav_seen", { p_key: key });
    if (error) console.warn("[actionCountsStore] markSeen error:", error.message);
    get().refresh(true);
  },

  /** Forget everything (sign-out). */
  clear: () => {
    stopPolling();
    set({ counts: {}, scope: null, error: null });
  },
}));

// ── Polling: one timer for however many components are listening ───────────────
function onVisible() {
  if (document.visibilityState === "visible") useActionCountsStore.getState().refresh();
}
function onFocus() {
  useActionCountsStore.getState().refresh();
}
function startPolling() {
  if (typeof window === "undefined") return;
  if (!_listening) {
    _listening = true;
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
  }
  if (!_timer) {
    _timer = window.setInterval(() => {
      if (document.visibilityState === "visible") useActionCountsStore.getState().refresh(true);
    }, REFRESH_MS);
  }
}
function stopPolling() {
  if (_timer) { window.clearInterval(_timer); _timer = null; }
  if (_listening) {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    _listening = false;
  }
}

/** Ask for fresh numbers after something changed them (for example, a business was approved). */
export function refreshActionCounts() {
  return useActionCountsStore.getState().refresh(true);
}

/**
 * The date and time (ISO) the signed-in admin last opened a page, or null if never.
 * AdminErrors uses it to show "new since you last looked". Read BEFORE calling markSeen.
 */
export async function getSeenAt(key) {
  if (!supabase) return null;
  const { data, error } = await supabase.from("nav_seen").select("seen_at").eq("key", key).maybeSingle();
  if (error) { console.warn("[actionCountsStore] getSeenAt error:", error.message); return null; }
  return data?.seen_at || null;
}

/** The Unused files scan saves what it found, so the menu can show it without scanning storage itself. */
export async function saveScanState(key, value) {
  if (!supabase) return;
  const { error } = await supabase.rpc("save_scan_state", { p_key: key, p_value: value });
  if (error) console.warn("[actionCountsStore] saveScanState error:", error.message);
}

/** The text shown in the badge: nothing at 0, the number up to 99, then "99+". */
export function badgeShown(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  return n > 99 ? "99+" : String(n);
}

/** The words a screen reader says: "3 pending approval", "more than 99 new errors". */
export function badgeLabel(key, count) {
  const n = Number(count) || 0;
  return `${n > 99 ? "more than 99" : n} ${BADGE_TEXT[key] || "need action"}`;
}

/** The badgeKey of a menu item, looked up from the address when the item does not carry one. */
function keyFor(item, pathname, memberships) {
  if (item.badgeKey) return item.badgeKey;
  const admin = pathname.startsWith("/admin");
  if (admin) {
    const seg = item.to.replace(/^\/admin\/?/, "").split("/")[0];
    return ADMIN_NAV.find((i) => i.path === seg)?.badgeKey || null;
  }
  const m = item.to.match(/^\/app\/([^/]+)\/?(.*)$/);
  if (!m) return null;
  const membership = memberships.find((x) => x.business.slug === m[1]);
  if (!membership) return null;
  const seg = m[2].split("/")[0];
  const found = navFor(membership.business.business_type, membership.role).find((i) => i.path === seg);
  return found?.badgeKey || null;
}

/**
 * For Sidebar and BottomTabBar. Starts the numbers for the menu that is open (admin, or the business
 * in the address) and returns a function that says what to draw on a menu item:
 *   badgeFor(item) -> null | { key, count, shown, label, to }
 * `to` is the item's path, plus the filter query when the page reads one (e.g. ?status=pending).
 */
export function useNavBadges() {
  const { pathname } = useLocation();
  const memberships = useBusinessStore((s) => s.memberships);
  const counts = useActionCountsStore((s) => s.counts);
  const setScope = useActionCountsStore((s) => s.setScope);

  const slug = pathname.match(/^\/app\/([^/]+)/)?.[1] || null;
  const businessId = slug ? memberships.find((m) => m.business.slug === slug)?.business.id || null : null;
  const scope = pathname.startsWith("/admin") ? ADMIN_SCOPE : businessId;

  useEffect(() => {
    if (!scope) { setScope(null); return undefined; }
    _subscribers += 1;
    setScope(scope);
    startPolling();
    useActionCountsStore.getState().refresh();
    return () => {
      _subscribers -= 1;
      if (_subscribers <= 0) {
        _subscribers = 0;
        useActionCountsStore.getState().clear(); // the menu is gone: no stale numbers for the next person or business
      }
    };
  }, [scope, setScope]);

  return (item) => {
    if (!scope) return null;
    const key = keyFor(item, pathname, memberships);
    if (!key) return null;
    const count = counts[key] || 0;
    const shown = badgeShown(count);
    if (!shown) return null;
    const query = BADGE_QUERY[key];
    return { key, count, shown, label: badgeLabel(key, count), to: query ? `${item.to}?${query}` : item.to };
  };
}

export { useActionCountsStore };
export default useActionCountsStore;
