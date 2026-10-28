// src/lib/api/shareTargets.js — NEW FILE
//
// AIM
// Turns a share request (what the person clicked) into a share target (lib/share.js): the page, the
// message and the card. It reads the owner's display options first (rent price, phone, location; for the site,
// plan prices), and for a site page the hero photo, so the card always matches what the owner chose.
//
//   { type: "business", business }
//   { type: "product",  business, item, farm }
//   { type: "room",     business, item, available, total, building }
//   { type: "site",     page }                  page: home | explore | pricing
//
// Returns { data: target, error } and never throws.

import { getShareOptions } from "./shareOptions.js";
import { getSiteFacts } from "./siteShare.js";
import { businessTarget, productTarget, roomTarget, siteTarget } from "../share.js";

export async function resolveShareTarget(req, brand) {
  try {
    if (!req) return { data: null, error: "Nothing to share." };
    if (req.type === "site") {
      const { data: options } = await getShareOptions(null);
      const facts = await getSiteFacts({ plans: req.page === "pricing" && options.showPlanPrices });
      return { data: siteTarget(req.page, { brand, hero: facts.data?.hero || "", plans: facts.data?.plans || [], options }), error: null };
    }
    const b = req.business;
    if (!b) return { data: null, error: "Nothing to share." };
    const { data: options } = await getShareOptions(b.id);
    if (req.type === "business") return { data: businessTarget(b, { options }), error: null };
    if (req.type === "room") return { data: roomTarget(b, req.item, { available: req.available, total: req.total, building: req.building, options }), error: null };
    return { data: productTarget(b, req.item, { farm: Boolean(req.farm), options }), error: null };
  } catch (e) {
    return { data: null, error: e?.message || "Could not get this ready to share." };
  }
}
