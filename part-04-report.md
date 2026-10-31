# Part 4: Notification panel on mobile (BizKenia)

## Base
- Base commit: `e6b67ddf77e777a324e7c7c2e0cae85a2275a8a0` ("share rework", main at the time I cloned).
- The brief had `<PASTE HASH>` unfilled; I followed the last line ("from the current commit") and used main's HEAD. Please confirm that is the commit you meant. If main has moved since, tell me; I did not rebase.

## Files
NEW: none.

MODIFIED:
- `src/components/notifications/NotificationBell.jsx`
- `src/components/notifications/Notifications.css`
- `src/pages/notifications/NotificationsPage.jsx`  (added at your request, see Part 4b below; it is outside the two files the brief listed, so please confirm it does not clash with other parts)

No deleted or moved files, so no `git rm` / `git mv`. `Shell.css`, `TopBar.jsx` and the sharing files were not touched. `Notifications.css` is edited in two places (panel rules, and the `.nc-filters` rule).

## Cause
`.nc-panel` was `position: absolute; right: 0` and up to 360px wide, inside `.nc-bell` (the 44px bell). The bell sits left of the user avatar, so on a 360px screen the panel's left edge landed at x = -48px (x = -19px at 414px). Part of every row was cut off.

## What changed
Notifications.css
- `.nc-panel`: `max-width: calc(100vw - 16px)` (width cap now 16px, was 24px); now a flex column with a `max-height` (`100dvh` with `100vh` fallback) so it cannot outgrow the screen on short landscape phones.
- New `@media (max-width: 520px)` block: the panel becomes `position: fixed`, anchored `left`/`right` 8px (respecting safe-area insets), full width, just under the header, with `max-height` that stops above the phone tab bar (`--tabbar-h` + `--safe-bottom`). The list scrolls inside the panel (`max-height: none; flex: 1 1 auto`).
- `.nc-panel__list`: `min-height: 0; overscroll-behavior: contain` so scrolling the list does not scroll the page behind.
- Long text: rows use `grid-template-columns: minmax(0, 1fr)`; title and body get `overflow-wrap: anywhere`; title clamped to 2 lines, body to 3 (full text is on /notifications).
- Only theme variables are used. No new colours.

NotificationBell.jsx
- Added `useLayoutEffect` to the react import, a `panel` ref, and one effect that, while the panel is open, sets the CSS variable `--nc-top` on the panel to the header's bottom edge + 6px (re-measured on resize/rotate). The header is found with `closest("header")`, which matches both `.shell-topbar` and `.site-header`; falls back to the bell itself. The CSS has its own fallback if the variable is missing.
- `ref={panel}` on the panel div. Nothing else: no new props, exports or signatures changed.

Why not a bottom sheet: `.shell-tabbar` is `z-index: var(--z-nav)` (200) and the topbar is `var(--z-sticky)` (100), so a sheet inside the topbar would be drawn behind the tab bar. A full-width panel under the header, stopped above the tab bar, keeps natural keyboard/tab order with no portal or focus trap.

Breakpoint: I used 520px rather than 480px. Between 481 and ~520px the 360px dropdown could still just touch the left edge, so the phone layout covers it. Easy to change in one place.

## Sections other parts may edit
None of the changed blocks are in `Shell.css` or `TopBar.jsx`. In the two files above: `.nc-panel`, `.nc-panel__list` (and its `button`, `strong`, `span` rules) and the new `@media (max-width: 520px)` block in `Notifications.css`; the new effect and ref in `NotificationBell.jsx`.

## Migrations, deploy, env vars
- Migrations: none. Env vars: none. Deploy: normal front-end build and deploy (`npm run build`). No worker or Supabase change.

## Test evidence
Method: a throwaway harness outside the repo renders the real `TopBar` (with `bellTo="live"`), real `NotificationBell`, `Shell.css` and tokens, with the API calls mocked (6 notifications incl. a very long title, a 120-character unbroken word, unread and read rows) and a fake tab bar. Headless Chromium, 2x scale.

Panel position (px, before -> after):
| Viewport | Before left..right | After left..right | Panel bottom vs tab bar top |
|---|---|---|---|
| 320 | -48..248 | 8..312 | 568 vs 576 |
| 360 | -48..288 | 8..352 | 568 vs 576 |
| 414 | -19..341 | 8..406 | 728 vs 736 |
| 360 dark | -48..288 | 8..352 | 568 vs 576 |
| 600 | 160..520 | 160..520 (unchanged) | n/a |
| 1280 | 748..1108 | 748..1108 (unchanged) | n/a |
No horizontal page scroll at any width; no page errors.

Screenshots (separate files next to this report):
- `part-04-before-360.png`, `part-04-after-360.png` (required)
- `part-04-after-320.png`, `part-04-after-414.png`, `part-04-after-360-dark.png`

