// src/components/ui/SectionNav.jsx
//
// AIM
// A small floating quick-access bar for long settings pages. It lists the sections of the page, highlights the one
// the person is reading, follows the scroll, and jumps to a section when tapped.
//
// USAGE
//   <SectionNav items={[{ id: "set-mpesa", label: "M-Pesa", icon: "card" }, { id: "set-share", label: "Share and promote" }]} />
//   Each id must be the id of an element on the same page (a Card takes id directly: <Card id="set-mpesa">).
//   Sections that are not on the page (still loading, or switched off) are left out of the bar; with fewer than two
//   sections left, nothing is shown.
//
// PROPS
//   items       [{ id, label, icon? }]  icon is the name of an icon from Icon.jsx
//   label       accessible name of the bar, default "Sections on this page"
//   className   extra class
//
// HOW IT WORKS
//   - IntersectionObserver watches a band just under the sticky header and bar. The first section (in the order of
//     `items`) that touches the band is the active one; at the very bottom of the page the last section is active.
//   - The active item gets aria-current="true" and is scrolled into view inside the bar (the bar only, never the page).
//   - A tap scrolls the page smoothly (instantly when the person asked for reduced motion), leaving room for the
//     sticky top bar and this bar, then moves keyboard focus to the section.

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import "./SectionNav.css";

const REDUCED = "(prefers-reduced-motion: reduce)";
const GAP = 8; // breathing room between the bar and the section heading, in px
const POSITION_KEY = "bizkenia-section-nav-position";
const EDGE_GAP = 12;

const matches = (q) => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(q).matches;

function readPosition() {
  if (typeof window === "undefined") return { side: "right", top: null };
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
    if (saved?.side === "left" || saved?.side === "right") {
      return { side: saved.side, top: Number.isFinite(saved.top) ? saved.top : null };
    }
  } catch {
    // Use the default position when storage is unavailable or corrupt.
  }
  return { side: "right", top: null };
}

export default function SectionNav({ items = [], label = "Sections on this page", className = "" }) {
  const [present, setPresent] = useState([]);
  const [picked, setActive] = useState("");
  const [position, setPosition] = useState(readPosition);
  const [dragging, setDragging] = useState(false);
  const navRef = useRef(null);
  const listRef = useRef(null);
  const lockRef = useRef(0); // a tap sets the active item itself; ignore the observer until the smooth scroll settles
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  // Which of the sections are really on the page. Checked after every render of the page that owns the bar, because
  // cards often appear a moment after the page (data loading). The check runs on the next frame, once the page has drawn.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const ids = items.filter((i) => document.getElementById(i.id)).map((i) => i.id);
      setPresent((prev) => (prev.join("|") === ids.join("|") ? prev : ids));
    });
    return () => cancelAnimationFrame(raf);
  });

  const shown = items.filter((i) => present.includes(i.id));
  const visible = shown.length >= 2;
  const shownKey = shown.map((i) => i.id).join("|");
  // The section shown as active: the last one picked, or the first when that one is not on the page (yet).
  const active = shown.some((i) => i.id === picked) ? picked : (shown[0]?.id ?? "");

  /** Pixels the page must leave free at the top: the sticky top bar plus this bar. */
  const offset = useCallback(() => {
    const top = document.querySelector(".shell-topbar")?.getBoundingClientRect().height || 0;
    const bar = navRef.current?.getBoundingClientRect().height || 0;
    return Math.round(top + bar + GAP);
  }, []);

  // Track the section being read.
  useEffect(() => {
    if (!visible) return undefined;
    const ids = shownKey.split("|");
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (els.length < 2 || typeof IntersectionObserver === "undefined") return undefined;

    const inBand = new Set();
    const pick = () => {
      if (Date.now() < lockRef.current) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const next = atBottom && window.scrollY > 0 ? ids[ids.length - 1] : ids.find((id) => inBand.has(id));
      if (next) setActive(next);
    };
    const top = offset();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? inBand.add(e.target.id) : inBand.delete(e.target.id));
      pick();
    }, { rootMargin: `-${top}px 0px -55% 0px`, threshold: 0 });
    els.forEach((el) => io.observe(el));

    let raf = 0;
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pick(); }); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [visible, shownKey, offset]);

  // Keep the active item visible inside the bar. Only the bar scrolls, never the page.
  useEffect(() => {
    const list = listRef.current;
    const btn = list?.querySelector('[aria-current="true"]');
    if (!list || !btn) return;
    const top = btn.offsetTop - (list.clientHeight - btn.offsetHeight) / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: matches(REDUCED) ? "auto" : "smooth" });
  }, [active, visible]);

  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.moved && distance < 6) return;
      drag.moved = true;
      suppressClickRef.current = true;
      event.preventDefault();
      const height = navRef.current?.offsetHeight || 0;
      const top = Math.max(EDGE_GAP + height / 2, Math.min(window.innerHeight - EDGE_GAP - height / 2, event.clientY));
      setPosition((previous) => ({ ...previous, top }));
    };
    const onUp = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const side = event.clientX < window.innerWidth / 2 ? "left" : "right";
      setPosition((previous) => ({ side, top: previous.top }));
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  useEffect(() => {
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)); } catch { /* private mode: position lasts for this visit */ }
  }, [position]);

  function startDrag(event) {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    dragRef.current = { startX: event.clientX, startY: event.clientY, moved: false };
    setDragging(true);
  }

  function handleClick(event) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  function jump(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const reduced = matches(REDUCED);
    const y = el.getBoundingClientRect().top + window.scrollY - offset();
    lockRef.current = Date.now() + (reduced ? 150 : 700);
    setActive(id);
    window.scrollTo({ top: Math.max(0, y), behavior: reduced ? "auto" : "smooth" });
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }

  if (!visible) return null;
  return (
    <nav ref={navRef}
      className={`sec-nav sec-nav--${position.side}${dragging ? " is-dragging" : ""} ${className}`.trim()}
      style={position.top === null ? undefined : { top: `${position.top}px` }}
      aria-label={label}
      onPointerDown={startDrag}
      onClick={handleClick}>
      <ul ref={listRef} className="sec-nav__list">
        {shown.map((i) => (
          <li key={i.id}>
            <button type="button" className={`sec-nav__item${active === i.id ? " is-active" : ""}`}
              aria-current={active === i.id ? "true" : undefined} onClick={() => jump(i.id)}>
              {i.icon && <Icon name={i.icon} size={16} />}
              <span>{i.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
