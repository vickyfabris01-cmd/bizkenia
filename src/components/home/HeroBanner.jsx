// src/components/home/HeroBanner.jsx — NEW FILE
//
// AIM
// The home page hero: the <section> with the photo behind it and the page's own content on top
// (children). It never waits for anything:
//   1. It draws at once with the picture kept in the code, the first image file found in
//      src/assets/hero/ (empty folder = plain green hero, as before).
//   2. The online photo is faded in OVER it as soon as it has been downloaded, with one of four
//      2-second changes: fade, random bars, uncover, push.
//   3. Every 4 minutes (see lib/heroPreload.js) the next online photo takes its turn the same way.
// The same change is never used twice in a row. If the photo is already known when the page opens
// (coming back to Home, or a refresh), it is simply there, with no animation. A tab in the
// background just swaps. For people who ask for less motion the change is a short plain fade.
// "Already known" means a photo has been on screen in this visit (leaving Home and coming back) or the
// list was kept from earlier in the session. On a fresh load the photo ALWAYS animates in over the
// local picture, even if it finished downloading before the page drew.
//
// HOW A CHANGE WORKS
//   base layer       the photo on show (or the local picture)
//   incoming layer   the new photo, drawn above it and animated by HeroBanner.css (data-anim=...)
//   random bars      8 copies of the new photo, each cut to one vertical bar, switched on one by
//                    one in random order, so every bar keeps the exact framing of the full photo
//   when the 2 seconds are over, the new photo becomes the base layer and the incoming layer is removed.

import "./HeroBanner.css";
import { useEffect, useRef, useState } from "react";
import { TRANSITION_MS, heroIntroduced, markHeroIntroduced, useHeroSlides } from "../../lib/heroPreload.js";

// The picture kept in the code. import.meta.glob finds whatever image is in the folder, so there
// is no file name to get right, and an empty folder is fine (the result is just empty).
const KEPT = import.meta.glob("../../assets/hero/*.{jpg,jpeg,png,webp,avif}", { eager: true, query: "?url", import: "default" });
const FALLBACK = Object.entries(KEPT).sort(([a], [b]) => a.localeCompare(b)).map(([, url]) => url)[0] || "";

const ANIMS = ["fade", "bars", "uncover", "push"];
const BARS = 8;
const BAR_MS = 500;
const REDUCED_MS = 400;

const bg = (url) => (url ? { backgroundImage: `url("${url}")` } : undefined);

function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Each bar waits its turn in a random order; the last one finishes exactly when the 2 seconds end.
function makeBars() {
  const order = shuffled(BARS);
  const step = (TRANSITION_MS - BAR_MS) / (BARS - 1);
  return order.map((turn, i) => ({ i, delay: Math.round(turn * step) }));
}

export default function HeroBanner({ children, className = "" }) {
  const { images, index } = useHeroSlides();
  const target = images[index]?.url || "";

  const [shown, setShown] = useState(() => (heroIntroduced() ? target : "")); // the online photo on screen ("" = the local picture)
  const [incoming, setIncoming] = useState(null);   // { url, anim, ms, bars } while a change is running
  const shownRef = useRef(shown);
  const incomingRef = useRef(null);
  const pending = useRef("");
  const timer = useRef(0);
  const lastAnim = useRef("");
  shownRef.current = shown;

  function begin(url) {
    if (url === shownRef.current) return;
    if (incomingRef.current) { pending.current = url; return; } // one change at a time; this one waits
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (typeof document !== "undefined" && document.hidden) { markHeroIntroduced(); setShown(url); return; } // nobody is watching
    const pool = reduced ? ["fade"] : ANIMS.filter((a) => a !== lastAnim.current);
    const anim = pool[Math.floor(Math.random() * pool.length)];
    lastAnim.current = anim;
    const ms = reduced ? REDUCED_MS : TRANSITION_MS;
    const next = { url, anim, ms, bars: anim === "bars" ? makeBars() : null };
    incomingRef.current = next;
    setIncoming(next);
    timer.current = setTimeout(() => {
      incomingRef.current = null;
      markHeroIntroduced();
      setShown(url);
      setIncoming(null);
      const waiting = pending.current;
      pending.current = "";
      if (waiting && waiting !== url) begin(waiting);
    }, ms + 60);
  }

  useEffect(() => { if (target) begin(target); }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  // On unmount (and in React's development double-mount) stop the running change and forget it, so a
  // mount that follows can start it again instead of waiting for a timer that no longer exists.
  useEffect(() => () => { clearTimeout(timer.current); incomingRef.current = null; pending.current = ""; }, []);

  const base = shown || FALLBACK;
  const hasImage = Boolean(base || incoming);

  return (
    <section className={`home-hero${hasImage ? " home-hero--image" : ""}${className ? ` ${className}` : ""}`}>
      <div className="hero-slides" aria-hidden="true" data-anim={incoming?.anim || ""} style={incoming ? { "--hero-ms": `${incoming.ms}ms` } : undefined}>
        <div className="hero-slide hero-slide--base" style={bg(base)} />
        {incoming && incoming.anim !== "bars" && <div className="hero-slide hero-slide--in" style={bg(incoming.url)} />}
        {incoming && incoming.anim === "bars" && incoming.bars.map((b) => (
          <div key={b.i} className="hero-slide hero-slide--bar"
            style={{ ...bg(incoming.url), clipPath: `inset(0 ${100 - ((b.i + 1) * 100) / BARS}% 0 ${(b.i * 100) / BARS}%)`, animationDelay: `${b.delay}ms` }} />
        ))}
      </div>
      <div className="hero-shade" aria-hidden="true" />
      {children}
    </section>
  );
}
