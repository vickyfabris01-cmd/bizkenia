import { useEffect, useCallback, useMemo } from "react";
import useNotificationStore from "../store/notificationStore";
import { useSession } from "../store/sessionStore.js";

// =============================================================================
// useNotifications
//
// Fetches notifications on mount (when a userId is known), starts the
// realtime subscription, and exposes actions + derived state.
//
// Mount this once — in the topbar or in DashboardLayout — so the realtime
// channel is opened exactly once per session. Individual pages and
// components can then call useMiniNotifications() for a lighter subscription.
//
// Usage (in Topbar):
//   const {
//     notifications, unreadCount, loading,
//     markRead, markAllRead,
//   } = useNotifications();
// =============================================================================
export function useNotifications() {
  const userId = useSession((s) => s.user?.id ?? null);

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const loading = useNotificationStore((s) => s.loading);
  const error = useNotificationStore((s) => s.error);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const subscribeToNotifications = useNotificationStore(
    (s) => s.subscribeToNotifications,
  );
  const unsubscribeFromNotifications = useNotificationStore(
    (s) => s.unsubscribeFromNotifications,
  );
  const clearError = useNotificationStore((s) => s.clearError);

  // Fetch + subscribe when userId becomes available
  useEffect(() => {
    if (!userId) return;

    fetchNotifications(userId);
    subscribeToNotifications(userId);

    return () => {
      unsubscribeFromNotifications();
    };
  }, [
    userId,
    fetchNotifications,
    subscribeToNotifications,
    unsubscribeFromNotifications,
  ]);

  // Stable markAllRead bound to userId
  const markAllReadForUser = useCallback(() => {
    if (userId) markAllRead(userId);
  }, [userId, markAllRead]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const unread = notifications.filter((n) => !n.is_read);
  const recent = notifications.slice(0, 8); // latest 8 for the bell dropdown
  const hasUnread = unreadCount > 0;
  const badgeCount = unreadCount > 99 ? "99+" : String(unreadCount);

  return {
    // Data
    notifications,
    unread,
    recent,
    unreadCount,
    badgeCount,
    // State
    loading,
    error,
    hasUnread,
    // Actions
    markRead,
    markAllRead: markAllReadForUser,
    refetch: () => fetchNotifications(userId),
    clearError,
  };
}

// =============================================================================
// useMiniNotifications
//
// Read-only, zero-side-effects hook for components that just need the
// unread count badge or the latest notifications already in the store.
// Does NOT start a fetch or realtime subscription — that is handled by
// the parent useNotifications() call in Topbar / DashboardLayout.
//
// Usage (in Topbar icon badge):
//   const { unreadCount, hasUnread } = useMiniNotifications();
// =============================================================================
export function useMiniNotifications() {
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const notifications = useNotificationStore((s) => s.notifications);
  const recent = useMemo(() => notifications.slice(0, 8), [notifications]);

  return {
    unreadCount,
    hasUnread: unreadCount > 0,
    badgeCount: unreadCount > 99 ? "99+" : String(unreadCount),
    recent,
  };
}

// =============================================================================
// useToasts
//
// Read-only hook for the ToastContainer component.
// Subscribes only to the toasts slice — won't re-render when notifications
// or unreadCount change.
//
// Usage (in ToastContainer):
//   const { toasts, removeToast } = useToasts();
// =============================================================================
export function useToasts() {
  const toasts = useNotificationStore((s) => s.toasts);
  const removeToast = useNotificationStore((s) => s.removeToast);
  const addToast = useNotificationStore((s) => s.addToast);

  return { toasts, removeToast, addToast };
}

// =============================================================================
// useToast
//
// Imperative toast helper for components / handlers. Returns the four
// shorthand methods so you don't need to pull in the whole store.
//
// Usage:
//   const toast = useToast();
//   toast.success("Payment confirmed!");
//   toast.error("Something went wrong.", "Payment Failed");
// =============================================================================
export function useToast() {
  const addToast = useNotificationStore((s) => s.addToast);

  return {
    success: (message, title) => addToast({ type: "success", title, message }),
    error: (message, title) => addToast({ type: "error", title, message }),
    info: (message, title) => addToast({ type: "info", title, message }),
    warning: (message, title) => addToast({ type: "warning", title, message }),
    custom: (opts) => addToast(opts),
  };
}

export default useNotifications;
