import { create } from "zustand";
import { db, realtimeChannel } from "../config/supabase";

// =============================================================================
// notificationStore
//
// Manages in-app notifications AND the toast queue for transient messages.
//
// In-app notifications  — persisted rows in the `notifications` table.
//   These show in the topbar bell dropdown and the /notifications page.
//
// Toasts — ephemeral, client-side only.
//   Push with addToast(); they auto-dismiss after their duration expires.
//
// Realtime — call subscribeToNotifications(userId) once after sign-in.
//   New INSERT rows on `notifications` filtered by user_id arrive live and
//   are prepended to the list. Call unsubscribeFromNotifications() on sign-out.
//
// Usage:
//   const { notifications, unreadCount, markRead } = useNotificationStore();
//   const { addToast } = useNotificationStore();
//   const unreadCount  = useNotificationStore(s => s.unreadCount);
// =============================================================================

// ── Toast defaults ────────────────────────────────────────────────────────────
const TOAST_DURATION = {
  success: 4000,
  error:   0,       // 0 = persistent until manually closed
  info:    5000,
  warning: 5000,
};

const MAX_TOASTS = 3;

let _toastIdCounter = 0;
let _realtimeChannel = null;

// =============================================================================
// Store
// =============================================================================
const useNotificationStore = create((set, get) => ({
  // ── In-app notification state ─────────────────────────────────────────────

  /** Array of notification rows from the DB, newest first */
  notifications: [],

  /** Number of notifications where is_read is false */
  unreadCount: 0,

  /** True while the initial notification fetch is in flight */
  loading: false,

  /** Non-null if the last fetch failed */
  error: null,

  // ── Toast state ───────────────────────────────────────────────────────────

  /**
   * Active toasts. Each toast:
   * { id, type, title, message, duration, createdAt }
   */
  toasts: [],

  // ── In-app notification actions ───────────────────────────────────────────

  /**
   * Fetch the latest notifications for a user from the database.
   * Loads at most 50 recent rows, newest first.
   *
   * @param {string} userId  auth.users UUID
   */
  fetchNotifications: async (userId) => {
    if (!userId) return;

    set({ loading: true, error: null });

    const { data, error } = await db
      .notifications()
      .select(
        "id, tenant_id, user_id, type, title, body, data, is_read, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[notificationStore] fetchNotifications error:", error.message);
      set({ loading: false, error: error.message });
      return;
    }

    set({
      notifications: data ?? [],
      unreadCount:   _countUnread(data ?? []),
      loading: false,
      error: null,
    });
  },

  /**
   * Mark a single notification as read.
   *
   * @param {string} notificationId  UUID
   */
  markRead: async (notificationId) => {
    const { notifications } = get();

    // Optimistic update
    const updated = notifications.map(n =>
      n.id === notificationId
        ? { ...n, is_read: true }
        : n
    );
    set({ notifications: updated, unreadCount: _countUnread(updated) });

    // Persist to DB
    const { error } = await db
      .notifications()
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("is_read", false);   // Only update if not already read

    if (error) {
      console.error("[notificationStore] markRead error:", error.message);
      // Rollback optimistic update
      set({ notifications, unreadCount: _countUnread(notifications) });
    }
  },

  /**
   * Mark all notifications as read for the current user.
   *
   * @param {string} userId  auth.users UUID
   */
  markAllRead: async (userId) => {
    if (!userId) return;

    const { notifications } = get();

    // Optimistic update
    const updated = notifications.map(n => ({ ...n, is_read: true }));
    set({ notifications: updated, unreadCount: 0 });

    // Persist to DB
    const { error } = await db
      .notifications()
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      console.error("[notificationStore] markAllRead error:", error.message);
      // Rollback
      set({ notifications, unreadCount: _countUnread(notifications) });
    }
  },

  /**
   * Prepend a new notification row (called by the realtime INSERT handler).
   *
   * @param {object} notification  The new row payload from Supabase Realtime
   */
  _prependNotification: (notification) => {
    const { notifications } = get();
    const updated = [notification, ...notifications].slice(0, 50);
    set({ notifications: updated, unreadCount: _countUnread(updated) });
  },

  // ── Realtime subscription ─────────────────────────────────────────────────

  /**
   * Subscribe to new notifications for a user via Supabase Realtime.
   * Call once after a successful sign-in.
   *
   * @param {string} userId
   */
  subscribeToNotifications: (userId) => {
    if (!userId) return;

    // Prevent duplicate subscriptions
    if (_realtimeChannel) {
      get().unsubscribeFromNotifications();
    }

    _realtimeChannel = realtimeChannel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          get()._prependNotification(payload.new);

          // Also show a toast for high-priority notification types
          const { type, title, body } = payload.new;
          if (["payment_confirmed", "request_approved", "complaint_update"].includes(type)) {
            get().addToast({
              type:    "info",
              title:   title ?? "New notification",
              message: body  ?? "",
            });
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.info("[notificationStore] Realtime subscribed for", userId);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Supabase Realtime requires the table to be added to the
          // supabase_realtime publication. If not enabled, this fires.
          // Suppress repeated console spam — fetch will still work.
          if (err) console.warn("[notificationStore] Realtime unavailable — using polling fallback");
        }
        if (status === "CLOSED") {
          _realtimeChannel = null;
        }
      });
  },

  /**
   * Unsubscribe from realtime notifications.
   * Call on sign-out.
   */
  unsubscribeFromNotifications: () => {
    if (_realtimeChannel) {
      _realtimeChannel.unsubscribe();
      _realtimeChannel = null;
    }
  },

  /**
   * Clear all notification state (called on sign-out).
   */
  clearNotifications: () => {
    get().unsubscribeFromNotifications();
    set({ notifications: [], unreadCount: 0, error: null });
  },

  // ── Toast actions ─────────────────────────────────────────────────────────

  /**
   * Push a toast notification onto the queue.
   * The UI component (ToastContainer) renders and auto-dismisses these.
   *
   * @param {{ type?: "success"|"error"|"info"|"warning", title?: string, message: string, duration?: number }} toast
   * @returns {number} id  The toast id (pass to removeToast() for manual close)
   */
  addToast: ({ type = "info", title, message, duration } = {}) => {
    const id = ++_toastIdCounter;
    const ms = duration ?? TOAST_DURATION[type] ?? 4000;

    const toast = {
      id,
      type,
      title:     title   ?? _defaultTitle(type),
      message:   message ?? "",
      duration:  ms,
      createdAt: Date.now(),
    };

    set(state => {
      const current = state.toasts;
      // Keep max 3 — drop the oldest if we're at the limit
      const trimmed = current.length >= MAX_TOASTS ? current.slice(1) : current;
      return { toasts: [...trimmed, toast] };
    });

    // Auto-dismiss after duration (skip if duration === 0 → persistent)
    if (ms > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, ms);
    }

    return id;
  },

  /**
   * Remove a toast by id (used for manual close button and auto-dismiss).
   *
   * @param {number} id
   */
  removeToast: (id) => {
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id),
    }));
  },

  /**
   * Convenience wrappers so call sites don't have to pass `type` every time.
   */
  toast: {
    success: (message, title) =>
      useNotificationStore.getState().addToast({ type: "success", title, message }),
    error:   (message, title) =>
      useNotificationStore.getState().addToast({ type: "error",   title, message }),
    info:    (message, title) =>
      useNotificationStore.getState().addToast({ type: "info",    title, message }),
    warning: (message, title) =>
      useNotificationStore.getState().addToast({ type: "warning", title, message }),
  },

  /** Clear error flag */
  clearError: () => set({ error: null }),
}));

