// src/components/share/ShareButton.jsx — NEW FILE
//
// AIM
// The Share button used everywhere an item, a business or a site page can be shared. By default it is just
// the share icon (a round-cornered square button); give it text and the icon sits beside the text.
// Clicking it opens the platform picker over the current screen (see ShareProvider); nothing navigates.
//
//   <ShareButton request={{ type: "room", business, item: roomType, available: 3, total: 10 }} label="Share Bedsitter" />
//   <ShareButton request={{ type: "business", business }}>Share this business</ShareButton>
//
// PROPS
//   request    what to share (see shareContext.js)
//   label      the accessible name and tooltip of the icon-only button, for example "Share Bedsitter"
//   children   optional text; when given, the button shows the icon and the text
//   variant, size, className, disabled   as for Button (default: outline, sm)

import "./ShareMenu.css";
import { Button, Icon } from "../ui";
import { useShare } from "./shareContext.js";

export default function ShareButton({ request, label = "Share", children, variant = "outline", size = "sm", className = "", disabled = false }) {
  const { share } = useShare();
  const hasText = children !== undefined && children !== null && children !== false;
  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled}
      className={`${hasText ? "" : "share-icon-btn "}${className}`.trim()}
      leftIcon={<Icon name="share" size={18} />}
      aria-label={hasText ? undefined : label}
      title={hasText ? undefined : label}
      onClick={(e) => { e.stopPropagation(); share(request); }}
    >
      {hasText ? children : null}
    </Button>
  );
}
