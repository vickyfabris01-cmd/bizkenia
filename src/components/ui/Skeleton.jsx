// src/components/ui/Skeleton.jsx — NEW FILE
//
// AIM
// Grey "wireframe" placeholders shown while data loads, until each page gets its final
// look. They keep the page layout steady so nothing jumps when the data arrives.
//
// EXPORTS
//   Skeleton       one block.  <Skeleton width="60%" height={14} />  or  shape="circle"
//   SkeletonText   several lines of text (last line shorter)
//   SkeletonCard   a card-shaped placeholder (optional image area)
//   SkeletonTable  rows and columns
//
// The old SkeletonCard / SkeletonTable (lines, hasImage, rows, cols) keep working. They are
// also re-exported from Spinner.jsx so existing imports do not break.
// Screen readers hear one "Loading" message instead of a pile of empty boxes.

import "./Skeleton.css";

function toSize(value) {
  return typeof value === "number" ? `${value}px` : value;
}

export function Skeleton({
  width,
  height,
  shape = "rect", // "rect" | "circle"
  className = "",
  style,
}) {
  const classes = `ui-skeleton ${shape === "circle" ? "ui-skeleton--circle" : ""} ${className}`.trim();
  return (
    <span
      className={classes}
      style={{ width: toSize(width), height: toSize(height), ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`ui-skeleton-text ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 && lines > 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 3, hasImage = false, className = "" }) {
  return (
    <div
      className={`ui-skeleton-card ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {hasImage && <Skeleton className="ui-skeleton-card__image" height={112} width="100%" />}
      <SkeletonText lines={lines} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, className = "" }) {
  return (
    <div
      className={`ui-skeleton-table ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {Array.from({ length: rows }, (_, r) => (
        <div className="ui-skeleton-table__row" key={r} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} height={28} className="ui-skeleton-table__cell" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;