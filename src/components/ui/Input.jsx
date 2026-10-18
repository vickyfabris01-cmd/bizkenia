// src/components/ui/Input.jsx — MODIFIED FILE (rebuilt on design tokens; old props still work)
//
// AIM
// The standard single-line text field (text, email, number, date, search ...).
//
// PROPS (all the old ones are kept)
//   label           text above the field
//   error           red message below (hides the helper)
//   helper          grey hint below
//   leftAdornment   icon or text inside the left edge
//   rightAdornment  icon or text inside the right edge
//   required        adds * to the label
//   disabled
//   id              optional; one is generated when omitted
//   style, className  applied to the outer wrapper (as before)
//   ...rest         any native <input> prop: type, placeholder, value, onChange, onBlur ...
//
// USAGE
//   <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
//   <Input label="Search" leftAdornment={<SearchIcon />} placeholder="Search residents…" />

import { forwardRef } from "react";
import Field, { describedBy, useFieldId } from "./Field.jsx";

const Input = forwardRef(function Input(
  {
    label,
    error,
    helper,
    leftAdornment,
    rightAdornment,
    required = false,
    disabled = false,
    id,
    style,
    className = "",
    type = "text",
    ...rest
  },
  ref,
) {
  const inputId = useFieldId(id);
  const controlClass = [
    "ui-control",
    leftAdornment ? "ui-control--pad-left" : "",
    rightAdornment ? "ui-control--pad-right" : "",
  ]
    .filter(Boolean)
    .join(" ");

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
        {leftAdornment && <span className="ui-control-wrap__left">{leftAdornment}</span>}
        <input
          {...rest}
          ref={ref}
          id={inputId}
          type={type}
          disabled={disabled}
          className={controlClass}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy(inputId, { error, helper })}
        />
        {rightAdornment && <span className="ui-control-wrap__right">{rightAdornment}</span>}
      </div>
    </Field>
  );
});

export default Input;