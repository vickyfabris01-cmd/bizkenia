// src/lib/landing.js — NEW FILE
//
// AIM
// Where a person goes right after signing in, and the safe-redirect check for ?next=.
//
//   safeNext(value, fallback)    only accepts a path inside this site ("/explore"), never "//evil.com"
//   landingFor(profile, userId)  super admin  -> /admin
//                                has a business (owner or manager) -> /businesses
//                                everyone else (a visitor) -> /  (the home page, to browse)

import { useBusinessStore } from "../store/businessStore.js";

export function safeNext(value, fallback) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export async function landingFor(profile, userId) {
  if (profile?.role === "super_admin") return "/admin";
  if (!userId) return "/";
  await useBusinessStore.getState().load(userId);
  return useBusinessStore.getState().memberships.length > 0 ? "/businesses" : "/";
}