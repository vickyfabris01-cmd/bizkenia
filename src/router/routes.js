// src/router/routes.js — MODIFIED (adds /shop-rent)
//
// AIM
// The tab title and search description of every fixed page. AppRouter looks the current path up here
// (exact match). Pages whose text depends on data (a business, a product) set their own with useSeo().
//   key       the page key used by maintenance mode (Admin > Settings > Maintenance, "pages"). Never rename one:
//             a saved key that no route has any more simply does nothing.
//   title     shown in the browser tab as "<title> | <brand>"
//   desc      the search-result description (public pages)
//   private   true = tell search engines not to index it (signed-in and admin pages)

export const ROUTE_META = {
  "/":               { key: "home", title: "", desc: "Find rentals, shops and farms across Kenya, or run your own business in one place." },
  "/explore":        { key: "explore", title: "Explore businesses", desc: "Browse rentals, shops and farms in every county of Kenya." },
  "/shop-rent":      { key: "shop-rent", title: "Shop and rent", desc: "Shop products, buy fresh farm produce and find rooms to rent across Kenya." },
  "/pricing":        { key: "pricing", title: "For business owners", desc: "Simple monthly plans for rental, shop and farm businesses." },
  "/about":          { key: "about", title: "About", desc: "What the platform is and who it is for." },
  "/contact":        { key: "contact", title: "Contact", desc: "Get in touch with the support team." },
  "/terms":          { key: "terms", title: "Terms of use", desc: "The rules for using the platform." },
  "/privacy":        { key: "privacy", title: "Privacy", desc: "How your information is used and protected." },
  "/help":           { key: "help", title: "Help centre", desc: "Answers to common questions for customers and business owners." },
  "/login":          { key: "login", title: "Sign in", desc: "Sign in with your email or phone number.", private: true },
  "/signup":         { key: "signup", title: "Create account", desc: "Create a free account.", private: true },
  "/forgot-password": { key: "forgot-password", title: "Forgot password", private: true },
  "/reset-password": { key: "reset-password", title: "Reset password", private: true },
  "/confirm":        { key: "confirm", title: "Confirm your email", private: true },
  "/help/tickets":   { key: "help-tickets", title: "My tickets", private: true },
  "/notifications":  { key: "notifications", title: "Notifications", private: true },
  "/account":        { key: "account", title: "My account", private: true },
  "/account/requests": { key: "account-requests", title: "My requests", private: true },
  "/businesses":     { key: "businesses", title: "My businesses", private: true },
  "/orders":         { key: "orders", title: "My orders", private: true },
  "/wishlist":       { key: "wishlist", title: "My wishlist", private: true },
  "/start":          { key: "start", title: "Start a business", private: true },
  "/start/details":  { key: "start-details", title: "Business details", private: true },
  "/start/subscribe": { key: "start-subscribe", title: "Choose a plan", private: true },
  "/start/status":   { key: "start-status", title: "Business status", private: true },
  "/maintenance":    { key: "maintenance", title: "Back soon", private: true },
};

// Data-driven addresses are not in ROUTE_META (exact match only), so they get their key from a pattern.
const PAGE_PATTERNS = [
  { key: "shop-browse",   label: "Shop: browse products",  re: /^\/b\/[^/]+\/browse$/ },
  { key: "shop-product",  label: "Shop: product",          re: /^\/b\/[^/]+\/p\/[^/]+$/ },
  { key: "farm-produce",  label: "Farm: produce",          re: /^\/b\/[^/]+\/produce\/[^/]+$/ },
  { key: "room-type",     label: "Rental: room type",      re: /^\/b\/[^/]+\/room\/[^/]+$/ },
  { key: "shop-cart",     label: "Shop: cart",             re: /^\/b\/[^/]+\/cart$/ },
  { key: "shop-checkout", label: "Shop: checkout",         re: /^\/b\/[^/]+\/checkout$/ },
  { key: "room-request",  label: "Rental: request a room", re: /^\/b\/[^/]+\/request$/ },
  { key: "business",      label: "Business page",          re: /^\/b\/[^/]+$/ },
  { key: "order-detail",  label: "My order",               re: /^\/orders\/[^/]+$/ },
  { key: "invoice",       label: "Shared invoice",         re: /^\/invoice\/[^/]+$/ },
];

/** The maintenance page key of an address, or null (admin and /app pages have none: levels 1 to 3 cover them). */
export function pageKeyFor(pathname) {
  const exact = ROUTE_META[pathname]?.key;
  if (exact) return exact;
  return PAGE_PATTERNS.find((p) => p.re.test(pathname))?.key || null;
}

// Sign-in pages can never be marked: a super admin must always be able to get in.
const NEVER_MARK = new Set(["login", "forgot-password", "reset-password", "confirm", "maintenance"]);

/** [{ key, label }] for the page picker in Admin > Settings. */
export const PAGE_OPTIONS = [
  ...Object.values(ROUTE_META).filter((m) => m.key && !NEVER_MARK.has(m.key)).map((m) => ({ key: m.key, label: m.title || "Home page" })),
  ...PAGE_PATTERNS.map((p) => ({ key: p.key, label: p.label })),
];
