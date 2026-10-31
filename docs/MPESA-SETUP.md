# M-Pesa setup, step by step

How it fits together: the app never talks to Safaricom. The `mpesa-stk-push` function asks Safaricom to send the payment prompt; Safaricom replies to `mpesa-callback`, which checks a secret and the amount, then marks the payment paid. Three places hold settings:

| Where | What | Who |
|---|---|---|
| Supabase > Edge Functions > **Secrets** | Daraja keys, passkey, callback secret | You (platform owner) |
| Admin > **Settings > M-Pesa** | Mode (Sandbox/Live) and your platform shortcode | You |
| Each business's own **Settings** | Their own paybill and passkey, for rent and shop orders | Each business owner |

Subscriptions (businesses paying you) use the platform values. Rent and shop orders go to the **business's own** paybill.

## Part A. Test first in the sandbox

1. Go to **developer.safaricom.co.ke**, sign up, then **My Apps > Add a new app**. Tick **M-Pesa Sandbox** (Lipa na M-Pesa / M-Pesa Express). Open the app and copy the **Consumer Key** and **Consumer Secret**.
2. In Daraja open **APIs > M-Pesa Express** (simulate page). It shows the sandbox **Business Shortcode** (usually `174379`) and the sandbox **Passkey**. Copy the passkey.
3. Make a callback secret on your computer: `openssl rand -hex 32` (or any 40+ random characters). Keep it; you need it once.
4. In Supabase open **Edge Functions > Secrets** and add:
   - `MPESA_CONSUMER_KEY` = the key
   - `MPESA_CONSUMER_SECRET` = the secret
   - `MPESA_PASSKEY` = the sandbox passkey
   - `MPESA_CALLBACK_SECRET` = the random text from step 3
   - Leave `MPESA_SHORTCODE` **unset**, so the Settings screen controls the shortcode. (If you set it, it overrides the screen.)
5. Deploy the functions (CLI, from the project folder, after `supabase link --project-ref <your-ref>`):
   ```
   supabase functions deploy mpesa-stk-push mpesa-status resolve-login send-email
   supabase functions deploy mpesa-callback sitemap --no-verify-jwt
   ```
   `mpesa-callback` **must** have JWT verification off, because Safaricom calls it without a login.
6. In the app: **Admin > Settings > M-Pesa**. Mode = **Sandbox (testing)**, Business shortcode = `174379`. Click **Save M-Pesa settings**.
7. Test a payment: sign up a test business, choose a plan and pay. In sandbox Safaricom simulates the prompt (it does not go to a real handset), so check the result in **Admin > Transactions**: it should turn Successful and the business becomes active. If it stays Pending, see Troubleshooting.

## Part B. Go live

1. You need a real **Paybill** registered with Safaricom for your company (M-Pesa for Business). Then in Daraja use **Go Live**, pick that shortcode and submit the form. Safaricom approves and gives you the **production Consumer Key and Secret** and the **production Passkey** for that shortcode. This takes days, so start early.
2. In **Edge Functions > Secrets**, replace `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY` with the production values. Replace `MPESA_CALLBACK_SECRET` with a **new** random value (never reuse the sandbox one). No redeploy is needed for a secret change.
3. **Admin > Settings > M-Pesa**: Mode = **Live (real money)**, Business shortcode = your paybill number. Save.
4. Make one real test: temporarily set a plan price to KSh 10 (Admin > Settings > Plans), pay it with your own phone, confirm Admin > Transactions shows it Successful, then put the price back.
5. Tell each business owner to open their own settings and enter their paybill and passkey (rentals: **Settings > M-Pesa for rent**; shops: **Settings > M-Pesa payments**). Until they do, in Live mode rent prompts say "This business has not set up M-Pesa prompts" and shop orders say "This shop has not set up M-Pesa prompts yet"; shoppers can still choose pay on delivery if the shop allows it, and rentals can be recorded by hand. Each business needs its own Daraja Go Live for its own paybill passkey.

You do **not** register a callback address in Daraja: the app sends it with every request (`<project-url>/functions/v1/mpesa-callback?secret=...`).

## Go-live checklist (do the steps in this order)

**0. Put payments in maintenance first.** Admin > Settings > Maintenance > **Level 4: all money handling** > switch on "Block all M-Pesa payments" and save. The server (`mpesa-stk-push`) then refuses every prompt (subscription, rent, order) with a friendly message, so nobody is charged while you change keys. Super admins are not blocked, so you can still test. Level 5 blocks only the subscriptions of the businesses you pick. Switch level 4 off at the end (step 12).

