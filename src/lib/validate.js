// src/lib/validate.js — NEW FILE
// Tiny form checks that return an error message, or "" when the value is fine.

import { isKenyanMobile } from "./phone.js";

export const required = (v, label = "This field") => (String(v ?? "").trim() ? "" : `${label} is required.`);
export const email = (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim()) ? "" : "Enter a valid email address.");
export const phone = (v) => (isKenyanMobile(v) ? "" : "Enter a valid Kenyan phone number, like 0712 345 678.");
export const password = (v) =>
  String(v || "").length < 8 ? "Use at least 8 characters." : !/[A-Za-z]/.test(v) || !/\d/.test(v) ? "Use letters and at least one number." : "";

/** Runs a map of { field: errorString } and returns only the fields that have a message. */
export function collect(map) {
  return Object.fromEntries(Object.entries(map).filter(([, msg]) => msg));
}
