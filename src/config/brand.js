// src/config/brand.js — NEW FILE
//
// AIM
// One place that holds the product name and public identity. Never type the product
// name inside a component, page or message: import BRAND from here instead, so a future
// rename is a one-file change.
//
// Name: BizKenia (decided). Logo: placeholder until the final logo is agreed.

export const BRAND = {
  name: "BizKenia",

  // TODO(placeholder): final tagline not decided yet.
  tagline: "Manage and grow your business",

  // TODO: domain and support address not decided yet. Still the old values.
  supportEmail: "support@fabrentals.co.ke",
  website: "https://fabrentals.co.ke",
};

/** Browser-tab title: "Sign In — BizKenia". With no page title it is just "BizKenia". */
export function pageTitle(title) {
  return title ? `${title} — ${BRAND.name}` : BRAND.name;
}