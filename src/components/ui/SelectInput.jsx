// src/components/ui/SelectInput.jsx — MODIFIED FILE (rebuilt on design tokens; old props still work)
//
// AIM
// A dropdown. It uses the browser's native <select>, so it works well with touch screens,
// keyboards and screen readers, and styled to match the other fields.
//
// onChange is called with the chosen VALUE (a string), not the DOM event. This is how every
// existing page already uses it (onChange={setMethod}, onChange={(v) => set("role", v)}).
//
// PROPS
//   label, error, helper, required, disabled, id, className, style
//   options      array of strings, or of { value, label }
//   placeholder  optional first, unselectable option shown while value is ""
//   value, onChange, ...rest   as for a native select

import { forwardRef } from "react";
import Field, { describedBy, useFieldId } from "./Field.jsx";
import "./SelectInput.css";

const SelectInput = forwardRef(function SelectInput(
  {
    label,
    options = [],
    error,
    helper,
    required = false,
    disabled = false,
    placeholder,
    id,
    className = "",
    style,
    onChange,
    ...rest
  },
  ref,
) {
  const selectId = useFieldId(id);

  return (
    <Field
      id={selectId}
      label={label}
      required={required}
      error={error}
      helper={helper}
      className={className}
      style={style}
    >
      <div className="ui-control-wrap">
        <select
          {...rest}
          ref={ref}
          id={selectId}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.value)}
          className="ui-control ui-select ui-control--pad-right"
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy(selectId, { error, helper })}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt, index) => {
            const value = typeof opt === "object" && opt !== null ? opt.value : opt;
            const text = typeof opt === "object" && opt !== null ? (opt.label ?? opt.value) : opt;
            return (
              <option key={`${value}-${index}`} value={value}>
                {text}
              </option>
            );
          })}
        </select>
        <span className="ui-control-wrap__right ui-select__chevron" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>
    </Field>
  );
});

export default SelectInput;