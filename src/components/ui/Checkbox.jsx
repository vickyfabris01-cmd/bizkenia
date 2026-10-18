// src/components/ui/Checkbox.jsx — MODIFIED FILE (rebuilt on design tokens; old props still work)
//
// AIM
// A tick box with a clickable label. It is a real <input type="checkbox">, so keyboards and
// screen readers work with no extra effort. The whole row is at least 44px tall to tap.
//
// PROPS
//   label      text beside the box (clicking it toggles the box)
//   checked, onChange   as for a native checkbox (onChange receives the DOM event)
//   disabled, className, ...rest   passed on

import "./Checkbox.css";

export default function Checkbox({ label, className = "", disabled = false, ...props }) {
  return (
    <label
      className={`ui-check${disabled ? " is-disabled" : ""} ${className}`.trim()}
    >
      <input type="checkbox" className="ui-check__input" disabled={disabled} {...props} />
      {label && <span className="ui-check__label">{label}</span>}
    </label>
  );
}

export { Checkbox };