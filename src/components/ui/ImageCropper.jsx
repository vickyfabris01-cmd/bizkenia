// src/components/ui/ImageCropper.jsx — NEW FILE
//
// AIM
// The crop window of the smart upload. The person sees their photo in a frame shaped like the place
// it will be shown (16:9, square, 16:10), drags it to position it, pinches (or scrolls, or uses the
// slider) to zoom, picks JPEG, PNG or WebP, and taps "Use photo". The photo is cut from the original
// pixels (see lib/imagePipeline.js), so nothing is enlarged and nothing is lost to a screenshot-sized
// preview. The finished File is handed to onDone; the caller uploads it.
//
// PROPS
//   file      the chosen photo (a File)
//   preset    "hero" | "cover" | "product" | "room"   (the shape and size, see imagePipeline.js)
//   onDone    (file: File) => void       the cropped, converted photo
//   onCancel  () => void
//   step      optional { index, total }  shown in the title when several photos are queued ("2 of 3")
//
// CONTROLS
//   drag / one finger        move the photo          pinch / two fingers / mouse wheel   zoom
//   Zoom slider and - / +    zoom                    arrow keys (frame focused)          move (Shift = faster)
// The photo can never leave an empty gap: it always covers the frame.
// Mount it only while a photo is being cropped, and give it a new `key` for each photo.

import "./ImageCropper.css";
import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "../modals/Modal.jsx";
import Button from "./Button.jsx";
import { FORMATS, PRESETS, cropToBlob, defaultFormat, loadImage, resultToFile } from "../../lib/imagePipeline.js";

const MIN_REGION_PX = 200; // zoom stops before the framed part is narrower than this (original pixels)
const MAX_ZOOM = 8;

