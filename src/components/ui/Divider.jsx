// src/components/ui/Divider.jsx — NEW FILE (the old one lived inside Spinner.jsx)
//
// AIM
// A thin line to separate sections, optionally with a short label in the middle
// (for example "or" between the Google button and the email form).
//
// PROPS
//   label  optional text shown in the middle

import "./Divider.css";

export default function Divider({ label = "", className = "" }) {
  if (!label) {
    return <hr className={`ui-divider ${className}`.trim()} />;
  }
  return (
    <div className={`ui-divider-label ${className}`.trim()} role="separator">
      <span className="ui-divider-label__line" />
      <span className="ui-divider-label__text">{label}</span>
      <span className="ui-divider-label__line" />
    </div>
  );
}

export { Divider };