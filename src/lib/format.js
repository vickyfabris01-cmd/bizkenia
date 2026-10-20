// src/lib/format.js — MODIFIED (fixed plan durations: 6-month label, DURATIONS, saving helpers)
// Small display helpers shared by Phase 1 pages.

export const formatKsh = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE")}`;

export function periodLabel(days) {
  if (days === 30) return "per month";
  if (days === 90) return "per 3 months";
  if (days === 180) return "per 6 months";
  if (days === 365) return "per year";
  return `per ${days} days`;
}

// The four fixed plan durations. These mirror the plan_durations lookup table in the database
// (migration p5_13); the database is the authority, this list only gives the pages their order and labels.
export const DURATIONS = [
  { code: "monthly", label: "Monthly", months: 1 },
  { code: "quarterly", label: "Quarterly", months: 3 },
  { code: "half_yearly", label: "Half a year", months: 6 },
  { code: "yearly", label: "Yearly", months: 12 },
];

export const durationLabel = (code) => DURATIONS.find((d) => d.code === code)?.label || code;

// What the owner saves by paying for `months` at once instead of month by month. Never negative.
export function savingFor(monthlyPrice, months, price) {
  const full = Number(monthlyPrice || 0) * Number(months || 0);
  const paid = Number(price || 0);
  if (!(full > 0) || !(paid > 0)) return { kes: 0, percent: 0 };
  const kes = Math.max(0, full - paid);
  return { kes, percent: Math.max(0, Math.round((100 * kes) / full)) };
}

export const billingBlurb = (months) => (months === 1 ? "Billed every month" : `One payment covers ${months} months`);

export function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const STATUS_BADGE = {
  draft: ["neutral", "Draft"],
  pending_payment: ["warning", "Awaiting payment"],
  pending: ["warning", "Pending approval"],
  active: ["success", "Active"],
  rejected: ["error", "Needs changes"],
  suspended: ["error", "Suspended"],
};
