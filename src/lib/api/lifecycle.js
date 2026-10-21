// src/lib/api/lifecycle.js — NEW FILE (Phase 6 step 1)
//
// AIM
// Everything the browser does about deleting a business, handing it over, and deleting an account.
// Each function returns { data, error } and never throws; the messages from the database and the
// server functions are plain English and are shown as they are.
//   - Deleting a business or an account goes through a server function that asks for the password
//     again (delete-business, delete-account). The browser cannot do those directly.
//   - Restoring, handing over and the "can I?" checks are database functions the signed-in person
//     may call; the database decides who is allowed.

import { supabase } from "../../config/supabase.js";

const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };
const wrap = ({ data, error }) => ({ data: data ?? null, error: error?.message || null });
const rpc = async (fn, args) => (supabase ? wrap(await supabase.rpc(fn, args)) : NOT_CONNECTED);

/** Calls a server function and turns every failure into a plain message. */
async function callFunction(name, body) {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // For an answer other than 200 the real message is in the response body.
    let message = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) message = j.error; } catch { /* keep the generic message */ }
    return { data: null, error: message };
  }
  if (data?.error) return { data: null, error: data.error };
  return { data, error: null };
}

// ---- delete a business ------------------------------------------------------------------
/** What the owner may do: { status, mode, can_delete, open_orders, active_tenancies, closed_at, restore_until, ... } */
export const businessDeleteCheck = (businessId) => rpc("business_delete_check", { p_business: businessId });
/** Needs the owner's password. Answers { result: "closed" | "deleted" }. */
export const deleteBusiness = (businessId, password) => callFunction("delete-business", { businessId, password });
/** Brings a deleted business back (owner, within 60 days). Answers the new status. */
export const restoreBusiness = (businessId) => rpc("restore_business", { p_business: businessId });

// ---- hand over ownership ----------------------------------------------------------------
export const offerOwnership = (businessId, toUser) => rpc("offer_ownership", { p_business: businessId, p_to_user: toUser });
export const cancelOwnershipOffer = (businessId) => rpc("cancel_ownership_offer", { p_business: businessId });
export const respondOwnership = (transferId, accept) => rpc("respond_ownership", { p_transfer: transferId, p_accept: accept });
/** Offers waiting for the signed-in person. */
export const myOwnershipOffers = () => rpc("my_ownership_offers");
/** The offer the owner has out for this business, or null. */
export async function businessOwnershipOffer(businessId) {
  const res = await rpc("business_ownership_offer", { p_business: businessId });
  return { data: res.data?.[0] || null, error: res.error };
}

// ---- delete my account ------------------------------------------------------------------
/** { can_delete, is_super_admin, owned_blocking[], owned_closed[], active_tenancies, open_orders } */
export const accountDeleteCheck = () => rpc("account_delete_check");
/** Needs the person's password. Answers { ok: true }. */
export const deleteAccount = (password) => callFunction("delete-account", { password });

// ---- support (super admin) --------------------------------------------------------------
export const adminCloseBusiness = (businessId) => rpc("admin_close_business", { p_business: businessId });
export const adminRestoreBusiness = (businessId) => rpc("admin_restore_business", { p_business: businessId });
