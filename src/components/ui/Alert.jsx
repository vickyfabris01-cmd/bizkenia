// src/components/ui/Alert.jsx — MODIFIED FILE (rebuilt on design tokens; old props still work)
//
// AIM
// An inline message box inside a page or form: errors, warnings, tips, success notes.
// (Short, temporary messages that pop up and vanish are toasts, built in a later step.)
//
// PROPS
//   type      "info" (default) | "success" | "warning" | "error"
//   title     bold first line
//   message   text under the title (children work too)
//   onClose   when given, a dismiss (X) button appears. (The old text "Close" link is replaced.)
//   className
//
// Errors and warnings are announced to screen readers straight away (role="alert");
// info and success are announced politely (role="status").

import "./Alert.css";

const TYPES = ["info", "success", "warning", "error"];

const ICON = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

function TypeIcon({ type }) {
  switch (type) {
    case "success":
      return (
        <svg {...ICON}>
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12.5l2.5 2.5L16 9.500" />
        </svg>
      );
    case "warning":
      return (
        <svg {...ICON}>
          <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.700 3.900a2 2 0 00-3.400 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      );
    case "error":
      return (
        <svg {...ICON}>
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
      );
    default:
      return (
        <svg {...ICON}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      );
  }
}

function Alert({ type = "info", title, message, children, className = "", onClose }) {
  const t = TYPES.includes(type) ? type : "info";
  const urgent = t === "error" || t === "warning";

  return (
    <div
      className={`ui-alert ui-alert--${t} ${className}`.trim()}
      role={urgent ? "alert" : "status"}
    >
      <span className="ui-alert__icon">
        <TypeIcon type={t} />
      </span>

      <div className="ui-alert__body">
        {title && <p className="ui-alert__title">{title}</p>}
        {message && <p className="ui-alert__message">{message}</p>}
        {children}
      </div>

      {onClose && (
        <button
          type="button"
          className="ui-alert__close"
          onClick={onClose}
          aria-label="Dismiss message"
        >
          <svg {...ICON} width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export { Alert };
export default Alert;