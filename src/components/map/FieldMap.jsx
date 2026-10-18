// src/components/map/FieldMap.jsx — NEW FILE
//
// AIM
// The map used on the farm screens (Phase 4), built on Leaflet. Street and satellite tiles, a
// "my location" button, outlines of fields, and a simple way to DRAW a field boundary by tapping
// the corners on the map. Drag a corner to move it. The area (hectares) is worked out as you draw.
//
// Load it only on the screens that need it, with React.lazy, so the map code is not downloaded
// everywhere else:   const FieldMap = lazy(() => import("../../components/map/FieldMap.jsx"));
//
// PROPS
//   polygons   [{ id, name, boundary }]   outlines to show (GeoJSON Polygon geometry). Optional.
//   selectedId highlights one outline.
//   onSelect(id)  called when an outline is tapped.
//   editable   true: tapping the map adds a corner to `points` and corners can be dragged.
//   points     [[lat, lng], ...] the shape being drawn (editable mode). Parent owns this state.
//   onPointsChange(points)   called with the new list after every add, drag, undo or clear.
//   height     CSS height of the map (default 360px; 55vh is a good phone choice)
//
// TILES
//   Street: OpenStreetMap (fine for development; read its tile usage policy before launch).
//   Satellite: Esri World Imagery by default. Set VITE_SATELLITE_TILE_URL in .env to use another
//   provider for production (use the {z}/{x}/{y} placeholders). See docs/phase-4/README.md.

import "leaflet/dist/leaflet.css";
import "./FieldMap.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { fromGeoJson, polygonAreaHa, formatHa } from "../../lib/geo.js";

const STREET = { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors", maxZoom: 19 };
const SATELLITE = {
  url: import.meta.env.VITE_SATELLITE_TILE_URL || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: import.meta.env.VITE_SATELLITE_ATTRIBUTION || "Imagery © Esri and its data providers",
  maxZoom: 19,
};
const KENYA = [-0.5, 37.8];
// Leaflet needs real colour values, so read them from the design tokens at the moment they are used.
const token = (name, fallback) => (typeof document === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

const vertexIcon = (n) => L.divIcon({ className: "fmap-vertex", html: `<span>${n}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });

export default function FieldMap({ polygons = [], selectedId, onSelect, editable = false, points = [], onPointsChange, height = "360px" }) {
  const box = useRef(null);
  const map = useRef(null);
  const tiles = useRef(null);
  const shapes = useRef(null);   // read-only outlines
  const draft = useRef(null);    // the shape being drawn
  const [mode, setMode] = useState("satellite");
  const [note, setNote] = useState("");
  const live = useRef({});
  live.current = { editable, points, onPointsChange, onSelect };

  // create the map once
  useEffect(() => {
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, tap: true }).setView(KENYA, 6);
    map.current = m;
    shapes.current = L.layerGroup().addTo(m);
    draft.current = L.layerGroup().addTo(m);
    m.on("click", (e) => {
      const c = live.current;
      if (!c.editable) return;
      c.onPointsChange?.([...c.points, [e.latlng.lat, e.latlng.lng]]);
    });
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  // street or satellite
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (tiles.current) m.removeLayer(tiles.current);
    const t = mode === "street" ? STREET : SATELLITE;
    tiles.current = L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom }).addTo(m);
    tiles.current.bringToBack();
  }, [mode]);

  // outlines of existing fields
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    shapes.current.clearLayers();
    const all = [];
    for (const p of polygons) {
      const pts = fromGeoJson(p.boundary);
      if (pts.length < 3) continue;
      all.push(...pts);
      const sel = p.id === selectedId;
      const poly = L.polygon(pts, { color: sel ? token("--color-warning", "orange") : token("--chart-1", "green"), weight: sel ? 4 : 2, fillOpacity: sel ? 0.35 : 0.2 }).addTo(shapes.current);
      if (p.name) poly.bindTooltip(p.name, { sticky: true });
      poly.on("click", (e) => { if (!live.current.editable) { L.DomEvent.stopPropagation(e); live.current.onSelect?.(p.id); } });
    }
    if (all.length && !(editable && points.length)) m.fitBounds(L.latLngBounds(all), { padding: [24, 24], maxZoom: 18 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygons, selectedId]);

  // the shape being drawn
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    draft.current.clearLayers();
    if (!editable) return;
    if (points.length >= 3) L.polygon(points, { color: token("--color-warning", "orange"), weight: 3, fillOpacity: 0.25, interactive: false }).addTo(draft.current);
    else if (points.length === 2) L.polyline(points, { color: token("--color-warning", "orange"), weight: 3, interactive: false }).addTo(draft.current);
    points.forEach((pt, i) => {
      const mk = L.marker(pt, { draggable: true, icon: vertexIcon(i + 1), keyboard: false }).addTo(draft.current);
      mk.on("dragend", () => {
        const c = live.current;
        const ll = mk.getLatLng();
        c.onPointsChange?.(c.points.map((q, j) => (j === i ? [ll.lat, ll.lng] : q)));
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, editable]);

  // when drawing starts with existing points (editing a saved field), fit to them once
  useEffect(() => {
    if (editable && points.length >= 3 && map.current) map.current.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 18 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  function locate() {
    if (!navigator.geolocation) { setNote("Your browser cannot find your location."); return; }
    setNote("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => { map.current?.setView([pos.coords.latitude, pos.coords.longitude], 17); setNote(""); },
      () => setNote("Could not get your location. Allow location access and try again."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const ha = points.length >= 3 ? polygonAreaHa(points) : 0;

  return (
    <div className="fmap">
      <div className="fmap__bar">
        <div className="fmap__seg" role="group" aria-label="Map style">
          <button type="button" className="fmap__btn" aria-pressed={mode === "satellite"} onClick={() => setMode("satellite")}>Satellite</button>
          <button type="button" className="fmap__btn" aria-pressed={mode === "street"} onClick={() => setMode("street")}>Street</button>
        </div>
        <button type="button" className="fmap__btn" onClick={locate}>My location</button>
        {editable && (
          <>
            <button type="button" className="fmap__btn" disabled={!points.length} onClick={() => onPointsChange?.(points.slice(0, -1))}>Undo</button>
            <button type="button" className="fmap__btn" disabled={!points.length} onClick={() => onPointsChange?.([])}>Clear</button>
          </>
        )}
      </div>
      <div ref={box} className="fmap__canvas" style={{ height }} role="application" aria-label="Map of the farm" />
      {editable && (
        <p className="fmap__hint" aria-live="polite">
          {points.length < 3
            ? `Tap each corner of the field on the map. ${3 - points.length} more corner${3 - points.length === 1 ? "" : "s"} needed.`
            : `${points.length} corners · ${formatHa(ha)}. Drag a corner to adjust it.`}
        </p>
      )}
      {note && <p className="fmap__hint" role="status">{note}</p>}
    </div>
  );
}