1. **Daraja app.** developer.safaricom.co.ke > My Apps. For live, use **Go Live** with your own Paybill. Safaricom sends the production Consumer Key and Consumer Secret.
2. **Shortcode and passkey.** Your Paybill number and the production passkey for that shortcode (from Safaricom after approval; for the sandbox it is `174379` and the passkey on the M-Pesa Express page).
3. **Secrets** (Supabase > Edge Functions > Secrets):
   | Secret | Used by | Note |
   |---|---|---|
   | `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET` | stk-push, reconcile | production values for live |
   | `MPESA_PASSKEY` | stk-push, reconcile | production passkey |
   | `MPESA_CALLBACK_SECRET` | stk-push, callback | new random value, `openssl rand -hex 32` |
   | `CRON_SECRET` | reconcile, purge | must exist before scheduling |
   | `MPESA_SHORTCODE` | stk-push, reconcile | leave unset so Admin > Settings > M-Pesa decides |
   | `ALLOWED_ORIGINS` | browser-facing functions | your site origin(s), comma separated |
4. **Callback URL with its secret.** You do not register it in Daraja. Every prompt sends `<project-url>/functions/v1/mpesa-callback?secret=<MPESA_CALLBACK_SECRET>`. Deploy `mpesa-callback` with `--no-verify-jwt`. If you change `MPESA_CALLBACK_SECRET` while a prompt is open, that prompt's callback is refused with 403 and `mpesa-reconcile` settles it.
5. **Deploy:** `supabase functions deploy mpesa-stk-push mpesa-status` and `supabase functions deploy mpesa-callback mpesa-reconcile --no-verify-jwt`.
6. **Schedule `mpesa-reconcile` every 2 minutes** with pg_cron and pg_net (the exact SQL is in `docs/reports/part-03-report.md`, section "Scheduling mpesa-reconcile every 2 minutes"; it sends the `x-cron-secret` header). Check: `select * from cron.job_run_details order by start_time desc limit 5;`. Test once by hand: `curl -X POST -H "x-cron-secret: YOUR_CRON_SECRET" https://YOUR-PROJECT-REF.supabase.co/functions/v1/mpesa-reconcile` should answer JSON with `checked`, `paid`, `cancelled`, `failed`, `pending`.
7. **Platform settings:** Admin > Settings > M-Pesa: Mode = **Live (real money)**, Business shortcode = your Paybill. Save. (The `platform_settings` row with key `mpesa` and `env` = `live`.)
8. **Sandbox run first** (Mode = Sandbox) with the five cases below. Every case must end as described.
9. **Live run:** set one plan to KSh 10, pay with your own phone, check Admin > Transactions says Successful and the business is active, then restore the price.
10. Tell each business owner to enter their own Paybill and passkey (see Part B step 5).
11. Confirm `/admin/errors` shows no new `mpesa-` entries.
12. **Switch Level 4 off.** Make one more payment as a normal (non-admin) owner to prove prompts work for everyone.

### The five sandbox cases
| Case | What you do | Expected result |
|---|---|---|
| Success | Pay and enter the PIN | Screen shows "Payment confirmed", then the approval step; Transactions: Successful |
| Wrong PIN | Enter a wrong PIN on the prompt | Screen shows "Payment not completed" with Safaricom's reason; Transactions: Failed |
| Cancel | Dismiss the prompt | "Payment cancelled", nothing charged; Transactions: Failed (cancelled) |
| Timeout | Do not answer | After about 2 minutes "No answer yet" with a Check again button; `mpesa-reconcile` settles it within a few minutes |
| Double tap | Tap "Pay" twice quickly, or open the page in two tabs | Only one prompt arrives; the second request returns the same payment with "A payment prompt was sent a moment ago" (no second row stays pending) |

On the subscribe screen, a prompt that has been waiting for 90 seconds shows "Still waiting" and a **Check again** button.

## Limits to know
- Prompts use **Paybill** (`CustomerPayBillOnline`). A **Till** (Buy Goods) number is not supported for prompts yet; a business with only a till should use pay on delivery or manual recording. The forms say "paybill or till" but only a paybill will actually send prompts.
- A payment whose amount differs from the amount requested is marked **failed** ("Amount mismatch") and does not activate anything. Refund the customer through M-Pesa.

## Troubleshooting
| You see | Cause and fix |
|---|---|
| "M-Pesa is not set up on this server yet" | One of the four secrets is missing, so add `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_CALLBACK_SECRET`. |
| "Safaricom rejected the credentials" | Wrong key/secret, or sandbox keys while Mode is Live (or the reverse). |
| Payment stays **Pending** | The callback did not arrive or was refused: check `mpesa-callback` was deployed with `--no-verify-jwt`; check Supabase > Edge Functions > Logs > `mpesa-callback`; a 401/403 means `MPESA_CALLBACK_SECRET` was changed after the request started. Try again. |
| Failed with "Amount mismatch" | Paid amount differed from the amount asked. Refund and retry. |
| "You cannot pay for this business" | Only the business owner can pay its subscription. |
| Too many prompts (429) | More than 3 in a minute from one account. Wait a minute. |
| "Payments are paused for a short while" | Maintenance Level 4 (or Level 5 for this business) is on in Admin > Settings > Maintenance. Switch it off when setup is done. |
| "A payment prompt was sent a moment ago" | The duplicate-prompt block: the same user, purpose, reference and amount already has a pending prompt from the last 2 minutes. Wait for it, or press Check again. |
