ROOM TYPES v3: kinds, Hostel toggle, automatic names

1. Database (Supabase SQL editor, or `supabase db push`), in this order:
   - 20261020100006_room_types.sql  (you already renamed it from ...100001)
   - 20261020100007_room_type_listings.sql   (if not run yet)
   - 20261020100008_room_kinds_and_hostel.sql   (NEW, in this zip)
   100008 maps old kinds (bedsitter/studio -> Bed seater, double/dormitory -> Single room,
   suite -> One bedroom), renames existing room types by the new rule ("Single room",
   "Single room (1)"), and clears semester rent on non-hostel types.
2. Copy the files in src/ over your project (same paths).
3. Hostel ON = People it sleeps + Semester rent. OFF = Monthly rent only.
   A type's hostel setting is locked while any of its rooms is occupied or reserved.
