ITEM PAGES + MATCHING CARDS (no database change, nothing to run in Supabase)

Copy every file in src/ over your project (same paths). New files: VisitBusiness.jsx,
ProduceDetailPage.jsx, RoomTypePage.jsx.

- Product, produce and room cards open their own item page:
    /b/:slug/p/:id (shop product, existed), /b/:slug/produce/:id (new), /b/:slug/room/:id (new)
  Each item page has a "Visit shop / farm / business" card linking to the business page.
- Farm produce is bought by WhatsApp, call or email (the farm has no cart): the WhatsApp button
  carries the item name and price in the message.
- Business cards now use the same columns, size and text as product cards: 5 across on desktop
  (4 at 900px, 3 at 640px), about 2.3 in view on phones. Home shows 5 businesses per type, Explore 10.
