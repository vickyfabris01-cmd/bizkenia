// src/components/ui/icons/ActivityIcons.jsx — NEW FILE (Part 8)
//
// AIM
// The two icons the upload progress rows need that ui/Icon.jsx does not have: an upload arrow and a retry
// arrow. Cancel reuses Icon's "x". Same style as Icon.jsx: 24x24, strokes only, currentColor (so dark mode
// works), hidden from screen readers unless a `title` is given (the text beside the icon says it).
//
// USAGE
//   <UploadIcon size={16} />
//   <RetryIcon size={18} title="Retry" />

function Svg({ size = 20, strokeWidth = 2, title, className, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || undefined}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** Arrow pointing up out of a tray: a file on its way up. */
export function UploadIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </Svg>
  );
}

/** A circular arrow: try again. */
export function RetryIcon(props) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </Svg>
  );
}
