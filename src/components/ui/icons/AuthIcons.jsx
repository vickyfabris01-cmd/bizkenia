// src/components/ui/icons/AuthIcons.jsx — NEW FILE (Part 7)
//
// AIM
// Icons the sign-in screens need that Icon.jsx does not have. Same rules as Icon.jsx: a 24x24 drawing made of strokes only,
// coloured by the text around it (currentColor), hidden from screen readers unless it has a title.
// Icon.jsx itself is not edited here because other parts add icons to it at the same time.
//
// USAGE
//   <FingerprintIcon />
//   <FingerprintIcon size={18} title="Fingerprint" />

function Svg({ size, strokeWidth, title, className, style, children }) {
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
      {children}
    </svg>
  );
}

export function FingerprintIcon({ size = 20, strokeWidth = 2, title, className = "", style }) {
  return (
    <Svg size={size} strokeWidth={strokeWidth} title={title} className={className} style={style}>
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M2 12a10 10 0 0 1 18-6" />
      <path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
      <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
    </Svg>
  );
}

export default FingerprintIcon;
