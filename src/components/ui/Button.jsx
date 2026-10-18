// src/components/ui/Button.jsx — MODIFIED FILE (rebuilt on design tokens; old props still work; step 5: works with React Router <Link>)
//
// AIM
// The one button used everywhere. Colours, sizes and states all come from tokens.css, so a
// button looks the same on every page and in both themes.
//
// PROPS
//   variant    "primary" (default) | "secondary" | "outline" | "danger" | "ghost"
//              Any other old value (e.g. "approve") falls back to "primary".
//   size       "sm" | "md" (default) | "lg"      all are at least 44px tall on touch screens
//   fullWidth  stretch to the container width
//   loading    shows a spinner, disables the button, keeps its width
//   leftIcon / rightIcon   optional nodes shown beside the label
//   as, href   render as a link:  <Button as="a" href="/x">  (or just pass href)
//               with React Router:  <Button as={Link} to="/x">
//   ...rest    onClick, type, disabled, style, aria-*, target, rel, etc.

import "./Button.css";

const VARIANTS = ["primary", "secondary", "outline", "danger", "ghost"];
const SIZES = ["sm", "md", "lg"];

export default function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  fullWidth = false,
  loading = false,
  leftIcon = null,
  rightIcon = null,
  as,
  href,
  type,
  disabled,
  onClick,
  ...rest
}) {
  const v = VARIANTS.includes(variant) ? variant : "primary";
  const s = SIZES.includes(size) ? size : "md";
  const isDisabled = Boolean(disabled || loading);
  const Tag = as || (href ? "a" : "button");
  const isLink = Tag !== "button";

  const classes = [
    "ui-btn",
    `ui-btn--${v}`,
    `ui-btn--${s}`,
    fullWidth ? "ui-btn--full" : "",
    loading ? "is-loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const props = { ...rest, className: classes };

  if (isLink) {
    props.href = isDisabled ? undefined : href;
    props["aria-disabled"] = isDisabled || undefined;
    // A real link (href, or <Link to>) keeps its link role; only a bare element needs role="button"
    props.role = props.role || (href || rest.to ? undefined : "button");
    props.onClick = isDisabled
      ? (event) => event.preventDefault()
      : onClick;
  } else {
    props.type = type || "button";
    props.disabled = isDisabled;
    props.onClick = onClick;
  }
  if (loading) props["aria-busy"] = true;

  return (
    <Tag {...props}>
      {loading && <span className="ui-btn__spinner" aria-hidden="true" />}
      {leftIcon && !loading && (
        <span className="ui-btn__icon" aria-hidden="true">
          {leftIcon}
        </span>
      )}
      {children != null && <span className="ui-btn__label">{children}</span>}
      {rightIcon && (
        <span className="ui-btn__icon" aria-hidden="true">
          {rightIcon}
        </span>
      )}
    </Tag>
  );
}