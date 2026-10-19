// src/router/routes.js — MODIFIED (adds /shop-rent)
//
// AIM
// The tab title and search description of every fixed page. AppRouter looks the current path up here
// (exact match). Pages whose text depends on data (a business, a product) set their own with useSeo().
//   title     shown in the browser tab as "<title> | <brand>"
//   desc      the search-result description (public pages)
//   private   true = tell search engines not to index it (signed-in and admin pages)

export const ROUTE_META = {
  "/":               { title: "", desc: "Find rentals, shops and farms across Kenya, or run your own business in one place." },
  "/explore":        { title: "Explore businesses", desc: "Browse rentals, shops and farms in every county of Kenya." },
  "/shop-rent":      { title: "Shop and rent", desc: "Shop products, buy fresh farm produce and find rooms to rent across Kenya." },
  "/pricing":        { title: "For business owners", desc: "Simple monthly plans for rental, shop and farm businesses." },
  "/about":          { title: "About", desc: "What the platform is and who it is for." },
  "/contact":        { title: "Contact", desc: "Get in touch with the support team." },
  "/terms":          { title: "Terms of use", desc: "The rules for using the platform." },
  "/privacy":        { title: "Privacy", desc: "How your information is used and protected." },
  "/help":           { title: "Help centre", desc: "Answers to common questions for customers and business owners." },
  "/login":          { title: "Sign in", desc: "Sign in with your email or phone number.", private: true },
  "/signup":         { title: "Create account", desc: "Create a free account.", private: true },
  "/forgot-password": { title: "Forgot password", private: true },
  "/reset-password": { title: "Reset password", private: true },
  "/confirm":        { title: "Confirm your email", private: true },
  "/help/tickets":   { title: "My tickets", private: true },
  "/notifications":  { title: "Notifications", private: true },
  "/account":        { title: "My account", private: true },
  "/account/requests": { title: "My requests", private: true },
  "/businesses":     { title: "My businesses", private: true },
  "/orders":         { title: "My orders", private: true },
  "/wishlist":       { title: "My wishlist", private: true },
  "/start":          { title: "Start a business", private: true },
  "/start/details":  { title: "Business details", private: true },
  "/start/subscribe": { title: "Choose a plan", private: true },
  "/start/status":   { title: "Business status", private: true },
  "/maintenance":    { title: "Back soon", private: true },
};