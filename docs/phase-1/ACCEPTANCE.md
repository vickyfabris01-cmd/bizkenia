# Phase 1 acceptance script
Check at 375px and desktop, light and dark.
1. `/` loads; Explore lists active businesses; a business page opens; Pricing shows plans; static pages open; unknown URL shows 404.
2. Theme toggle cycles light/dark/system and persists.
3. Sign up with email → confirm screen. Sign up with phone + password → signed in without SMS.
4. Log in with phone `0711000001` / `Demo#1234`, and with owner.active@example.com. Wrong password shows an error.
5. Forgot password page sends a reset; reset page sets a new one.
6. Google button starts OAuth (needs setup).
7. My businesses lists Sunrise, Greenview; Open goes to `/app/sunrise-apartments`; checklist shows progress; menu hides owner-only items for managers.
8. Every menu item opens (placeholders show their phase). Mobile: bottom tabs + More.
9. Log in as visitor → Start a business → type (Agriculture/Shop "Coming soon") → details → subscribe: STK prompt, or admin records payment.
10. Pending business shows status page; rejected shows reason and Resubmit.
11. Super admin: dashboard counts, Businesses list/detail, approve/reject/suspend/reinstate, record payment, Users, Settings changes persist and appear on the site.
12. Non-admin visiting `/admin` is redirected; non-member visiting `/app/<slug>` is blocked.
