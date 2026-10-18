// src/lib/imageCheck.js — NEW FILE
//
// AIM
// Checks a chosen photo before it is uploaded. Hero and cover photos must be landscape 16:9
// (a small tolerance is allowed, so 1920x1080, 1600x900 and 1280x720 all pass). A photo that
// does not fit is turned down softly: we return a friendly sentence to show as a notice, not an
// error. The browser can read the size, the database cannot, so this check lives here.

const TARGET = 16 / 9;
const TOLERANCE = 0.04; // 4 percent either side, about 1.71 to 1.85

export function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}

// returns { ok, width, height, message }  (message is set when ok is false)
export async function checkWide169(file) {
  let size;
  try { size = await readImageSize(file); } catch {
    return { ok: false, width: 0, height: 0, message: "We could not read that photo. Please try a different JPG, PNG or WebP file." };
  }
  const { width, height } = size;
  const ratio = width / height;
  if (Math.abs(ratio / TARGET - 1) <= TOLERANCE) return { ok: true, width, height, message: "" };
  const message = height > width
    ? `That photo is upright (${width} x ${height}). Please choose a wide landscape photo in 16:9, for example 1920 x 1080.`
    : `That photo is ${width} x ${height}, which is not 16:9. Please crop it to 16:9 (for example 1920 x 1080) and try again.`;
  return { ok: false, width, height, message };
}