// src/lib/api/businessMedia.js — MODIFIED (the cover is framed and converted by the smart upload, so the 16:9 check is gone)
//
// AIM
// The two business pictures: the cover photo (businesses.cover_url) and the logo
// (businesses.logo_url). Files go to the public "business-media" bucket under
// <businessId>/cover/ and <businessId>/logo/ (the existing storage rule lets the owner and
// managers write there). Replacing or removing a picture deletes the old file from storage, so
// nothing is left behind. The cover arrives already cropped to 16:9 and converted by the smart
// upload (components/ui/ImageUploadButton.jsx), so this file only checks the type and the size.
// Every function returns { data, error } and never throws.

import { supabase } from "../../config/supabase.js";
import { uploadFile, removeFiles, publicUrl } from "../storage.js";

const BUCKET = "business-media";
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };

export const COVER_MAX_MB = 5; // the storage bucket refuses anything bigger
export const LOGO_MAX_MB = 2;

const KINDS = {
  cover: { column: "cover_url", folder: "cover", maxMb: COVER_MAX_MB, who: "cover photo" },
  logo: { column: "logo_url", folder: "logo", maxMb: LOGO_MAX_MB, who: "logo" },
};

// storage path of a file we uploaded for this business and kind, or "" for anything else
// (so we never delete other photos, such as room pictures)
function ownPathOf(businessId, folder, url) {
  if (!url) return "";
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return "";
  const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  return path.startsWith(`${businessId}/${folder}/`) ? path : "";
}

async function setColumn(businessId, column, url) {
  const { data, error } = await supabase.from("businesses").update({ [column]: url }).eq("id", businessId).select("id").maybeSingle();
  if (error) return error.message;
  if (!data) return "Only the business owner can change this.";
  return "";
}

export async function uploadBusinessImage(kind, businessId, file, oldUrl) {
  if (!supabase) return NOT_CONNECTED;
  const k = KINDS[kind];
  if (!TYPES[file.type]) return { data: null, error: "Use a JPG, PNG or WebP photo." };
  if (file.size > k.maxMb * 1024 * 1024) return { data: null, error: `The ${k.who} must be under ${k.maxMb} MB.` };
  const path = `${businessId}/${k.folder}/${crypto.randomUUID()}.${TYPES[file.type]}`;
  const up = await uploadFile(BUCKET, path, file);
  if (up.error) return { data: null, error: up.error.message };
  const url = publicUrl(BUCKET, path);
  const err = await setColumn(businessId, k.column, url);
  if (err) {
    await removeFiles(BUCKET, [path]); // do not leave a file nobody points to
    return { data: null, error: err };
  }
  const old = ownPathOf(businessId, k.folder, oldUrl);
  if (old) await removeFiles(BUCKET, [old]); // the replaced file is deleted
  return { data: { url }, error: null };
}

export async function removeBusinessImage(kind, businessId, oldUrl) {
  if (!supabase) return NOT_CONNECTED;
  const k = KINDS[kind];
  const err = await setColumn(businessId, k.column, null);
  if (err) return { data: null, error: err };
  const old = ownPathOf(businessId, k.folder, oldUrl);
  if (old) await removeFiles(BUCKET, [old]);
  return { data: null, error: null };
}

export const uploadBusinessCover = (id, file, oldUrl) => uploadBusinessImage("cover", id, file, oldUrl);
export const removeBusinessCover = (id, oldUrl) => removeBusinessImage("cover", id, oldUrl);
export const uploadBusinessLogo = (id, file, oldUrl) => uploadBusinessImage("logo", id, file, oldUrl);
export const removeBusinessLogo = (id, oldUrl) => removeBusinessImage("logo", id, oldUrl);