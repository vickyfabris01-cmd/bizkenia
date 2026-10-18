# BizKenia

One platform for Kenyan small businesses: **rental properties**, **online shops** and **farms**. Owners run their business in the app; customers find and buy from them on the public site; the platform owner manages subscriptions, payments and support. Payments by M-Pesa.

Stack: React 18 + Vite, react-router, zustand, Supabase (Postgres with row-level security, Auth, Storage, Edge Functions).

## Run it
```
cp .env.example .env.local      # fill in the Supabase URL and anon key
npm ci
npm run dev                     # http://localhost:5173
```

| Command | Does |
|---|---|
| `npm run build` / `npm run preview` | Production build / serve it |
| `npm run lint` | ESLint |
| `npm run check:budget` | Fails if the first-load download gets too big (run after build) |
| `npm run test:e2e` | Playwright tests (builds and serves the site itself); first time: `npx playwright install chromium` |

## Layout
- `src/modules/` each business type (rental, agriculture, shop) and the admin menu; `src/pages/` screens; `src/lib/api/` all database calls.
- `supabase/migrations/` run in filename order; `supabase/functions/` edge functions; `supabase/seed/` demo data (development only).
- `public/` manifest, icons, service worker, robots.txt. `e2e/` end-to-end tests. `docs/` everything else.

## Launching
Read [docs/GO-LIVE.md](docs/GO-LIVE.md), then [docs/phase-5/STEP-4.md](docs/phase-5/STEP-4.md). All docs are indexed in [docs/README.md](docs/README.md).
