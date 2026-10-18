// src/components/ui/Toggle.jsx — MODIFIED FILE (rebuilt on design tokens)
//
// AIM
// An on/off switch with an optional label ("Send SMS to each recipient").
//
// BEHAVIOUR CHANGE (fixes a bug)
// onChange now receives the NEW VALUE as a plain boolean (true or false).
// The old switch sent a fake event object ({ target: { checked } }). Every existing page
// passes a state setter straight in (onChange={setSendSMS}), so the state used to become an
// object, which is always "on", and the switch could never turn off. With a boolean those
// setters now work as intended.
//
// PROPS
//   label      text beside the switch
//   checked    current value (true / false)
//   onChange   (nextValue: boolean) => void
//   disabled, className, ...rest   (rest goes on the switch button, e.g. aria-label, id)

import "./Toggle.css";

export default function Toggle({
  label,
  checked = false,
  onChange,
  disabled = false,
  className = "",
  ...props
}) {
  return (
    <label className={`ui-toggle${disabled ? " is-disabled" : ""} ${className}`.trim()}>
      {label && <span className="ui-toggle__label">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        disabled={disabled}
        className="ui-toggle__track"
        onClick={() => onChange?.(!checked)}
        {...props}
      >
        <span className="ui-toggle__thumb" aria-hidden="true" />
      </button>
    </label>
  );
}

export { Toggle };