export default function ImageCropper({ file, preset: presetKey, onDone, onCancel, step }) {
  const preset = PRESETS[presetKey] || PRESETS.cover;
  const [loaded, setLoaded] = useState(null);      // { img, width, height, release }
  const [loadError, setLoadError] = useState("");
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ z: 1, ox: 0, oy: 0 });
  const [type, setType] = useState(() => defaultFormat(file));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const frameEl = useRef(null);
  const viewRef = useRef(view);
  const geo = useRef({ fw: 0, fh: 0, nw: 0, nh: 0, s0: 1 }); // frame and photo sizes, kept for the event handlers
  const pointers = useRef(new Map());
  const last = useRef(null);

  // ---- read the photo ------------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    let current = null;
    loadImage(file).then((res) => {
      if (!alive) return res.release();
      current = res;
      setLoaded(res);
    }).catch((e) => alive && setLoadError(e.message));
    return () => { alive = false; current?.release(); };
  }, [file]);

  // Escape closes only this window. The cropper often opens on top of another dialog (a product
  // form, say); without this, that dialog would hear Escape too and close with its unsaved changes.
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      if (!busyRef.current) cancelRef.current();
    };
    document.addEventListener("keydown", onKey, true); // capture: runs before the dialogs' own listeners
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // ---- keep the frame size up to date ----------------------------------------------------
  useEffect(() => {
    const el = frameEl.current;
    if (!el || !loaded) return undefined;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  const nw = loaded?.width || 0, nh = loaded?.height || 0;
  const s0 = nw && frame.w ? Math.max(frame.w / nw, frame.h / nh) : 1; // scale at which the photo just covers the frame
  geo.current = { fw: frame.w, fh: frame.h, nw, nh, s0 };
  const maxZoom = Math.max(1, Math.min(MAX_ZOOM, frame.w / (MIN_REGION_PX * s0)));

  // ---- placing the photo (always covering the frame) -----------------------------------------
  const place = useCallback((z, ox, oy) => {
    const g = geo.current;
    if (!g.nw || !g.fw) return;
    const zmax = Math.max(1, Math.min(MAX_ZOOM, g.fw / (MIN_REGION_PX * g.s0)));
    const zz = Math.min(zmax, Math.max(1, z));
    const s = g.s0 * zz;
    const next = {
      z: zz,
      ox: Math.min(0, Math.max(g.fw - g.nw * s, ox)),
      oy: Math.min(0, Math.max(g.fh - g.nh * s, oy)),
    };
    viewRef.current = next;
    setView(next);
  }, []);

  const zoomAbout = useCallback((newZ, fx, fy) => {
    const g = geo.current;
    const { z, ox, oy } = viewRef.current;
    const s = g.s0 * z;
    const zmax = Math.max(1, Math.min(MAX_ZOOM, g.fw / (MIN_REGION_PX * g.s0)));
    const zz = Math.min(zmax, Math.max(1, newZ));
    const s2 = g.s0 * zz;
    const px = (fx - ox) / s, py = (fy - oy) / s; // the photo point under the finger stays under it
    place(zz, fx - px * s2, fy - py * s2);
  }, [place]);

  // First placement, and when the frame changes size (turning the phone): keep the same centre.
  const prevFrame = useRef({ w: 0, h: 0 });
  useEffect(() => {
    if (!nw || !frame.w) return;
    const p = prevFrame.current;
    if (!p.w) {
      place(1, (frame.w - nw * s0) / 2, (frame.h - nh * s0) / 2);
    } else if (p.w !== frame.w || p.h !== frame.h) {
      const { z, ox, oy } = viewRef.current;
      const oldS = (Math.max(p.w / nw, p.h / nh)) * z;
      const cx = (p.w / 2 - ox) / oldS, cy = (p.h / 2 - oy) / oldS; // photo point that was in the middle
      const s = s0 * z;
      place(z, frame.w / 2 - cx * s, frame.h / 2 - cy * s);
    }
    prevFrame.current = { w: frame.w, h: frame.h };
  }, [frame.w, frame.h, nw, nh, s0, place]);

  // ---- touch, mouse and wheel ----------------------------------------------------------
  const local = (e) => {
    const r = frameEl.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try { frameEl.current.setPointerCapture(e.pointerId); } catch (err) { /* the pointer is already gone: keep going */ }
    pointers.current.set(e.pointerId, local(e));
    last.current = null;
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId);
    const now = local(e);
    pointers.current.set(e.pointerId, now);
    const v = viewRef.current;
    if (pointers.current.size === 1) {
      place(v.z, v.ox + (now.x - prev.x), v.oy + (now.y - prev.y));
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (last.current && last.current.dist > 0) {
        zoomAbout(v.z * (dist / last.current.dist), mx, my);
        const v2 = viewRef.current;
        place(v2.z, v2.ox + (mx - last.current.mx), v2.oy + (my - last.current.my)); // two fingers also move it
      }
      last.current = { dist, mx, my };
    }
  }

  function onPointerEnd(e) {
    pointers.current.delete(e.pointerId);
    last.current = null;
  }

  useEffect(() => {
    const el = frameEl.current;
    if (!el || !loaded) return undefined;
    const onWheel = (e) => {
      e.preventDefault(); // the page must not scroll while zooming
      const r = el.getBoundingClientRect();
      zoomAbout(viewRef.current.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [loaded, zoomAbout]);

  function onKeyDown(e) {
    const v = viewRef.current;
    const d = e.shiftKey ? 40 : 10;
    const keys = {
      ArrowLeft: () => place(v.z, v.ox + d, v.oy), ArrowRight: () => place(v.z, v.ox - d, v.oy),
      ArrowUp: () => place(v.z, v.ox, v.oy + d), ArrowDown: () => place(v.z, v.ox, v.oy - d),
      "+": () => zoomAbout(v.z * 1.1, frame.w / 2, frame.h / 2), "=": () => zoomAbout(v.z * 1.1, frame.w / 2, frame.h / 2),
      "-": () => zoomAbout(v.z / 1.1, frame.w / 2, frame.h / 2),
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
  }

  // ---- what is framed, in original pixels ----------------------------------------------------
  const s = s0 * view.z;
  const regionW = nw ? Math.min(nw, frame.w / s) : 0;
  const region = nw ? {
    x: Math.max(0, Math.min(nw - regionW, -view.ox / s)),
    y: Math.max(0, Math.min(nh - regionW / preset.ratio, -view.oy / s)),
    w: regionW,
    h: regionW / preset.ratio,
  } : null;
  const outW = region ? Math.min(Math.round(region.w), preset.maxWidth) : 0;
  const outH = region ? Math.round(outW / preset.ratio) : 0;
  const soft = region && region.w < preset.minGoodWidth;

  async function useIt() {
    if (!loaded || !region) return;
    setBusy(true);
    setError("");
    try {
      const result = await cropToBlob(loaded.img, region, preset, type);
      onDone(resultToFile(result, file.name), result);
    } catch (e) {
      setError(e.message || "We could not prepare that photo. Please try again.");
      setBusy(false);
    }
  }

  const title = step && step.total > 1 ? `Frame your photo (${step.index + 1} of ${step.total})` : "Frame your photo";

  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onCancel}
      closable={!busy}
      title={title}
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={useIt} loading={busy} disabled={!loaded}>Use photo</Button>
        </>
      )}
    >
      {loadError ? (
        <p className="crop__error" role="alert">{loadError}</p>
      ) : !loaded ? (
        <p className="crop__status" role="status">Preparing your photo…</p>
      ) : (
        <div className="crop">
          <p className="crop__intro">{preset.label}, {preset.shape}. Drag to move, pinch or scroll to zoom.</p>

          <div
            ref={frameEl}
            className="crop__frame"
            style={{ "--r": preset.ratio }}
            tabIndex={0}
            role="group"
            aria-label="Photo frame. Use the arrow keys to move the photo and plus or minus to zoom."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onKeyDown={onKeyDown}
            data-autofocus
          >
            <img
              className="crop__img"
              src={loaded.img.src}
              alt=""
              draggable={false}
              style={{ width: nw, height: nh, transform: `translate(${view.ox}px, ${view.oy}px) scale(${s})` }}
            />
            <div className="crop__grid" aria-hidden="true" />
          </div>

          <div className="crop__zoom">
            <button type="button" className="crop__step" aria-label="Zoom out" onClick={() => zoomAbout(view.z / 1.15, frame.w / 2, frame.h / 2)} disabled={view.z <= 1}>−</button>
            <input type="range" aria-label="Zoom" min="1" max={maxZoom} step="0.01" value={Math.min(view.z, maxZoom)} disabled={maxZoom <= 1}
              onChange={(e) => zoomAbout(Number(e.target.value), frame.w / 2, frame.h / 2)} />
            <button type="button" className="crop__step" aria-label="Zoom in" onClick={() => zoomAbout(view.z * 1.15, frame.w / 2, frame.h / 2)} disabled={view.z >= maxZoom}>+</button>
          </div>

          <div className="crop__format" role="radiogroup" aria-label="Save as">
            <span className="crop__label">Save as</span>
            {FORMATS.map((f) => (
              <button key={f.value} type="button" role="radio" aria-checked={type === f.value} className="crop__chip"
                onClick={() => { setType(f.value); setError(""); }}>{f.label}</button>
            ))}
          </div>
          <p className="crop__note">{FORMATS.find((f) => f.value === type)?.hint}. The photo will be {outW} × {outH} px.</p>

          {soft && <p className="crop__warn" role="status">This part is only {Math.round(region.w)} px wide, so it may look soft on large screens. Zoom out a little, or choose a larger photo.</p>}
          {error && <p className="crop__error" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
