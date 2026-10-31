// src/components/ui/icons/PlatformIcons.jsx — NEW FILE (Part 9)
//
// AIM
// Icons that Icon.jsx does not have yet: phone, clock, refresh and flag. Same style as Icon.jsx
// (24x24, strokes only, currentColor, hidden from screen readers unless it has a title).
// Icon.jsx is not edited here because other parts add icons to it at the same time.
//
// USAGE
//   <PlatformIcon name="phone" size={32} />
//   <PlatformIcon name="flag" size={16} title="Uses more than 3 times the average" />

const ICONS = {
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4" />
      <path d="M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </>
  ),
};

export default function PlatformIcon({ name, size = 20, strokeWidth = 2, title, className = "", style }) {
  const paths = ICONS[name];
  if (!paths) return null;
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
      style={style}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {paths}
    </svg>
  );
}

export { PlatformIcon };
