# Brand studio: drawn logos and avatars

## What it does
Every business gets a designed logo and every person a designed avatar. Nothing is stored as a
picture. A small **recipe** is saved and the picture is **drawn in the browser** whenever it is shown,
so it appears instantly, even on a slow connection or offline.

| | Recipe (saved) | Where |
|---|---|---|
| Business logo | `{"v":1,"s":style 0-9,"i":symbol 0-7,"p":palette 0-11}` | `businesses.logo_design` |
| Person avatar | `{"v":1,"s":style 0-2,"p":palette 0-11,"b":pattern 0-3}` | `profiles.avatar_design` |

An **uploaded** picture (`logo_url`, `avatar_url`) always shows first. The drawn picture sits underneath,
so a slow upload fades in over it and a failed upload falls back to it.

## Business types and symbols
Rental, agriculture and shop have 8 symbols each (house, apartments, bungalow, townhouses, high-rise,
key, door, compound / leaf, tree, tractor, jembe, maize, seedling, cow, field / bag, trolley, kiosk,
basket, price tag, storefront, parcel, scale). Any other type uses a neutral star set, so a logo is
always drawn.

10 styles x 8 symbols x 12 palettes = 960 looks per type. Styles: Signature, Monogram, Heritage seal,
Modern geometry, Growth mark, Minimal stamp, Inscribed (initial written on the symbol), Knock-out
(initial cut out of it), Watermark, Two-tone.

## Where it appears
- **Create a business** (`/start/details`): six designs under the form, the first already chosen, or upload your own.
- **Sign up**: six avatars under the password; saved on first sign-in (the person is not signed in yet when email confirmation is on).
- **Settings > Logo** and **My account**: change the design, upload, remove the upload, download a PNG.
- Everywhere else a logo or avatar shows: `BusinessLogo` and `Avatar` draw it.

## Rows with nothing saved
No backfill. The design is worked out from the row's `id`, so it is stable and different for different rows
(about 900 distinct looks per type; no look is used by more than about 0.5% of businesses).

> **The derive pool is frozen as "v1".** `deriveLogoDesign` and `deriveAvatarDesign` use fixed sizes
> (10 styles, 8 symbols, 12 palettes). New styles, symbols or palettes may be added at the END of the lists
> and shown in the picker, but must never change what an id derives, or existing logos would shift.
> Never reorder or remove entries in `palettes.js`, `styles.js` or `icons/*.js`.

## Files
- `src/lib/brandStudio/`: `svgKit.js`, `palettes.js`, `icons/` (3 types + generic), `styles.js`, `designs.js` (recipes, defaults, picker choices), `render.js` (drawing), `download.js` (optional PNG), `index.js`.
- `src/components/brand/`: `BusinessLogo`, `LogoPicker`, `AvatarPicker`, `BrandPicker.css`.
- `supabase/migrations/20261025100001_brand_designs.sql`: two columns, size checks, and `my_conversations` returns the other person's avatar recipe.

## Deploy
1. `npx supabase db push` (the migration first: the new app asks for the new columns).
2. Deploy the app.

## Not included (on purpose)
Link previews (WhatsApp, Facebook) do not show these logos: the app's WhatsApp share is text only, and
crawlers cannot see browser-drawn pictures. If a logo is ever needed as a real image for previews, add a
Worker route that draws a PNG from the saved recipe.
