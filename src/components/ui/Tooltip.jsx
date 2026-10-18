// src/components/ui/Tooltip.jsx — MODIFIED FILE (rebuilt; the old one never appeared)
//
// AIM
// A small hint bubble that appears when a person hovers or keyboard-focuses an element.
// The old version relied on a "group-hover" class that did not exist, so it never showed.
//
// Use it for short extra labels (for example on icon-only buttons). On touch screens there
// is no hover, so never put information in a tooltip that people need to complete a task.
//
// PROPS
//   content    text (or node) in the bubble. Nothing is shown when empty.
//   placement  "top" (default) | "bottom"
//   children   the element to describe
//   className
//
// It can be dismissed with the Escape key, and it stays open while the pointer is over it.

import { useId, useState } from "react";
import "./Tooltip.css";

export default function Tooltip({ content, children, placement = "top", className = "" }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();

  if (!content) return <>{children}</>;

  return (
    <span
      className={`ui-tooltip ${className}`.trim()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
      aria-describedby={open ? tipId : undefined}
    >
      {children}
      <span
        id={tipId}
        role="tooltip"
        className={`ui-tooltip__bubble ui-tooltip__bubble--${placement === "bottom" ? "bottom" : "top"}${open ? " is-open" : ""}`}
      >
        {content}
      </span>
    </span>
  );
}