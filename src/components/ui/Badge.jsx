// src/components/ui/Badge.jsx — MODIFIED FILE (rebuilt on design tokens; old props still work)
//
// AIM
// A small status pill ("Paid", "Overdue", "Pending"). Colours come from the status tokens,
// so every status looks the same on every page and passes contrast in both themes.
//
// PROPS
//   variant  "neutral" (default) | "brand" | "success" | "warning" | "error" | "info"
//            plus the old names "paid" (= success), "overdue" (= error), "pending" (= warning)
//   size     "sm" | "md" (default) | "lg"
//   A badge with no children renders nothing (the old one drew an empty pill).
//
// The wrapper badges at the bottom (PaymentBadge, RoleBadge ...) are kept because old
// pages import them.

import "./Badge.css";

const ALIASES = { paid: "success", overdue: "error", pending: "warning" };
const VARIANTS = ["neutral", "brand", "success", "warning", "error", "info"];
const SIZES = ["sm", "md", "lg"];

function Badge({
  variant = "neutral",
  size = "md",
  className = "",
  style,
  children,
}) {
  if (children === null || children === undefined || children === false || children === "") {
    return null;
  }

  const resolved = ALIASES[variant] || variant;
  const v = VARIANTS.includes(resolved) ? resolved : "neutral";
  const s = SIZES.includes(size) ? size : "md";
  const classes = `ui-badge ui-badge--${v} ui-badge--${s} ${className}`.trim();

  return (
    <span className={classes} style={style}>
      {children}
    </span>
  );
}

export { Badge };
export default Badge;

export function BillingBadge(props) {
  return <Badge variant="info" {...props} />;
}
export function PaymentBadge(props) {
  return <Badge variant="success" {...props} />;
}
export function RoomBadge(props) {
  return <Badge variant="brand" {...props} />;
}
export function RequestBadge(props) {
  return <Badge variant="pending" {...props} />;
}
export function ComplaintBadge(props) {
  return <Badge variant="warning" {...props} />;
}
export function RoleBadge(props) {
  return <Badge variant="neutral" {...props} />;
}
export function TenantBadge(props) {
  return <Badge variant="brand" {...props} />;
}
export function MethodBadge(props) {
  return <Badge variant="info" {...props} />;
}