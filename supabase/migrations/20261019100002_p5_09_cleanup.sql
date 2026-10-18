-- 20261019100002_p5_09_cleanup.sql — Phase 5 step 4 (launch cleanup)
-- The old name "tenants" was kept as a view so the first version of the app kept working. All code that
-- used it is deleted in this release, so the view goes. (The columns named tenant_id on the rental
-- tables stay as they are: renaming them is optional and risky, and nothing needs it.)
drop view if exists public.tenants;
