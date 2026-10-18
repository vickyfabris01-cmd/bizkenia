// src/components/ui/EmptyState.jsx — NEW FILE (the old one lived inside Spinner.jsx)
//
// AIM
// The friendly "nothing here yet" block shown when a list or search has no results, with an
// optional button telling the person what to do next.
//
// PROPS
//   icon         an icon name ("search", "payments", "workers", "billing" ...) OR any React node.
//                Unknown names show a neutral box icon. (The old version printed the raw name
//                as text; that is fixed.)
//   title        short heading
//   description  one or two helpful sentences
//   action       a node, usually a <Button>
//   compact      less padding, for use inside cards and modals

import "./EmptyState.css";

const SVG_PROPS = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

const ICON_PATHS = {
  box: (
    <>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3.3 7.5L12 12.5l8.7-5M12 22V12.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  payments: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  billing: (
    <>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" />
      <path d="M9 7h6M9 11h6" />
    </>
  ),
  workers: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.5 3.200-5.500 6.500-5.500s5.900 2 6.500 5.500" />
      <path d="M16 4.500a3.500 3.500 0 010 7M18 14.800c1.800.8 3 2.600 3.500 5.200" />
    </>
  ),
  residents: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.5 3.200-5.500 6.500-5.500s5.900 2 6.500 5.500" />
    </>
  ),
  home: (
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10M10 20v-6h4v6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.700 21a2 2 0 01-3.400 0" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
      <path d="M14 2v6h6" />
    </>
  ),
};

function resolveIcon(icon) {
  if (typeof icon === "string") {
    const paths = ICON_PATHS[icon] || ICON_PATHS.box;
    return <svg {...SVG_PROPS}>{paths}</svg>;
  }
  return icon || null;
}

export default function EmptyState({
  icon = "box",
  title = "No items found",
  description = "There is nothing to show right now.",
  action = null,
  compact = false,
  className = "",
}) {
  const iconNode = resolveIcon(icon);
  return (
    <div className={`ui-empty${compact ? " ui-empty--compact" : ""} ${className}`.trim()}>
      {iconNode && <div className="ui-empty__icon">{iconNode}</div>}
      <h3 className="ui-empty__title">{title}</h3>
      {description && <p className="ui-empty__desc">{description}</p>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}

export { EmptyState };