ROOM TYPES UPDATE v2  (built on your latest main, commit 16865c4 "fix plans")
Copy the folders in this zip over your project. Do not commit this README.

0) git pull first. If anything was pushed after "fix plans", re-check these 3 files for conflicts:
   src/pages/public/BusinessPage.jsx, src/pages/public/HomePage.jsx, src/lib/api/market.js

1) FIX A DUPLICATE MIGRATION VERSION. Two migrations in your repo share version 20261020100001
   (p5_10_shop_is_live_anon and room_types), which breaks "supabase db push". Rename the room types one:

       git mv supabase/migrations/20261020100001_room_types.sql supabase/migrations/20261020100006_room_types.sql

   It is the same SQL. Nothing needs re-running if you already ran it in the SQL editor.

2) ONLY IF YOU HAVE NOT DONE THESE YET, in the Supabase SQL editor, in this order:
   a) delete from rooms;  delete from buildings;      (clears all existing rooms and buildings)
   b) run supabase/migrations/20261020100006_room_types.sql

3) Supabase SQL editor: run the NEW file in this zip:
       supabase/migrations/20261020100007_room_type_listings.sql
   It makes the home page and the Shop & Rent page show ONE card per room type
   ("90 available") instead of one card per room.

4) Copy these app files into the project, keeping the paths:
       src/lib/api/rental.js                 (changed)
       src/lib/api/market.js                 (changed: room cards say "N available")
       src/pages/rental/PropertiesPage.jsx   (changed)
       src/pages/rental/RoomTypes.css        (NEW)
       src/pages/rental/RequestRoomPage.jsx  (changed)
       src/pages/rental/RequestsPage.jsx     (changed)
       src/pages/rental/MyRequestsPage.jsx   (changed)
       src/pages/rental/SettingsPage.jsx     (changed)
       src/pages/public/BusinessPage.jsx     (changed: room types; your farm produce section is kept)
       src/pages/public/HomePage.jsx         (changed: room card)

5) Deploy steps 3 and 4 together.
