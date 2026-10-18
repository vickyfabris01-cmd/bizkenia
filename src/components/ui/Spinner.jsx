// src/components/ui/Spinner.jsx — MODIFIED FILE (rebuilt on design tokens; old imports still work)
//
// AIM
// A loading spinner. Use it for short waits (saving, a button, a small panel). For a whole
// page or list that is loading, prefer the Skeleton blocks so the layout does not jump.
//
// PROPS
//   size    "sm" | "md" (default) | "lg"
//   inline  true = just the ring (for inside text or a row); default centres it in a padded block
//   label   text read out to screen readers (default "Loading")
//
// Old pages import { Spinner, SkeletonCard, SkeletonTable, EmptyState, Divider } from this
// file, so the last four are re-exported here. New code should import them from
// "components/ui" (the barrel) or from their own files.

import "./Spinner.css";

const SIZES = ["sm", "md", "lg"];

export function Spinner({ size = "md", inline = false, label = "Loading", className = "" }) {
  const s = SIZES.includes(size) ? size : "md";
  const ring = <span className={`ui-spinner ui-spinner--${s}`} aria-hidden="true" />;

  if (inline) {
    return (
      <span className={`ui-spinner-wrap ${className}`.trim()} role="status">
        {ring}
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <div className={`ui-spinner-block ${className}`.trim()} role="status">
      {ring}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export { SkeletonCard, SkeletonTable } from "./Skeleton.jsx";
export { default as EmptyState } from "./EmptyState.jsx";
export { default as Divider } from "./Divider.jsx";

export default Spinner;