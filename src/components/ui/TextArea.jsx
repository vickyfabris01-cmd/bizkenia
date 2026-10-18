// src/components/ui/TextArea.jsx — MODIFIED FILE (rebuilt on design tokens; old props still work)
//
// AIM
// A multi-line text field.
//
// PROPS
//   label, error, helper, required, disabled, id, className, style
//   rows   default 4
//   ...rest  any native <textarea> prop: value, onChange, placeholder, maxLength ...
//
// COMPATIBILITY NOTE
// The old file also exported Checkbox and Toggle, and five pages still import them from
// here ("../ui/TextArea.jsx"). The real components now live in Checkbox.jsx and Toggle.jsx;
// they are re-exported below so those imports keep working. Move those imports to
// "components/ui" when each page is rebuilt, then delete the two lines at the bottom.

import { forwardRef } from "react";
import Field, { describedBy, useFieldId } from "./Field.jsx";

const TextArea = forwardRef(function TextArea(
  {
    label,
    error,
    helper,
    required = false,
    disabled = false,
    rows = 4,
    id,
    className = "",
    style,
    ...rest
  },
  ref,
) {
  const areaId = useFieldId(id);

  return (
    <Field
      id={areaId}
      label={label}
      required={required}
      error={error}
      helper={helper}
      className={className}
      style={style}
    >
      <textarea
        {...rest}
        ref={ref}
        id={areaId}
        rows={rows}
        disabled={disabled}
        className="ui-control"
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(areaId, { error, helper })}
      />
    </Field>
  );
});

export default TextArea;

// Kept for old imports (see note at the top)
export { default as Checkbox } from "./Checkbox.jsx";
export { default as Toggle } from "./Toggle.jsx";