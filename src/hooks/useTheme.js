// src/hooks/useTheme.js — NEW FILE
//
// AIM
// One place that owns the light / dark / system choice. Any component can read or change
// the theme with useTheme(); all of them stay in sync (and so do other open browser tabs).
//
// HOW IT WORKS
// - The choice is saved in localStorage under THEME_STORAGE_KEY.
// - It is applied as <html data-theme="light | dark | system">, which tokens.css reads.
// - index.html runs a tiny script before first paint that applies the saved choice, so the
//   page never flashes the wrong theme. That script must use the same key and default.
//
// USAGE
//   const { theme, resolvedTheme, setTheme, toggle } = useTheme();
//   theme          "light" | "dark" | "system"   what the user chose
//   resolvedTheme  "light" | "dark"              what is actually showing right now
//   toggle()       switches between light and dark (leaves "system" behind)

import { useCallback, useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "app-theme";
export const THEME_VALUES = ["light", "dark", "system"];

// Keep in sync with the default in index.html.
export const DEFAULT_THEME = "system";

const hasWindow = typeof window !== "undefined";
const darkQuery =
  hasWindow && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function readStored() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_VALUES.includes(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyToDocument(theme) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

// ── Tiny external store so every useTheme() caller updates together ───────────
let current = hasWindow ? readStored() : DEFAULT_THEME;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getTheme() {
  return current;
}

function setThemeValue(next) {
  if (!THEME_VALUES.includes(next)) return;
  current = next;
  applyToDocument(next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* private mode or blocked storage: the choice just lasts for this visit */
  }
  emit();
}

if (hasWindow) {
  // Another tab changed the theme
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    current = THEME_VALUES.includes(event.newValue) ? event.newValue : DEFAULT_THEME;
    applyToDocument(current);
    emit();
  });
  // The device switched between light and dark (matters when theme is "system")
  darkQuery?.addEventListener?.("change", emit);
}

function getSystemDark() {
  return darkQuery ? darkQuery.matches : false;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);
  const systemDark = useSyncExternalStore(subscribe, getSystemDark, () => false);

  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  const setTheme = useCallback((next) => setThemeValue(next), []);
  const toggle = useCallback(
    () => setThemeValue(resolvedTheme === "dark" ? "light" : "dark"),
    [resolvedTheme],
  );

  return { theme, resolvedTheme, setTheme, toggle };
}

export default useTheme;