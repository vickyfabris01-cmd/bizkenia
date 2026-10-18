<!-- docs/phase-3/README.md — NEW FILE
AIM: hand-off note for Phase 3 (rental people and communication + account menu). -->
# Phase 3 hand-off

**Base commit:** `a2fd553` (Phase 2). Branch `phase-3`.

## What is in it
- **Account menu for everyone signed in** (visitors included): avatar menu on the public header with Profile, My requests, My businesses (if a member), Notifications, My tickets and **Sign out**; the mobile drawer has the same plus Sign out. My account gained a profile picture upload.
- **Resident portal** (`/app/:slug`): My home, My room, My invoices (Pay now by M-Pesa STK, payment history, printable receipts), Complaints, Notices, Move rooms (`/transfer`), Messages.
- **Staff:** Complaints inbox (reply, status, priority, assign), Room transfers (`/transfers`), Announcements (all / building / floor, pin), Workforce (workers, attendance sheet, payroll, pay salary), Messages.
- **Worker portal:** My work (check in/out, month calendar), My pay, Notices, Messages. New member role `worker`; `is_staff()` is unchanged so workers see no business data.
- **Notification centre** `/notifications` (filters, mark read, delete, preferences) and a live bell with in-app toast alerts (realtime).
- **Help desk:** `/help` (articles from the database), `/help/tickets`, super admin `/admin/support` (tickets and article editor).

## Database (apply in order, then optional seeds)
`20261015100001_p3_01_workforce` · `…02_complaints_transfers` · `…03_announcements` · `…04_messaging` · `…05_support` · `…06_notification_preferences` (also creates the public `avatars` bucket) · `…07_remove_legacy_roles`.
Seed: `supabase/seed/p3.sql` (after p1_demo and p2). Tests: `supabase/tests/p3_rls_tests.sql` (run on a dev DB; rolls back).
Demo accounts (password `Demo#1234`): `worker.guard@example.com`, plus the Phase 2 owner/manager/residents.

## Legacy cleanup (p3_07) — what was and was not removed
Removed: role-switching and legacy RPCs (`assign_role`, `elevate_*`, `revert_to_visitor`, `lookup_visitor_by_email`, `broadcast_notification`, `invite_worker`, `regenerate_billing_for_client`, old trigger functions), the helpers `my_role`/`my_tenant_id`/`same_tenant`, and every row rule that granted access through `profiles.role`/`profiles.tenant_id` (profiles, businesses, floors, tenant_branding, notification_log, notifications).
**Kept on purpose:** the columns `profiles.role` (now only the platform flag, `super_admin` vs everyone) and `profiles.tenant_id`, because `RequireSuperAdmin`/`is_super_admin()` and a few old triggers still read them. The legacy pages are gone (Phase 5 step 4); the `tenant_id` rename was left alone on purpose, since it carries no risk and no benefit.

## Notes and limits
- Payroll "outstanding" assumes 4 weeks per month for weekly workers and 2 for fortnightly.
- A worker added by email is linked automatically the next time that person signs in (`claim_worker_links`).
- Messaging: residents and workers can only message the owner/managers; owner/managers can message anyone in the business. The super admin cannot read messages, complaints, workers or announcements (tested).
- Notification preferences cover billing, requests, complaints, notices, messages, work and support; account/security alerts cannot be switched off.

## Verified / not verified
Verified locally (Postgres 16 + PostgREST + browser harness): SQL 100% of p2 (58) and p3 checks pass; 47 browser checks (visitor, resident, manager, worker, help desk, super admin) plus 32 mobile/dark overflow checks pass.
**Not verified:** the migrations were **not applied to the dev Supabase project** (the tool call was cancelled) — apply them yourself; real M-Pesa STK, Google sign-in, real realtime websockets and real storage uploads (the harness fakes them); `npm run lint` is broken from before (ESLint 8 vs flat config). Pushing to GitHub is impossible from this session (403).
