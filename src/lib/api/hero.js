// src/lib/api/hero.js — MODIFIED (only landscape 16:9 photos; others are turned down softly)
//
// AIM
// The home page hero background. Public: which image is showing right now. Super admin: upload
// images into the "hero/" folder of the public "site-media" bucket, switch them on or off,
// reorder, delete, and set how often the image changes (12 hours, 1 day, 5 days, 1 week).
// The database picks the current image (function current_hero_image) so every visitor sees the
// same one. Every function returns { data, error } and never throws. A photo that is not landscape
// 16:9 is not an error: the upload returns { data: null, error: null, notice: "..." } and the
// screen shows the notice softly.

import { supabase } from "../../config/supabase.js";
import { checkWide169 } from "../imageCheck.js";

const BUCKET = "site-media";
const FOLDER = "hero";
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };

export const HERO_MAX_MB = 5;
export const HERO_CYCLES = [
  { value: "12", label: "Every 12 hours" },
  { value: "24", label: "Every day" },
  { value: "120", label: "Every 5 days" },
  { value: "168", label: "Every week" },
];

const urlFor = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const withUrl = (row) => ({ ...row, url: urlFor(row.storage_path) });

// ── Public ───────────────────────────────────────────────────────────────
// The image showing right now. data is null when there are no active images.
export async function getHeroImage() {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.rpc("current_hero_image");
  if (error) return { data: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { data: null, error: null };
  return { data: { url: urlFor(row.storage_path), path: row.storage_path, alt: row.alt_text || "" }, error: null };
}

// ── Super admin ──────────────────────────────────────────────────────────
export async function adminListHeroImages() {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.from("hero_images").select("*").order("sort_order").order("created_at");
  return { data: (data || []).map(withUrl), error: error?.message || null };
}

export async function adminUploadHeroImage(file, label, nextOrder) {
  if (!supabase) return NOT_CONNECTED;
  if (!TYPES[file.type]) return { data: null, error: "Use a JPG, PNG or WebP photo." };
  if (file.size > HERO_MAX_MB * 1024 * 1024) return { data: null, error: `The photo must be under ${HERO_MAX_MB} MB.` };
  const shape = await checkWide169(file);
  if (!shape.ok) return { data: null, error: null, notice: shape.message };
  const path = `${FOLDER}/${crypto.randomUUID()}.${TYPES[file.type]}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { data: null, error: up.error.message };
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("hero_images")
    .insert({ storage_path: path, alt_text: (label || "").trim() || null, sort_order: nextOrder || 0, created_by: auth?.user?.id || null })
    .select().single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]); // do not leave a file with no row
    return { data: null, error: error.message };
  }
  return { data: withUrl(data), error: null };
}

export async function adminSetHeroActive(id, isActive) {
  if (!supabase) return NOT_CONNECTED;
  const { error } = await supabase.from("hero_images").update({ is_active: !!isActive }).eq("id", id);
  return { data: null, error: error?.message || null };
}

// ids: every image id in the new order
export async function adminReorderHeroImages(ids) {
  if (!supabase) return NOT_CONNECTED;
  const results = await Promise.all(ids.map((id, i) => supabase.from("hero_images").update({ sort_order: i }).eq("id", id)));
  const failed = results.find((r) => r.error);
  return { data: null, error: failed?.error?.message || null };
}

export async function adminDeleteHeroImage(image) {
  if (!supabase) return NOT_CONNECTED;
  const { error } = await supabase.from("hero_images").delete().eq("id", image.id);
  if (error) return { data: null, error: error.message };
  await supabase.storage.from(BUCKET).remove([image.storage_path]); // best effort; a leftover file is harmless
  return { data: null, error: null };
}

// How often the image changes. restart = begin again from the first image now.
export async function adminGetHeroCycle() {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", "hero_rotation").maybeSingle();
  return { data: { cycle_hours: Number(data?.value?.cycle_hours) || 24, anchor: data?.value?.anchor || null }, error: error?.message || null };
}

export async function adminSaveHeroCycle(hours, restart) {
  if (!supabase) return NOT_CONNECTED;
  const cur = await adminGetHeroCycle();
  const anchor = restart || !cur.data?.anchor ? new Date().toISOString() : cur.data.anchor;
  const { data, error } = await supabase.from("platform_settings")
    .update({ value: { cycle_hours: Number(hours), anchor } }).eq("key", "hero_rotation").select().maybeSingle();
  if (!error && !data) return { data: null, error: "The hero setting is missing. Run the hero images migration first." };
  return { data: null, error: error?.message || null };
}