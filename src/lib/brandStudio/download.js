// src/lib/brandStudio/download.js — NEW FILE
//
// AIM
// Optional "Download PNG" for a logo or avatar. This is the only part that needs a browser (it
// draws the SVG on a canvas). Nothing is uploaded: the file is made on the person's own device.
// The PNG has a transparent background and the same size as the picture (512 wide).

import { svgToUri } from "./render.js";

/** Make a PNG from an SVG string and save it. Returns { error } and never throws. */
export function downloadSvgAsPng(svg, filename, width = 512, height = 512) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return resolve({ error: "Could not make the picture in this browser." });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
          resolve({ error: null });
        }, "image/png");
      } catch {
        resolve({ error: "Could not make the picture in this browser." });
      }
    };
    img.onerror = () => resolve({ error: "Could not make the picture in this browser." });
    img.src = svgToUri(svg);
  });
}

/** A safe file name from a business or person name. */
export const safeFileName = (s, fallback = "bizkenia") =>
  String(s || fallback).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || fallback;
