# Phase 4 — Agriculture and reports

Built on commit `ef90d5f` ("cover upload settings"), the latest main when this zip was made. If main has moved since, compare the 6 changed files listed under Files before copying. Everything here was built and checked against the live schema of the dev project.

## What this phase adds

| Area | What you get |
|---|---|
| Agriculture module | Navigation and 10 screens for a farm business: dashboard, crops, fields and land (map), inventory, livestock, income and expenses, tasks, analytics, reports, settings |
| Reports | `/app/:slug/reports` for rental owners (financial summary, occupancy, billing overview, worker costs) and farm owners (income and cost, yield by crop, cost breakdown). Every tab has a chart, a table and a **Download CSV** button |
| Reusable parts | `components/map/FieldMap.jsx`, `components/charts/{LineTrend,BarCompare,DonutBreakdown}.jsx`, `lib/csv.js`, `lib/geo.js` |
| Database | 6 migrations, seed, RLS tests |

Agriculture is now open in onboarding (`/start`), and the Agriculture switch in Admin > Settings starts **on**.

## Install, in this order

1. Copy the files from the zip into the repo (same folder names).
2. `npm install` (adds `leaflet`).
3. Run the SQL files **one at a time, in order**, in the Supabase SQL Editor (each needs only a click on Run):
   `20261016100001_p4_01_farm_core.sql` → `…02_farm_stock` → `…03_farm_money_tasks` → `…04_farm_rls` → `…05_report_views` → `…06_enable_agriculture`
4. Dev projects only: run `supabase/seed/p4.sql`, then `supabase/tests/p4_rls_tests.sql` (it rolls itself back and ends with `ALL PHASE 4 CHECKS PASSED`).
5. `npm run dev`.

Demo account (dev only): `farmer.demo@example.com` / `Demo#1234` — owner of "Wanjiku Green Acres".

## How the pieces work

- **Fields**: tap the corners of a field on the map. The area in hectares is worked out in `lib/geo.js` (spherical area on the mean earth radius; within 0.5% of a survey figure in Kenya, well inside the 1% target). The boundary is saved as GeoJSON in `farm_fields.boundary`.
- **Stock and head counts** change only through `record_stock_movement` and `record_livestock_event`. A guard trigger blocks hand edits, stock cannot go below zero, and a livestock sale with a price also records farm income.
- **Same-business guard**: a trigger refuses a crop, activity, harvest, task, income or expense that points at another business's field or crop.
- **Reports** read the `report_*` views (`security_invoker`, so row-level security still applies). Rental report tabs are owner-only, as in the plan.
- **Task reminders**: `remind_farm_tasks` sends one in-app notification per due or overdue task per day, when staff open the dashboard or Tasks.
- **Lists are paged** (income and expenses load 25 at a time) and the map code is a separate download that loads only on the Fields screens.

## Map tiles (decision needed before launch)

- Street tiles: OpenStreetMap. Fine for development. Before launch read its tile usage policy; heavy traffic needs a tile provider.
- Satellite tiles: Esri World Imagery by default. For production choose a provider and set
  `VITE_SATELLITE_TILE_URL` (with `{z}/{x}/{y}`) and `VITE_SATELLITE_ATTRIBUTION` in `.env`. No code change is needed.

## Reusing the shared parts (Phase 5)

```jsx
import LineTrend from "../../components/charts/LineTrend.jsx";   // series over time
import BarCompare from "../../components/charts/BarCompare.jsx"; // side by side, layout="horizontal", stacked
import DonutBreakdown from "../../components/charts/DonutBreakdown.jsx"; // shares, with a legend
import { downloadCsv } from "../../lib/csv.js";
const FieldMap = lazy(() => import("../../components/map/FieldMap.jsx")); // load only where used
```
All take plain arrays, take colours from the chart tokens, and show an empty message when there is no data.
`downloadCsv(filename, rows, [{ key, label, value? }])` makes a UTF-8 file that opens in Excel and Sheets.

## Acceptance test script (browser)

1. Sign up, open `/start`, choose **Agriculture**, fill the details, pay/approve (as the super admin). The business menu is the farm menu.
2. Fields > Add a field: tap four corners on the satellite map. The area appears. Compare with a reference (a known 100 m × 50 m plot is 0.5 ha).
3. Crops > Add a crop to that field. Open it: Record work (planting, then fertilising) and Record harvest. Dashboard: "Harvested this year" and "Active plots" change.
4. Inventory: add DAP with quantity 40 and reorder level 100 — it shows **Low stock**. Update stock: "Stock out" more than you have is refused.
5. Livestock: add a group, record a vaccination — it appears in Recent events and on the dashboard.
6. Money: add income and an expense. Dashboard income against cost updates.
7. Tasks: add a task due today — it is shown in red and the owner gets a notification.
8. Reports: as the rental owner (`owner.active@example.com`) and as the farm owner. Download a CSV from each and open it in a spreadsheet.
9. Check 375, 768 and 1280 px in light and dark. On a phone the map pans with one finger and adds a corner with a tap.

## Files

New: `src/modules/agriculture/index.js`, `src/pages/farm/*` (10 screens + `shared.jsx` + `Farm.css`), `src/pages/reports/*`, `src/components/map/*`, `src/components/charts/{ChartParts,LineTrend,BarCompare,DonutBreakdown}.jsx` + `Charts.css`, `src/lib/{geo,csv}.js`, `src/lib/api/{farm,reports}.js`, 6 migrations, `supabase/seed/p4.sql`, `supabase/tests/p4_rls_tests.sql`.
Changed: `src/modules/index.js`, `src/modules/rental/index.js` (Reports screen, owner only; agriculture stub removed), `src/components/charts/index.js`, `src/config/counties.js` (agriculture open), `src/pages/admin/AdminSettings.jsx` (label), `package.json` and `package-lock.json` (leaflet).

## Known limits

- Managers cannot yet be invited to a farm: the invite screen belongs to the rental module and modules may not import each other. Moving it to a shared place is a small follow-up.
- Reports cover the last 12 months for money and all time for yield and cost breakdown.
- Photos for fields and crops are not part of this phase.