Checks, run in a fresh clone at the base commit after `unzip -o` of the zip (git status showed only the two files modified):
- `npm run build`: passes ("built in 16.08s").
- `npm run check:budget`: PASS. First-load JS 134.4 KB gzip (limit 200), CSS 10.5 KB (limit 40), largest chunk 108.2 KB (limit 130).
- `npm run test:worker`: 7 tests, 7 pass, 0 fail.
- `npm run lint`: **fails at the base commit too, unrelated to this change**: `eslint src --ext ...` is rejected because `eslint.config.js` uses the flat config (error "Invalid option '--ext'"). Running `npx eslint` directly on the file also fails at the base, because the config imports `eslint/config` and installed ESLint is 8.57.1. I did not touch lint config (out of scope). Suggest a separate fix.
- `unzip -l`: 2 entries, relative paths from repo root, no wrapper folder, no extra files.
- Changed files: LF endings, UTF-8, no BOM, no emoji, no new icons (none needed).

## Not tested / assumptions
- Real devices and real iOS Safari (dynamic toolbar, notch) were not available; safe-area insets are handled in CSS but not seen on hardware.
- Only the app shell top bar was rendered in the harness. The public header uses the same component and is a `<header>` too, but I did not screenshot it. The panel will leave an unneeded ~64px gap above the bottom there, since there is no tab bar.
- Data was mocked; real notification content may be longer. Clamping and wrapping cover that.
- Touch-scrolling inside the list was not tried by hand; it uses plain `overflow-y: auto`.

## Rollback
Restore the two files from the base commit: `git checkout e6b67ddf77e777a324e7c7c2e0cae85a2275a8a0 -- src/components/notifications/NotificationBell.jsx src/components/notifications/Notifications.css`

---
# Part 4b: Notifications page filters (follow-up request)

Request: the row of filter chips on /notifications is slow on mobile; replace with a clean dropdown, All as default, sectioned so a person who owns two or more businesses does not see them mixed.

## What changed (NotificationsPage.jsx, plus `.nc-filters` / new `.nc-filter` rules in Notifications.css)
- Chips removed. Two native dropdowns (touch and screen-reader friendly, labelled, 44px controls from the existing `ui-control` styles, chevron from `Icon.jsx`):
  1. **Business** appears only when the notifications come from 2 or more businesses. Options: All my businesses (default), each business by name, and "General (not tied to a business)" when such notifications exist (account and system alerts), so they never become unreachable.
  2. **Show**: All (default), Unread (n), then topics in sections via `<optgroup>`: Property and rent (Rent and payments, Complaints, Announcements, Requests and moves), Messages and help (Messages, Help desk), Work (Work and pay). Only topics that currently have notifications in the chosen business are listed, with counts, so the list stays short. The selected topic stays listed even if it empties.
- Choosing a business scopes everything: the list, the Unread count and the topic counts.
- "Mark all read" now respects the filter: with no filter it calls the existing `markAllRead()`; with a business or topic chosen the label becomes "Mark these read" and only the visible unread items are marked (via the existing `markNotificationRead`), so one business's alerts are not cleared by accident. The button is disabled when nothing visible is unread.
- Empty-state title: "Nothing here yet" only when unfiltered.
- No API, SQL or `people.js` change: businesses are grouped by the `tenant_id` and `business.name` already returned by `listNotifications`. `CATEGORIES` export, preferences card and all other behaviour are unchanged.
- Layout: dropdowns sit side by side from ~520px up and stack full width below it; the button goes full width on phones.

## Tests
- Same checks as above, re-run in a fresh clone after `unzip -o` of the 3-file zip: `npm run build` passes, `check:budget` PASS (JS 134.4 KB, CSS 10.6 KB), `test:worker` 7/7. `npm run lint` still fails at base (unrelated, see above).
- Harness (mocked data: 6 notifications from "Admin Farm", "Fab Plaza Rentals" and one with no business): business list correct; choosing Fab Plaza Rentals showed only its 3 items and the topic list shrank to its 3 topics; choosing Rent and payments showed 1 item and the button read "Mark these read". No horizontal scroll at 360px or 1100px, no page errors.
- Screenshots: `part-04b-notifications-page-360.png` (default, then filtered), `part-04b-notifications-page-1100.png`.

## Assumptions / not tested
- "Business type" is interpreted as "business" (each owned business). If you meant grouping by kind of business (farm vs rental), tell me.
- Topic sections are my grouping; easy to rename or regroup in `FILTER_GROUPS`.
- Not tested against real Supabase data or on a real phone's native dropdown picker. The harness did not load the page-title CSS, so the tight gap under the title in the screenshot is not real.
- If `tenant_id` is not the business id for some rows, those rows fall back to grouping by business name.

## Rollback
`git checkout e6b67ddf77e777a324e7c7c2e0cae85a2275a8a0 -- src/pages/notifications/NotificationsPage.jsx` (and the two notification component files as above).
