// src/lib/format.js — NEW FILE
// Small display helpers shared by Phase 1 pages.

export const formatKsh = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE")}`;

export function periodLabel(days) {
  if (days === 30) return "per month";
  if (days === 90) return "per 3 months";
  if (days === 365) return "per year";
  return `per ${days} days`;
}

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
