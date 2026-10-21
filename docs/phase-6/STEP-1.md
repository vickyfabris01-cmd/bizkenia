# Phase 6, step 1: delete a business, hand over ownership, delete an account

Built on `fc723b1`. Database: `p6_01` and `p6_02` (run both, in order, in the SQL editor).

## What owners and users get
- **Settings > Danger zone** (owner only, every business type)
  - *Hand over ownership*: the owner picks one of his managers (or invites one by email, right there) and sends an offer. The manager accepts under **My businesses > Ownership offers**. The two swap roles in one step, so there is always exactly one owner.
  - *Delete this business*: needs the password. The business is hidden at once and kept for **60 days**; the owner restores it from **My businesses** (or its status page) until then. After 60 days it is deleted for good with all its data. A business that never took payment is removed straight away.
  - Refused while there is an **unfinished order** or an **active tenancy**, and for a suspended business (support handles those).
- **My account > Danger zone > Delete my account** (everyone, needs the password)
  - A super admin, an owner of a live business, and a resident with an active tenancy are stopped with a clear message.
  - Otherwise a list says exactly what happens. The account goes at once and for good. What the person did stays as history for the business, shown as "Deleted user". A business they deleted within the last 60 days is deleted for good now (nobody could restore it).
- **Support (super admin)**: *Close business* and *Restore business* on a business's admin page. A business support closed cannot be restored by its owner.
- A restored business whose paid period has run out comes back as "Awaiting payment". After the owner subscribes it opens straight away (no second review).
- The platform's subscription and payment records are never deleted. After a purge they stay, unlinked, with a snapshot of the business name.

## Deploy
1. Run `supabase/migrations/20261021100001_p6_01_closing_handover_account_deletion.sql`, then `20261021100002_p6_02_deletable_people.sql`.
2. Deploy the functions:
   ```
   supabase functions deploy delete-business
   supabase functions deploy delete-account
   supabase functions deploy purge-closed-businesses --no-verify-jwt
   ```
   `purge-closed-businesses` has no sign-in check because the scheduler calls it, not a browser. It is protected by a secret instead.
3. Add the secret (Supabase > Edge Functions > Secrets): `CRON_SECRET` = any long random text.
4. Schedule the daily purge. In the SQL editor (replace the project reference and the secret):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select cron.schedule('bizkenia-purge-closed', '0 1 * * *', $$
     select net.http_post(
       url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/purge-closed-businesses',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
       body    := '{}'::jsonb);
   $$);
   ```
   It runs at 01:00 UTC (04:00 in Kenya). Each run sends the day-50 reminder and purges everything past day 60, files included. Test it once by hand: `curl -X POST -H "x-cron-secret: YOUR_CRON_SECRET" https://YOUR-PROJECT-REF.supabase.co/functions/v1/purge-closed-businesses`.

## Try it
1. Owner of a test shop: Settings > Danger zone > Delete business (wrong password is refused, right password closes it). The page opens its status with **Restore business**. Restore it.
2. Create an order that is not delivered: Delete business is refused until it is finished.
3. Invite a manager from the Danger zone, open the invite link as that person, then offer ownership and accept it under My businesses.
4. Delete the account of a test customer who has an order: the order stays, and the person is gone.
5. As the owner, try Delete my account: you are asked to hand over or delete the business first.
6. To see the purge without waiting 60 days, in the SQL editor: `update businesses set closed_at = now() - interval '61 days' where slug = 'your-test-slug';` then run the curl above.

## Notes
- People removed from records show as "Deleted user" where a name was shown. The links were changed to "set null" in `p6_02`, so records stay.
- `businesses.owner_user_id` is deliberately left as it was: the database itself refuses to delete a user who is still the owner of a business.
- Someone who signed in with Google must set a password (My account > Password) before they can delete anything; the dialog says so.
