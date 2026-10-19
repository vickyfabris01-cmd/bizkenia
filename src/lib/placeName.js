// src/lib/placeName.js — NEW FILE
//
// AIM
// Suggests a name for a field from where it is on the map ("Kibos, Kisumu"), so the farmer does
// not have to type one. The farmer can always change it. Uses reverse geocoding (OpenStreetMap
// Nominatim by default) at street-level detail, then builds the name from the most local place
// it knows (named land, hamlet, neighbourhood, suburb, village, road, town) plus the county.
//
// Never throws: if the lookup fails or is cancelled it returns null and the form simply stays
// as it was.
//
// PRODUCTION
//   The public Nominatim server allows light use only (about one request a second, with the
//   caller identified by its browser Referer). The field form waits a moment after the last map
//   tap before asking, and answers are cached. For a busy launch set VITE_REVERSE_GEOCODE_URL in
//   .env to your own or a paid geocoder that answers in Nominatim's JSON shape, using {lat} and
//   {lon} placeholders, e.g. https://geo.example.com/reverse?format=jsonv2&lat={lat}&lon={lon}
//
//   const place = await suggestFieldName([lat, lng], { signal });   // "Kibos, Kisumu" | null
//   const name = uniqueName(place, ["Kibos, Kisumu"]);              // "Kibos, Kisumu 2"

const URL_TEMPLATE = import.meta.env.VITE_REVERSE_GEOCODE_URL
  || "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=en&lat={lat}&lon={lon}";

// most local first
const LOCAL_KEYS = ["hamlet", "isolated_dwelling", "neighbourhood", "quarter", "suburb", "village", "locality", "road", "town", "city_district", "city", "municipality"];
const cache = new Map();

const clean = (s) => String(s || "").replace(/\s+County$/i, "").trim();

/** Builds "Local place, County" from a Nominatim reverse-geocode answer. Empty string when nothing usable. */
export function placeNameFrom(data) {
  const a = data?.address;
  if (!a) return "";
  // a named piece of land (a farm, farmland, orchard…) is the most precise label there is
  let local = data.category === "landuse" && data.name ? String(data.name).trim() : "";
  if (!local) for (const k of LOCAL_KEYS) if (a[k]) { local = String(a[k]).trim(); break; }
  const area = clean(a.county || a.state_district || a.state);
  if (local && area && local.toLowerCase() !== area.toLowerCase()) return `${local}, ${area}`;
  return local || area;
}

/** [lat, lng] -> suggested field name, or null. */
export async function suggestFieldName([lat, lng], { signal } = {}) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`; // about 11 m: dragging a corner a little does not ask again
  if (cache.has(key)) return cache.get(key);
  try {
    const url = URL_TEMPLATE.replace("{lat}", lat.toFixed(6)).replace("{lon}", lng.toFixed(6));
    const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const name = placeNameFrom(await res.json());
    if (name) cache.set(key, name);
    return name || null;
  } catch {
    return null;
  }
}

/** Adds " 2", " 3"… when a field with that name already exists (names are unique per farm). */
export function uniqueName(base, taken = []) {
  const used = new Set(taken.map((n) => String(n || "").trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let i = 2;
  while (used.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}