// =============================================================================
// Private helpers
// =============================================================================

function _countUnread(notifications) {
  return notifications.filter(n => !n.is_read).length;
}

function _defaultTitle(type) {
  return { success: "Success", error: "Error", info: "Info", warning: "Warning" }[type] ?? "Notice";
}

// =============================================================================
// Convenience selectors
//
// Usage:
//   const unreadCount = useUnreadCount();
//   const toasts = useToasts();
// =============================================================================
export const useUnreadCount = () => useNotificationStore(s => s.unreadCount);
export const useToasts      = () => useNotificationStore(s => s.toasts);

/**
 * Standalone toast helper — import this anywhere you need to fire a toast
 * without subscribing to the full store.
 *
 * Usage:
 *   import toast from "../store/notificationStore";
 *   toast.success("Payment confirmed!");
 *   toast.error("Something went wrong.");
 */
export const toast = {
  success: (message, title) =>
    useNotificationStore.getState().addToast({ type: "success", title, message }),
  error: (message, title) =>
    useNotificationStore.getState().addToast({ type: "error", title, message }),
  info: (message, title) =>
    useNotificationStore.getState().addToast({ type: "info", title, message }),
  warning: (message, title) =>
    useNotificationStore.getState().addToast({ type: "warning", title, message }),
};

export default useNotificationStore;
