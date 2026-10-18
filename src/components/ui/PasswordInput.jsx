// src/components/ui/PasswordInput.jsx — MODIFIED FILE (rebuilt on design tokens; old props still work)
//
// AIM
// A password field with a show/hide button and an optional strength meter.
//
// PROPS
//   label         default "Password"
//   showStrength  show the 4-segment meter and the requirement ticks under the field
//   error, helper, required, disabled, id, value, onChange, ...rest   as in Input
//
// USAGE
//   <PasswordInput label="New password" showStrength value={pw} onChange={(e) => setPw(e.target.value)} />

import { forwardRef, useState } from "react";
import { validatePassword } from "../../lib/validators";
import Field, { describedBy, useFieldId } from "./Field.jsx";
import "./PasswordInput.css";

const STRENGTH_LEVELS = [
  { label: "Weak", tone: "weak" },
  { label: "Fair", tone: "fair" },
  { label: "Good", tone: "good" },
  { label: "Strong", tone: "strong" },
];

const REQUIREMENTS = [
  { key: "length", label: "8+ characters" },
  { key: "uppercase", label: "Uppercase" },
  { key: "number", label: "Number" },
  { key: "special", label: "Symbol" },
];

const ICON = {
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

function EyeOpen() {
  return (
    <svg {...ICON}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg {...ICON}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

const PasswordInput = forwardRef(function PasswordInput(
  {
    label = "Password",
    showStrength = false,
    error,
    helper,
    required = false,
    disabled = false,
    value = "",
    onChange,
    id,
    style,
    className = "",
    ...rest
  },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const inputId = useFieldId(id);

  // Drop props that are not real <input> attributes if a parent passed them by mistake
  // eslint-disable-next-line no-unused-vars
  const { leftAdornment, rightAdornment, ...domProps } = rest;

  const result = showStrength && value ? validatePassword(value) : null;
  const level = result && result.strength > 0 ? STRENGTH_LEVELS[result.strength - 1] : null;

  return (
    <Field
      id={inputId}
      label={label}
      required={required}
      error={error}
      helper={helper}
      className={className}
      style={style}
    >
      <div className="ui-control-wrap">
        <input
          {...domProps}
          ref={ref}
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="ui-control ui-control--pad-right"
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy(inputId, { error, helper })}
        />
        <button
          type="button"
          className="ui-password__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? <EyeOff /> : <EyeOpen />}
        </button>
      </div>

      {result && (
        <div className="ui-password__meter">
          <div
            className={`ui-password__bars${level ? ` ui-password__bars--${level.tone}` : ""}`}
            aria-hidden="true"
          >
            {[1, 2, 3, 4].map((segment) => (
              <span
                key={segment}
                className={`ui-password__bar${result.strength >= segment ? " is-on" : ""}`}
              />
            ))}
          </div>

          <div className="ui-password__summary">
            <span className="ui-password__caption">Password strength</span>
            {level && (
              <span className={`ui-password__level ui-password__level--${level.tone}`}>
                {level.label}
              </span>
            )}
          </div>

          <ul className="ui-password__reqs">
            {REQUIREMENTS.map((req) => {
              const ok = result.checks[req.key];
              return (
                <li key={req.key} className={`ui-password__req${ok ? " is-met" : ""}`}>
                  <span className="ui-password__dot" aria-hidden="true" />
                  <span>{req.label}</span>
                  <span className="sr-only">{ok ? " (met)" : " (not met)"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Field>
  );
});

export default PasswordInput;