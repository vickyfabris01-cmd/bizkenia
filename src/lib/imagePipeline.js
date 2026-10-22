// src/lib/imagePipeline.js — NEW FILE (replaces the old 16:9 check in imageCheck.js)
//
// AIM
// The browser half of the smart upload: read a chosen photo, cut out the part the person framed
// (crop), and write it as a JPEG, PNG or WebP (convert). The result is a File that goes to storage
// exactly as it is, so what the person framed is what everyone sees. Nothing here talks to the
// database. The crop window itself is components/ui/ImageCropper.jsx.
//
// QUALITY
// The crop is cut from the ORIGINAL pixels and never enlarged. It is only made smaller when it is
// wider than the preset's maxWidth (a screen never shows more), and then in steps of two so edges
// stay sharp. JPEG and WebP are written at 0.92. Only if the file would break the storage limit
// (the buckets refuse anything over 5 MiB) is the quality lowered a little at a time, then, as a
// last resort, the size; the result says so in `note` so the person is told.
//
// PRESETS: the shape each kind of photo is shown in, so each one is cropped to fit its place.
//   hero     16:9    the home page background
//   cover    16:9    the business cover (listing card and public business page)
//   product  1:1     shop products and farm produce (square in the shop and in cards)
//   room     16:10   rooms and room types
// minGoodWidth: a crop narrower than this (in original pixels) is still allowed, but the cropper
// warns that it may look soft.

export const FORMATS = [
  { value: "image/jpeg", label: "JPEG", ext: "jpg", hint: "Best for photos" },
  { value: "image/png", label: "PNG", ext: "png", hint: "Lossless, large files" },
  { value: "image/webp", label: "WebP", ext: "webp", hint: "Small and sharp" },
];

export const PRESETS = {
  hero: { label: "Hero photo", shape: "16:9", ratio: 16 / 9, maxWidth: 2560, minGoodWidth: 1600 },
  cover: { label: "Cover photo", shape: "16:9", ratio: 16 / 9, maxWidth: 2048, minGoodWidth: 1200 },
  product: { label: "Product photo", shape: "square", ratio: 1, maxWidth: 2000, minGoodWidth: 800 },
  room: { label: "Room photo", shape: "16:10", ratio: 16 / 10, maxWidth: 1920, minGoodWidth: 1000 },
};

export const MAX_SOURCE_MB = 40;                 // a chosen file bigger than this is turned down
export const MAX_OUTPUT_BYTES = 5_000_000;       // under the 5 MiB (5,242,880) the buckets accept
const START_QUALITY = 0.92;
const QUALITY_STEPS = [0.92, 0.88, 0.84, 0.8, 0.75, 0.7];
const MIN_WIDTH_AFTER_SHRINK = 900;

const byValue = (type) => FORMATS.find((f) => f.value === type);

/** The format to start on: the file's own when it is one of ours, otherwise JPEG. */
export function defaultFormat(file) {
  return byValue(file?.type) ? file.type : "image/jpeg";
}

/** True for any file the browser might be able to read as a picture. */
export const looksLikeImage = (file) => !!file && (file.type ? file.type.startsWith("image/") : /\.(jpe?g|png|webp|avif|gif|heic|heif)$/i.test(file.name || ""));

/**
 * Reads a photo. Resolves { img, width, height, release }; call release() when finished.
 * Rejects with a friendly Error when the browser cannot read the file.
 * (The browser turns the photo upright from its camera data, so width and height are what you see.)
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_SOURCE_MB * 1024 * 1024) return reject(new Error(`That photo is larger than ${MAX_SOURCE_MB} MB. Please choose a smaller one.`));
    const url = URL.createObjectURL(file);
    const release = () => URL.revokeObjectURL(url);
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) { release(); return reject(new Error("We could not read that photo. Please try a JPG, PNG or WebP file.")); }
      resolve({ img, width: img.naturalWidth, height: img.naturalHeight, release });
    };
    img.onerror = () => { release(); reject(new Error("We could not read that photo. Please try a JPG, PNG or WebP file.")); };
    img.src = url;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

// Draws the part `r` ({x, y, w, h} in original pixels) of `img` into a new ow x oh canvas.
// When the part is more than twice as wide as the result it is halved first, step by step,
// because one big jump loses detail and leaves jagged edges.
function drawCrop(img, r, ow, oh, opaque) {
  let source = img, sx = r.x, sy = r.y, sw = r.w, sh = r.h;
  while (sw / ow > 2) {
    const nw = Math.max(ow, Math.round(sw / 2)), nh = Math.max(oh, Math.round(sh / 2));
    const step = makeCanvas(nw, nh);
    const sctx = step.getContext("2d");
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(source, sx, sy, sw, sh, 0, 0, nw, nh);
    source = step; sx = 0; sy = 0; sw = nw; sh = nh;
  }
  const out = makeCanvas(ow, oh);
  const ctx = out.getContext("2d");
  if (opaque) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, ow, oh); } // JPEG has no see-through
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, ow, oh);
  return out;
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Cuts out `rect` and writes it in `type`.
 *   rect     { x, y, w, h } in original pixels (the cropper makes it match preset.ratio)
 *   preset   one of PRESETS
 *   type     "image/jpeg" | "image/png" | "image/webp"
 * Resolves { blob, width, height, type, ext, note }. Rejects with a friendly Error.
 * `note` is "" unless the file had to be made smaller to fit the storage limit.
 */
export async function cropToBlob(img, rect, preset, type) {
  const format = byValue(type);
  if (!format) throw new Error("Choose JPEG, PNG or WebP.");
  const opaque = type === "image/jpeg";
  let ow = Math.max(1, Math.min(Math.round(rect.w), preset.maxWidth));
  let note = "";
  let shrunk = false;

  for (let attempt = 0; attempt < 8; attempt++) {
    const oh = Math.max(1, Math.round(ow / preset.ratio));
    const canvas = drawCrop(img, rect, ow, oh, opaque);
    const qualities = type === "image/png" ? [undefined] : QUALITY_STEPS;
    for (let i = 0; i < qualities.length; i++) {
      const blob = await toBlob(canvas, type, qualities[i]);
      if (!blob) throw new Error("We could not prepare that photo. Please try again.");
      if (blob.type !== type) throw new Error(`This browser cannot save ${format.label} files. Please choose another format.`); // an older Safari hands back PNG for WebP
      if (blob.size <= MAX_OUTPUT_BYTES) {
        if (shrunk) note = `It was reduced to ${ow} x ${oh} px to fit the 5 MB limit.`;
        else if (qualities[i] !== undefined && qualities[i] < START_QUALITY) note = "It was saved at a slightly lower quality to fit the 5 MB limit.";
        return { blob, width: ow, height: oh, type, ext: format.ext, note };
      }
    }
    if (ow <= MIN_WIDTH_AFTER_SHRINK) break;
    ow = Math.max(MIN_WIDTH_AFTER_SHRINK, Math.round(ow * 0.85)); // last resort: make it smaller
    shrunk = true;
  }
  throw new Error("That photo is too large to save, even after shrinking it. Choose JPEG or WebP, or frame a smaller part.");
}

/** Turns the cropped blob into a File named after the original (extension swapped). */
export function resultToFile(result, originalName = "photo") {
  const base = (originalName || "photo").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "photo";
  return new File([result.blob], `${base}.${result.ext}`, { type: result.type });
}
