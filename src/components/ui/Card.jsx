// src/components/ui/Card.jsx — NEW FILE
//
// AIM
// The standard surface for grouped content: a bordered, softly shadowed box that works in
// light and dark. Use it instead of hand-made white boxes so spacing, corners and borders
// stay the same on every page.
//
// EXPORTS
//   Card         wrapper.   padding "none" | "sm" | "md" (default) | "lg"
//                interactive = lift on hover (for clickable cards; pass onClick or as="a")
//   CardHeader   title row. <CardHeader title="Payments" subtitle="This month" action={<Button/>} />
//   CardBody     the padded content area (use when the Card has padding="none")
//   CardFooter   bottom row for actions, separated by a line
//
// EXAMPLE
//   <Card>
//     <CardHeader title="Rent due" action={<Badge variant="warning">3 late</Badge>} />
//     <CardBody>...</CardBody>
//   </Card>

import "./Card.css";

const PADDINGS = ["none", "sm", "md", "lg"];

export function Card({
  as: Tag = "div",
  padding = "md",
  interactive = false,
  className = "",
  children,
  ...rest
}) {
  const p = PADDINGS.includes(padding) ? padding : "md";
  const classes = `ui-card ui-card--pad-${p}${interactive ? " ui-card--interactive" : ""} ${className}`.trim();
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action = null, className = "" }) {
  return (
    <div className={`ui-card__header ${className}`.trim()}>
      <div className="ui-card__heading">
        {title && <h3 className="ui-card__title">{title}</h3>}
        {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
      </div>
      {action && <div className="ui-card__action">{action}</div>}
    </div>
  );
}

export function CardBody({ className = "", children, ...rest }) {
  return (
    <div className={`ui-card__body ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className = "", children, ...rest }) {
  return (
    <div className={`ui-card__footer ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export default Card;