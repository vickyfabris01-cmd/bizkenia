// src/lib/geo.js — NEW FILE
//
// AIM
// Small map maths with no libraries: the area of a polygon drawn on a map (in hectares), its
// centre, and GeoJSON helpers. Used by components/map/FieldMap.jsx and the field screens.
//
// Points are [lat, lng] pairs in the app; GeoJSON stores [lng, lat]. toGeoJson / fromGeoJson
// convert between the two so no screen has to remember the order.
//
//   const ha = polygonAreaHa(points);            // 1.2345
//   const boundary = toGeoJson(points);          // { type: "Polygon", coordinates: [[[lng, lat], ...]] }
//   const points = fromGeoJson(boundary);        // [[lat, lng], ...]

const R = 6371007.2; // mean earth radius in metres (the authalic radius, which keeps area errors under 0.5 percent in Kenya)
const rad = (d) => (d * Math.PI) / 180;

/** Area of a polygon in square metres, by the spherical excess method (accurate for farm-sized shapes). */
export function polygonAreaM2(points) {
  const n = points.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[(i + 1) % n];
    sum += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((sum * R * R) / 2);
}

/** Area in hectares, rounded to 4 decimals (1 hectare = 10,000 square metres). */
export function polygonAreaHa(points) {
  return Math.round((polygonAreaM2(points) / 10000) * 10000) / 10000;
}

export function polygonCentre(points) {
  if (!points.length) return null;
  const lat = points.reduce((s, p) => s + p[0], 0) / points.length;
  const lng = points.reduce((s, p) => s + p[1], 0) / points.length;
  return [lat, lng];
}

/** [[lat, lng], ...] -> GeoJSON Polygon geometry (ring closed). Needs at least 3 points, else null. */
export function toGeoJson(points) {
  if (!points || points.length < 3) return null;
  const ring = points.map(([lat, lng]) => [Number(lng.toFixed(7)), Number(lat.toFixed(7))]);
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

/** GeoJSON Polygon geometry (or a Feature holding one) -> [[lat, lng], ...] without the closing point. */
export function fromGeoJson(g) {
  const geom = g?.type === "Feature" ? g.geometry : g;
  const ring = geom?.type === "Polygon" ? geom.coordinates?.[0] : null;
  if (!Array.isArray(ring) || ring.length < 4) return [];
  const pts = ring.map(([lng, lat]) => [lat, lng]);
  const first = pts[0], last = pts[pts.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) pts.pop();
  return pts;
}

/** Hectares with sensible digits: 0.4 ha, 12.35 ha. */
export function formatHa(ha) {
  const n = Number(ha) || 0;
  return `${n.toLocaleString("en-KE", { maximumFractionDigits: n < 10 ? 2 : 1 })} ha`;
}
