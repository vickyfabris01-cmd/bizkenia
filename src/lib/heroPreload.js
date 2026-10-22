// src/lib/heroPreload.js — MODIFIED (a slideshow clock: every online hero photo takes a turn, one every 4 minutes)
//
// AIM
// Decides which online hero photo the home page shows, and when it changes. The home page itself is
// never held back: it draws at once with the picture kept in the code (src/assets/hero), and the
// online photo is faded in over it as soon as it has been downloaded (components/home/HeroBanner.jsx).
//
// THE CLOCK
// The photo on show is worked out from the wall clock: slot = floor(now / 4 minutes), photo =
// slot modulo the number of photos. So every visitor sees the same photo, and the rhythm does not
// depend on which page is open or on when Home was last visited: coming back to Home after ten minutes
// simply shows the photo that belongs to now. While the site is open a timer wakes at each 4-minute
// boundary, downloads the next photo FIRST, and only then moves on, so the picture never pops in.
// A tab that was in the background catches up when it becomes visible again.
//
// KEPT IN THE SESSION
// The list of photos is kept in sessionStorage for 10 minutes, so a refresh or another visit to Home
// starts on the right photo with no wait. A failed lookup is not kept. Every 8th boundary (about 32
// minutes) the list is read again, so photos the super admin adds, deletes or switches off are picked up.
//
// EXPORTS
//   ROTATE_MS, TRANSITION_MS   4 minutes between photos, 2 seconds for the change itself
//   startHeroPreload()         begin (safe to call many times; only the first call does the work)
//   useHeroSlides()            React hook -> { ready, images: [{ url, alt }], index }
//   heroIntroduced()           true once an online photo has been on screen in this visit (or the list came
//                              from earlier in the session). Until then the home page shows the picture kept
//                              in the code first and ANIMATES the photo in over it, even when the photo was
//                              downloaded before the page drew.
//   markHeroIntroduced()       called by the banner when a photo has been shown

import { useEffect, useSyncExternalStore } from "react";
import { listHeroSlides } from "./api/hero.js";

export const ROTATE_MS = 4 * 60 * 1000;
export const TRANSITION_MS = 2000;

const STORAGE_KEY = "hero-slides-v2";
const CACHE_MS = 10 * 60 * 1000;
const REFRESH_EVERY = 8;        // boundaries between two reads of the list
const LOAD_TIMEOUT_MS = 8000;   // give up on one photo after this long and try the next

let state = { ready: false, images: [], index: 0 };
let started = null;
let introduced = false;
let timer = 0;
let ticks = 0;
const listeners = new Set();

function setState(next) {
  state = next;
  listeners.forEach((notify) => notify());
}

const slotIndex = (n) => Math.floor(Date.now() / ROTATE_MS) % n;

function readCache() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || !Array.isArray(saved.images) || Date.now() - saved.at > CACHE_MS) return null;
    return saved.images;
  } catch (e) {
    return null;
  }
}

function writeCache(images) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), images })); } catch (e) { /* private mode: fine */ }
}

// Downloads one photo; resolves true when it is ready to draw.
function preload(url) {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
    img.onload = () => { clearTimeout(t); resolve(true); };
    img.onerror = () => { clearTimeout(t); resolve(false); };
    img.src = url;
  });
}

// The first photo that downloads, starting at `start` and going round. -1 when none does.
async function firstLoadable(images, start) {
  for (let k = 0; k < images.length; k++) {
    const i = (start + k) % images.length;
    if (await preload(images[i].url)) return i;
  }
  return -1;
}

// Read the list again and settle on the photo that belongs to this moment.
async function refresh() {
  const { data, error } = await listHeroSlides();
  if (error) {
    if (!state.ready) setState({ ready: true, images: [], index: 0 }); // the fallback picture stays; not kept for next time
    return;
  }
  if (data.length === 0) {
    setState({ ready: true, images: [], index: 0 });
    writeCache([]);
    return;
  }
  const i = await firstLoadable(data, slotIndex(data.length));
  if (i < 0) { setState({ ...state, ready: true }); return; }
  setState({ ready: true, images: data, index: i });
  writeCache(data);
}

// Move on to the photo that belongs to now, once it has been downloaded.
async function advance() {
  const n = state.images.length;
  if (n < 2) return;
  const i = await firstLoadable(state.images, slotIndex(n));
  if (i >= 0 && i !== state.index) setState({ ...state, index: i });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(tick, ROTATE_MS - (Date.now() % ROTATE_MS) + 50); // the next 4-minute boundary
}

async function tick() {
  ticks += 1;
  try {
    if (ticks % REFRESH_EVERY === 0) await refresh();
    else await advance();
  } finally {
    schedule();
  }
}

export const heroIntroduced = () => introduced;
export const markHeroIntroduced = () => { introduced = true; };

export function startHeroPreload() {
  if (started) return started;

  const cached = readCache();
  if (cached) {
    // Known from earlier in this session: on screen from the first paint, no waiting, no animation.
    introduced = true;
    setState({ ready: true, images: cached, index: cached.length ? slotIndex(cached.length) : 0 });
    started = Promise.resolve();
  } else {
    started = refresh();
  }
  schedule();

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") { advance(); schedule(); } // a background tab catches up
    });
  }
  return started;
}

function subscribe(notify) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

const getSnapshot = () => state;

export function useHeroSlides() {
  useEffect(() => { startHeroPreload(); }, []); // a safety net when home is not the first page opened
  return useSyncExternalStore(subscribe, getSnapshot);
}
