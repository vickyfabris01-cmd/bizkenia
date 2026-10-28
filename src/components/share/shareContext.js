// src/components/share/shareContext.js — NEW FILE
//
// AIM
// The hook every Share button uses:
//
//   const { share } = useShare();
//   share({ type: "business", business });                          the business itself
//   share({ type: "product", business, item: product, farm });       a shop product, or farm produce (farm: true)
//   share({ type: "room", business, item: roomType, available, total });   a room type
//   share({ type: "site", page: "home" });                           the main site: "home" | "explore" | "pricing"
//
// The dialog (ShareProvider, mounted once in the business frame and the admin frame) opens over the
// screen the person is on. Nothing navigates anywhere. Outside a frame, share() does nothing.
// Kept in its own file so the provider file only exports a component.

import { createContext, useContext } from "react";

export const ShareContext = createContext(null);

const NOOP = { share: () => {} };

export function useShare() {
  return useContext(ShareContext) || NOOP;
}
