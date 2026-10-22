// src/lib/api/hero.js — MODIFIED (a slideshow of up to 5 photos; replace and delete per photo; no timing setting)
//
// AIM
// The home page hero photos. Public: the list of photos that are switched on, in order, which the
// home page loops through (lib/heroPreload.js). Super admin: upload photos into the "hero/" folder of
// the public "site-media" bucket (at most HERO_MAX_IMAGES), switch them on or off, reorder, REPLACE
// one (the new file goes up, the row points to it, and the old file is deleted from the bucket for
// good) and delete (the row and the file are both removed). A photo arrives already framed to 16:9
// and converted by the smart upload (components/ui/ImageUploadButton.jsx), so this file only checks
// the type and the size. How often the photo changes is no longer a setting: the home page changes
// it every 4 minutes. Every function returns { data, error } and never throws. When the row or file
// work succeeded but a leftover file could not be removed, `notice` says so.

import { supabase } from "../../config/supabase.js";

const BUCKET = "site-media";
const FOLDER = "hero";
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };

export const HERO_MAX_IMAGES = 5;
export const HERO_MAX_MB = 5; // the storage bucket refuses anything bigger

const urlFor = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const withUrl = (row) => ({ ...row, url: urlFor(row.storage_path) });

function checkFile(file) {
  if (!TYPES[file.type]) return "Use a JPG, PNG or WebP photo.";
  if (file.size > HERO_MAX_MB * 1024 * 1024) return `The photo must be under ${HERO_MAX_MB} MB.`;
  return "";
}

// ── Public ───────────────────────────────────────────────────────────────
// The photos that are switched on, in the order the home page shows them: [{ url, alt }].
// Row-level security already hides switched-off photos from visitors.
export async function listHeroSlides() {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.from("hero_images").select("storage_path, alt_text")
    .eq("is_active", true).order("sort_order").order("created_at").order("id");
  if (error) return { data: null, error: error.message };
  return { data: (data || []).map((r) => ({ url: urlFor(r.storage_path), alt: r.alt_text || "" })), error: null };
}

// ── Super admin ──────────────────────────────────────────────────────────
export async function adminListHeroImages() {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.from("hero_images").select("*").order("sort_order").order("created_at");
  return { data: (data || []).map(withUrl), error: error?.message || null };
}

export async function adminUploadHeroImage(file, label, nextOrder) {
  if (!supabase) return NOT_CONNECTED;
  const bad = checkFile(file);
  if (bad) return { data: null, error: bad };
  const { count, error: countErr } = await supabase.from("hero_images").select("id", { count: "exact", head: true });
  if (countErr) return { data: null, error: countErr.message };
  if ((count || 0) >= HERO_MAX_IMAGES) return { data: null, error: `There can be at most ${HERO_MAX_IMAGES} hero photos. Replace or delete one first.` };
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

// Replace one photo. Its place in the order, its description and its on/off setting stay as they are.
export async function adminReplaceHeroImage(image, file) {
  if (!supabase) return NOT_CONNECTED;
  const bad = checkFile(file);
  if (bad) return { data: null, error: bad };
  const path = `${FOLDER}/${crypto.randomUUID()}.${TYPES[file.type]}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { data: null, error: up.error.message };
  const { data, error } = await supabase.from("hero_images").update({ storage_path: path }).eq("id", image.id).select().maybeSingle();
  if (error || !data) {
    await supabase.storage.from(BUCKET).remove([path]); // the row still points to the old file, so drop the new one
    return { data: null, error: error?.message || "That photo no longer exists. Reload the page." };
  }
  const del = await supabase.storage.from(BUCKET).remove([image.storage_path]); // the old file is deleted for good
  if (del.error) return { data: withUrl(data), error: null, notice: "The new photo is in place, but the old file could not be deleted from storage." };
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

// Delete one photo: the row first (so the home page stops using it), then the file.
export async function adminDeleteHeroImage(image) {
  if (!supabase) return NOT_CONNECTED;
  const { error } = await supabase.from("hero_images").delete().eq("id", image.id);
  if (error) return { data: null, error: error.message };
  const del = await supabase.storage.from(BUCKET).remove([image.storage_path]);
  if (del.error) return { data: null, error: null, notice: "The photo was removed, but its file could not be deleted from storage." };
  return { data: null, error: null };
}
