// src/components/ui/Field.jsx — NEW FILE
//
// AIM
// The shared frame around every form control: label on top, the control, then either an
// error message or a helper line. Input, PasswordInput, PhoneInput, SelectInput and
// TextArea all use it, so labels, spacing and error text look and behave the same everywhere.
//
// PROPS
//   id        the control's id (the label points at it). Use useFieldId(id) to get one.
//   label     text above the control
//   required  shows a * after the label (it does not add browser validation by itself)
//   error     red message; replaces the helper while present
//   helper    grey hint under the control
//
// HELPERS
//   useFieldId(id)             the given id, or a unique generated one
//   describedBy(id, {error, helper})   the aria-describedby value for the control

import { useId } from "react";
import "./Field.css";

export function useFieldId(id) {
  const generated = useId();
  return id ?? generated;
}

export function describedBy(id, { error, helper }) {
  if (error) return `${id}-error`;
  if (helper) return `${id}-helper`;
  return undefined;
}

export default function Field({
  id,
  label,
  required = false,
  error,
  helper,
  className = "",
  style,
  children,
}) {
  return (
    <div className={`ui-field ${className}`.trim()} style={style}>
      {label && (
        <label className="ui-field__label" htmlFor={id}>
          {label}
          {required && (
            <span className="ui-field__req" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
      )}

      {children}

      {error ? (
        <p id={`${id}-error`} className="ui-field__error" role="alert">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{error}</span>
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="ui-field__helper">
          {helper}
        </p>
      ) : null}
    </div>
  );
}