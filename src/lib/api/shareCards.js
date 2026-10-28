// src/lib/api/shareCards.js — MODIFIED FILE (the saved card is checked first; nothing is drawn when it is still current)
//
// AIM
// Keeps the LINK CARD of each thing ready. The link card is the small landscape picture that WhatsApp,
// Facebook, Telegram and X show when the shared link is pasted (see lib/shareCard.js). It is saved once,
// together with a fingerprint of the data it shows, so:
//   - the first time something is shared, its card is drawn, saved and recorded;
//   - after that the saved card is used as it is, until the data changes (a new price, photo, logo...),
//     when the fingerprint no longer matches and the card is drawn and saved again (the old file is deleted);
//   - the Worker (worker/share.js) reads the saved card from the database when a link is opened by a
//     preview bot, so the link shows the card. No card (or any error) means the item's own photo is shown.
//
// Where the files go:  business-media / <businessId>/share/<kind>-<id>-<fingerprint>.jpg   (owner or manager)
//                      site-media     / share/<page>-<fingerprint>.jpg                      (super admin)
// The record is written by the database function set_share_card, which checks who is asking.
// Every function returns { data, error } and never throws.

import { supabase } from "../../config/supabase.js";
import { removeFiles, uploadFile, publicUrl } from "../storage.js";
import { cardFingerprint, renderPreview } from "../shareCard.js";
import { siteHost } from "../share.js";

const NOT_CONNECTED = "The app is not connected to the database yet.";

async function getStored(ref) {
  const { data } = await supabase.rpc("get_share_card", { p_kind: ref.kind, p_id: ref.id || null, p_key: ref.key || null });
  return data && typeof data === "object" ? data : null;
}

function locate(ref, fp) {
  if (ref.kind === "site") return { bucket: "site-media", path: `share/${ref.key}-${fp}.jpg` };
  const what = ref.kind === "business" ? "business" : `${ref.kind}-${ref.id}`;
  return { bucket: "business-media", path: `${ref.businessId}/share/${what}-${fp}.jpg` };
}

/**
 * Makes sure the saved link card matches the data. `target` comes from lib/share.js.
 * Returns { data: { v, blob, saved }, error }:
 *   v      the card version for the link (always set, even when saving failed)
 *   blob   the card that was just drawn; null when the saved one was still current, so nothing was drawn
 *   saved  true when the link will show this card; false when the link will fall back to the item photo
 * The saved card is looked up first, so opening Share on something that has not changed is quick: no drawing, no upload.
 */
export async function ensureShareCard(target) {
  const v = cardFingerprint(target.card);
  const ref = target.ref;
  const stored = supabase ? await getStored(ref) : null;
  if (stored?.v === v && stored?.url) return { data: { v, blob: null, saved: true }, error: null };

  const blob = await renderPreview(target.card, { host: siteHost() });
  if (!blob) return { data: { v, blob: null, saved: false }, error: "The card could not be drawn on this device." };
  if (!supabase) return { data: { v, blob, saved: false }, error: NOT_CONNECTED };

  const { bucket, path } = locate(ref, v);
  const up = await uploadFile(bucket, path, new File([blob], path.split("/").pop(), { type: "image/jpeg" }));
  // "already exists" means this exact card was saved before (same fingerprint): fine
  if (up.error && !/exist|duplicate|409/i.test(up.error.message || "")) return { data: { v, blob, saved: false }, error: up.error.message };

  const card = { v, bucket, path, url: publicUrl(bucket, path) };
  const { error } = await supabase.rpc("set_share_card", { p_kind: ref.kind, p_id: ref.id || null, p_key: ref.key || null, p_card: card });
  if (error) return { data: { v, blob, saved: false }, error: error.message };

  if (stored?.path && stored.path !== path) removeFiles(stored.bucket || bucket, [stored.path]); // the old card is no longer needed
  return { data: { v, blob, saved: true }, error: null };
}
