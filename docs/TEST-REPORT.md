# Test report — release 1.0

Date: 2026-10-18. Base commit `8c2d4da`.

## Automated, run in the build session
| Check | Result |
|---|---|
| `vite build` on a clean copy | Pass |
| ESLint | 0 errors, 4 warnings (React hook advice in old pages, limit is 5) |
| Edge functions compile (esbuild) | All 7 pass |
| Every `supabase.rpc(...)` name used in the app exists in the migrations | 79 of 79 |
| Performance budget (`npm run check:budget`) | Pass: first load 126 KB JS / 9 KB CSS gzipped; largest chunk 108 KB |
| Playwright, public pages, desktop + phone (36 tests, 3 consecutive runs) | 36 pass, 0 fail, 14 skipped (see below) |
| axe WCAG 2 A/AA on home, explore, login, signup, forgot-password, both screen sizes | No serious or critical violations after one fix (link colour contrast) |
| No sideways scrolling on a phone for the same pages | Pass |
| Installable app: manifest, icons, service worker, offline page, offline reopen | Pass |
| Signed-out visitors are redirected from `/app`, `/admin`, `/orders` | Pass |
| `noindex` on private and unknown pages, canonical on public | Pass |
| Theme follows the device when nothing is saved | Pass |
| Database hardening (`p5_08`, `p5_09`) in a scratch PostgreSQL 16 with stand-in tables: visitors cannot write; visitors and signed-in users cannot call internal/payment functions; the allowed public functions still run; the error log limits and super-admin-only reading hold | Pass |
| Phase 5 step 2 migrations (orders, payment, cancel) in the same scratch database | Pass (earlier delivery) |

## Not run, and why
- **Journeys against a live backend** (`e2e/journeys.spec.js`: browse and order as a customer, admin screens, access control) are written but skipped: they need a test Supabase project and test accounts, which the build session does not have. Run them with the `E2E_*` variables (see the file header).
- **Real M-Pesa money movement.** Only code paths and the amount check were reviewed; test with KSh 10 (checklist section 4).
- **Lighthouse** scores, and **screen-reader** and **real-device** testing. The automated rules catch about a third of accessibility problems; do a keyboard-only and phone pass on checkout and the business app before launch.
- **The migrations on the real project.** The scratch database uses stand-in tables because the original baseline cannot be replayed from scratch. Run `p5_08` and `p5_09`, then Supabase > Advisors, and read it.
- **Email, Google sign-in, domain** are configuration, not code: see `docs/GO-LIVE.md`.
