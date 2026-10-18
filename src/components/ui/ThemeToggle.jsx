// src/components/ui/ThemeToggle.jsx — NEW FILE
//
// AIM
// The light / dark switch shown in the top bar and the avatar menu.
//   variant="icon"      one round button: shows the current theme, tap to switch light/dark
//   variant="segmented" three choices: Light, Dark, System (use on the account page)
// All state lives in the useTheme hook, so every toggle on screen stays in sync.

import "./ThemeToggle.css";
import { useTheme } from "../../hooks/useTheme.js";

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

function SunIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

const OPTIONS = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

export default function ThemeToggle({ variant = "icon", className = "" }) {
  const { theme, resolvedTheme, setTheme, toggle } = useTheme();

  if (variant === "segmented") {
    return (
      <div
        className={`ui-theme-seg ${className}`.trim()}
        role="radiogroup"
        aria-label="Theme"
      >
        {OPTIONS.map(({ value, label, Icon }) => {
          const selected = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`ui-theme-seg__option${selected ? " is-selected" : ""}`}
              onClick={() => setTheme(value)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const goingTo = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={`ui-theme-btn ${className}`.trim()}
      onClick={toggle}
      aria-label={`Switch to ${goingTo} theme`}
      title={`Switch to ${goingTo} theme`}
    >
      {resolvedTheme === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}