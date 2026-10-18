// src/lib/phone.js — NEW FILE
//
// AIM
// Kenyan phone numbers in one place. Everything that stores or compares a phone number uses
// these helpers, so "0712 345 678", "+254712345678" and "712345678" are all the same person.
//
//   toE164("0712 345 678")   -> "254712345678"   (null when it is not a Kenyan mobile number)
//   isKenyanMobile(x)        -> true / false
//   toLocal("254712345678")  -> "0712345678"
//   looksLikePhone(x)        -> true when the text is a phone number rather than an email

export function toE164(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(d)) return `254${d.slice(1)}`;
  if (/^[17]\d{8}$/.test(d)) return `254${d}`;
  if (/^254[17]\d{8}$/.test(d)) return d;
  return null;
}

export const isKenyanMobile = (raw) => toE164(raw) !== null;

export function toLocal(raw) {
  const e = toE164(raw);
  return e ? `0${e.slice(3)}` : String(raw ?? "");
}

/** Used by the login box: a phone number has no "@" and is mostly digits. */
export function looksLikePhone(raw) {
  const s = String(raw ?? "").trim();
  return s !== "" && !s.includes("@") && /^[+\d\s()-]+$/.test(s);
}
