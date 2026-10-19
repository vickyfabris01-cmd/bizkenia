// src/components/map/FieldMap.jsx — MODIFIED (acres, fly-in animation)
//
// AIM
// The map used on the farm screens (Phase 4), built on Leaflet. Street and satellite tiles, a
// "my location" button, outlines of fields, and a simple way to DRAW a field boundary by tapping
// the corners on the map. Drag a corner to move it. The area (in acres) is worked out as you draw.
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
// FLY-IN
//   When a plot is selected (selectedId) and when the farmer taps "My location", the camera starts
//   from a whole-world view and dives down to the spot, so you see it arrive from outside the
//   continent. People who ask their device for reduced motion get a plain jump instead.
//
// TILES
//   Street: OpenStreetMap (fine for development; read its tile usage policy before launch).
//   Satellite: Esri World Imagery by default. Set VITE_SATELLITE_TILE_URL in .env to use another
//   provider for production (use the {z}/{x}/{y} placeholders). See docs/phase-4/README.md.

import "leaflet/dist/leaflet.css";
import "./FieldMap.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { fromGeoJson, polygonAreaHa, formatAcres } from "../../lib/geo.js";

const STREET = { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors", maxZoom: 19 };
const SATELLITE = {
  url: import.meta.env.VITE_SATELLITE_TILE_URL || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: import.meta.env.VITE_SATELLITE_ATTRIBUTION || "Imagery © Esri and its data providers",
  maxZoom: 19,
};
const KENYA = [-0.5, 37.8];
const WORLD_ZOOM = 2;        // the whole world in view: the camera starts outside the continent
const FLIGHT_SECONDS = 5;    // how long the dive takes
const PAD = [24, 24];
const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
// Leaflet needs real colour values, so read them from the design tokens at the moment they are used.
const token = (name, fallback) => (typeof document === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

const vertexIcon = (n) => L.divIcon({ className: "fmap-vertex", html: `<span>${n}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });

export default function FieldMap({ polygons = [], selectedId, onSelect, editable = false, points = [], onPointsChange, height = "360px" }) {
  const box = useRef(null);
  const map = useRef(null);
  const tiles = useRef(null);
  const shapes = useRef(null);   // read-only outlines
  const draft = useRef(null);    // the shape being drawn
  const me = useRef(null);       // the "you are here" dot
  const flight = useRef(null);   // timer that starts the dive once the world tiles have painted
  const lastFlown = useRef(null); // the selected plot the camera already flew to
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
    me.current = L.layerGroup().addTo(m);
    m.on("click", (e) => {
      const c = live.current;
      if (!c.editable) return;
      c.onPointsChange?.([...c.points, [e.latlng.lat, e.latlng.lng]]);
    });
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => { clearTimeout(flight.current); lastFlown.current = null; ro.disconnect(); m.remove(); map.current = null; };
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
    if (!(editable && points.length)) {
      const sel = selectedId ? polygons.find((p) => p.id === selectedId) : null;
      const selPts = sel ? fromGeoJson(sel.boundary) : [];
      if (selPts.length >= 3) {
        // a plot is selected: dive in from the world view (once per selected plot)
        if (lastFlown.current !== selectedId) { lastFlown.current = selectedId; flyIn({ bounds: L.latLngBounds(selPts) }); }
      } else {
        lastFlown.current = null;
        if (all.length) m.fitBounds(L.latLngBounds(all), { padding: PAD, maxZoom: 18 });
      }
    }
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

  // Start from the whole world, centred on the target, then fly down to it. Give { bounds } or { centre, zoom }.
  function flyIn({ bounds, centre, zoom }) {
    const m = map.current;
    if (!m) return;
    clearTimeout(flight.current);
    m.stop();
    if (reducedMotion()) {
      if (bounds) m.fitBounds(bounds, { padding: PAD, maxZoom: 18 });
      else m.setView(centre, zoom, { animate: false });
      return;
    }
    m.setView(bounds ? bounds.getCenter() : centre, WORLD_ZOOM, { animate: false });
    flight.current = setTimeout(() => {
      const mm = map.current;
      if (!mm) return;
      if (bounds) mm.flyToBounds(bounds, { padding: PAD, maxZoom: 18, duration: FLIGHT_SECONDS });
      else mm.flyTo(centre, zoom, { duration: FLIGHT_SECONDS });
    }, 400);
  }

  function locate() {
    if (!navigator.geolocation) { setNote("Your browser cannot find your location."); return; }
    setNote("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = [pos.coords.latitude, pos.coords.longitude];
        const colour = token("--color-info", "#2563eb");
        me.current?.clearLayers();
        if (me.current) {
          L.circle(here, { radius: pos.coords.accuracy || 20, color: colour, weight: 1, fillOpacity: 0.12, interactive: false }).addTo(me.current);
          L.circleMarker(here, { radius: 7, color: "#fff", weight: 2, fillColor: colour, fillOpacity: 1, interactive: false }).addTo(me.current);
        }
        flyIn({ centre: here, zoom: 17 });
        setNote("");
      },
      () => setNote("Could not get your location. Allow location access and try again."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // polygonAreaHa gives hectares (what is saved); formatAcres takes hectares and shows acres
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
            : `${points.length} corners · ${formatAcres(ha)}. Drag a corner to adjust it.`}
        </p>
      )}
      {note && <p className="fmap__hint" role="status">{note}</p>}
    </div>
  );
}
