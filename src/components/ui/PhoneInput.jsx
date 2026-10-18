// src/components/ui/PhoneInput.jsx — MODIFIED FILE (rebuilt on design tokens)
//
// AIM
// A Kenyan phone number field with a fixed "+254" prefix. The person types the rest.
//
// BEHAVIOUR CHANGE (fixes a bug)
// onChange now receives the cleaned NUMBER (a string of up to 9 digits, e.g. "712345678"),
// not the DOM event. Every existing page already used it as a setter
// (onChange={setPhone} or onChange={(v) => set("phone", v)}), so they now receive a real value
// instead of an event object.
// Typing "0712 345 678" or "+254712345678" or pasting either form is cleaned to "712345678".
//
// PROPS
//   label, error, helper, required, disabled, id, value, onChange, className, style, ...rest

import { forwardRef } from "react";
import Field, { describedBy, useFieldId } from "./Field.jsx";
import "./PhoneInput.css";

/** Keep digits only, drop a leading 254 or 0, cap at 9 digits. */
export function cleanKenyanPhone(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("254")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 9);
}

const PhoneInput = forwardRef(function PhoneInput(
  {
    label,
    error,
    helper,
    required = false,
    disabled = false,
    id,
    value = "",
    onChange,
    className = "",
    style,
    placeholder = "712345678",
    ...rest
  },
  ref,
) {
  const inputId = useFieldId(id);

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
      <div
        className={`ui-phone${error ? " is-invalid" : ""}${disabled ? " is-disabled" : ""}`}
      >
        <span className="ui-phone__prefix" aria-hidden="true">
          +254
        </span>
        <input
          {...rest}
          ref={ref}
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={cleanKenyanPhone(value)}
          onChange={(event) => onChange?.(cleanKenyanPhone(event.target.value))}
          disabled={disabled}
          placeholder={placeholder}
          className="ui-phone__input"
          aria-label={label ? undefined : "Phone number"}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy(inputId, { error, helper })}
        />
      </div>
    </Field>
  );
});

export default PhoneInput;