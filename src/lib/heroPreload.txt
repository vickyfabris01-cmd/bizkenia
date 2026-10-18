// src/lib/heroPreload.js — NEW FILE
//
// AIM
// Get the home page hero photo ready BEFORE the home page draws, and only once per session.
// main.jsx starts this before React renders, so the database call and the image download run
// while the app is starting up. The home page shows a skeleton until this is ready, then draws
// the real page in one go, so the photo never appears after the text.
//
// "Ready" means one of these has happened:
//   - the current hero photo was found and fully downloaded     -> ready, with a url
//   - there are no active hero photos                           -> ready, no url (plain hero)
//   - the lookup or the download failed                         -> ready, no url (plain hero)
//   - it took longer than HERO_TIMEOUT_MS                       -> ready, no url (plain hero)
// So the page can never get stuck on the skeleton.
//
// Once per session: a good result (a photo, or "no photos") is kept in sessionStorage, so later
// visits to home, and refreshes in the same tab, are ready on the very first paint with no skeleton
// and no database call. A failure or a timeout is NOT kept, so the next page load tries again.
// The database rotates the photo every 12 hours to a week, so keeping it for one session is safe.
//
// EXPORTS
//   startHeroPreload()   begin (safe to call many times; only the first call does the work)
//   useHeroPreload()     React hook -> { ready, url }

import { useEffect, useSyncExternalStore } from "react";
import { getHeroImage } from "./api/hero.js";

const STORAGE_KEY = "hero-preload-v1";
export const HERO_TIMEOUT_MS = 5000;

let state = { ready: false, url: "" };
let started = null; // the promise from the first start; also the "already started" flag
const listeners = new Set();

function readSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return typeof saved?.url === "string" ? saved : null;
  } catch (e) {
    return null;
  }
}

function writeSession(url) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ url })); } catch (e) { /* private mode: fine */ }
}

function settle(url, remember) {
  state = { ready: true, url };
  if (remember) writeSession(url);
  listeners.forEach((notify) => notify());
}

export function startHeroPreload() {
  if (started) return started;

  const saved = readSession();
  if (saved) {
    state = { ready: true, url: saved.url };
    started = Promise.resolve();
    return started;
  }

  started = new Promise((resolve) => {
    let done = false;
    const finish = (url, remember) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      settle(url, remember);
      resolve();
    };
    const timer = setTimeout(() => finish("", false), HERO_TIMEOUT_MS);

    getHeroImage()
      .then(({ data, error }) => {
        if (error) return finish("", false);
        if (!data?.url) return finish("", true); // no active photos: remember, plain hero
        const img = new Image();
        img.onload = () => finish(data.url, true);
        img.onerror = () => finish("", false);
        img.src = data.url;
        return undefined;
      })
      .catch(() => finish("", false));
  });
  return started;
}

function subscribe(notify) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

const getSnapshot = () => state;

export function useHeroPreload() {
  useEffect(() => { startHeroPreload(); }, []); // a safety net when home is not the first page opened
  return useSyncExternalStore(subscribe, getSnapshot);
}