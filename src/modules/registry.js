// src/modules/registry.js — NEW FILE
//
// AIM
// Where each business type (rental, agriculture, shop) plugs into the app. A module supplies
// its navigation; the shell, router and guards do the rest. Adding a business type never means
// editing the shell or the router.
//
// Import from "modules/index.js" (it loads every module file, then re-exports this file).
// A module registers once:
//   registerModule({
//     type: "rental",
//     label: "Rental",
//     nav: [ { id, label, icon, path, phase, roles, element?, end? } ],
//   });
//
// NAV ITEM
//   id       stable name ("properties")
//   label    text in the menu
//   icon     name from ui/Icon.jsx
//   path     relative to /app/:slug  ("" = the dashboard, "properties" = /app/:slug/properties)
//   phase    the build phase that delivers the screen (shown on the ComingSoon page)
//   roles    which roles see the item: ["owner", "manager"]
//   element  a lazy React component. LEFT EMPTY while the screen is not built: the router then
//            shows the ComingSoon page naming `phase`. To build a screen, set `element`.
//   end      match the path exactly (dashboard)

const modules = new Map();

export function registerModule(mod) {
  modules.set(mod.type, mod);
}

export function getModule(type) {
  return modules.get(type) || null;
}

export function listModules() {
  return [...modules.values()];
}

/** The menu for one role. Items for other roles are left out. */
export function navFor(type, role) {
  const mod = getModule(type);
  if (!mod) return [];
  return mod.nav.filter((item) => item.roles.includes(role));
}