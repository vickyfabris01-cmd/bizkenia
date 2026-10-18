// src/lib/permissions.js — MODIFIED FILE (Phase 3: adds the worker role)
//
// AIM
// One place that answers "may this person do that?". Screens and menus ask here instead of
// comparing role names themselves, so a rule changes in one file.
//
// ROLES   per business: owner, manager, resident (a person with a current tenancy; their own
//         screens arrive in Phase 3, and they have no staff rights; workers arrive later). The platform super_admin has NO role inside a business: business dashboards
//         are a no-go zone for them; they see business data from /admin only.
// ACTIONS strings such as "rental.property.create" (module.thing.verb), or the platform ones
//         below. "*" in the table means every action in that group.
//
//   can(profile, membership, "business.settings")      plain function
//   useCan("business.settings")                          hook (reads the current business)
//
// The database enforces the same rules with row-level security; this file only decides what
// to SHOW. Never rely on it alone for safety.

import { useSession } from "../store/sessionStore.js";
import { useBusinessContext } from "../router/BusinessContext.jsx";

const OWNER_ONLY = ["business.settings", "business.managers", "business.subscription", "business.delete"];

const RULES = {
  owner: () => true,
  manager: (action) => !OWNER_ONLY.includes(action) && !action.startsWith("business.billing."),
  resident: (action) => action.startsWith("resident."),
  worker: (action) => action.startsWith("worker."),
};

export function roleOf(_profile, membership) {
  return membership?.role || null;
}

export function can(_profile, membership, action) {
  const role = membership?.role;
  const rule = RULES[role];
  return rule ? rule(action) : false;
}

export function useCan(action) {
  const profile = useSession((s) => s.profile);
  const ctx = useBusinessContext();
  return can(profile, ctx ? { role: ctx.role } : null, action);
}

export const ROLE_LABEL = { owner: "Owner", manager: "Manager", resident: "Resident", worker: "Worker" };
