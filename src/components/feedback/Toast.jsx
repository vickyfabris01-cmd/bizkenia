// src/components/feedback/Toast.jsx — MODIFIED FILE (rebuilt on design tokens; same API as before)
//
// AIM
// The small pop-up messages ("Payment recorded", "Something went wrong"). Looks come from
// the status tokens, so toasts match the design sheets and work in light and dark mode.
//
// HOW IT WORKS (unchanged)
// Toasts live in notificationStore. Anywhere in the app:
//   import { useToast } from "../../hooks/useNotifications";
//   const toast = useToast();
//   toast.success("Payment recorded!");
//   toast.error("Something went wrong.", "Payment failed");
//   toast.info("Sync in progress…");  toast.warning("Check the amount.");
// <ToastContainer /> is mounted once in main.jsx and shows them.
//
// BEHAVIOUR
//   success / info / warning disappear by themselves (the store sets the time) and show a thin
//   countdown line. error toasts stay until closed.
//   Screen readers: errors are announced at once (role="alert"), the rest politely.
//   Position: top right on larger screens, across the top on phones.

import { createPortal } from "react-dom";
import { useToasts } from "../../hooks/useNotifications.js";
import Icon from "../ui/Icon.jsx";
import "./Toast.css";

const TYPES = ["success", "error", "warning", "info"];

function Toast({ toast, onRemove }) {
  const type = TYPES.includes(toast.type) ? toast.type : "info";
  const timed = toast.duration > 0;

  return (
    <div
      className={`ui-toast ui-toast--${type}`}
      role={type === "error" ? "alert" : "status"}
    >
      <span className="ui-toast__icon">
        <Icon name={type} size={18} />
      </span>

      <div className="ui-toast__body">
        {toast.title && <p className="ui-toast__title">{toast.title}</p>}
        {toast.message && <p className="ui-toast__message">{toast.message}</p>}
      </div>

      <button
        type="button"
        className="ui-toast__close"
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss notification"
      >
        <Icon name="x" size={16} />
      </button>

      {timed && (
        <span
          className="ui-toast__timer"
          style={{ animationDuration: `${toast.duration}ms` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToasts();

  if (typeof document === "undefined") return null;

  // The container is always present so screen readers register the live region
  // before the first message arrives.
  return createPortal(
    <div className="ui-toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onRemove={removeToast} />
      ))}
    </div>,
    document.body,
  );
}

export default Toast;