// src/store/cartStore.js — NEW FILE (Phase 5, step 2)
//
// AIM
// The shopping cart. It lives in the browser (localStorage), so a visitor can fill it before signing
// in and it is still there after signing in. One list of lines for every shop; each shop is checked
// out on its own. The stored price is only for showing; checkout reads the real price and stock from
// the database (the cart page refreshes them) and place_order decides the final amounts.
//
//   const lines = useCart((s) => s.linesFor(businessId));
//   useCart.getState().add({ product, shop: { id, slug, name } }, 2);

import { create } from "zustand";

const KEY = "bizkenia.cart.v1";
const MAX_LINES = 50;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((l) => l && l.productId && l.businessId && l.quantity > 0) : [];
  } catch { return []; }
}
function write(lines) { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* private window: the cart lasts for this visit only */ } }

export const useCart = create((set, get) => ({
  lines: read(),
  drawer: false,

  linesFor: (businessId) => get().lines.filter((l) => l.businessId === businessId),
  countFor: (businessId) => get().lines.filter((l) => l.businessId === businessId).reduce((n, l) => n + l.quantity, 0),

  add({ product, shop }, quantity = 1) {
    const q = Math.max(1, Math.floor(Number(quantity) || 1));
    const lines = get().lines.slice();
    const i = lines.findIndex((l) => l.productId === product.id);
    const cap = Math.max(0, Number(product.stock) || 0);
    if (i >= 0) lines[i] = { ...lines[i], quantity: Math.min(cap || 999, lines[i].quantity + q), price: Number(product.price), stock: cap };
    else {
      if (lines.length >= MAX_LINES) return { error: "Your cart is full. Check out or remove something first." };
      lines.push({
        productId: product.id, businessId: shop.id, shopSlug: shop.slug, shopName: shop.name, name: product.name,
        price: Number(product.price), unit: product.unit || "item", image: product.images?.[0] || null, stock: cap, quantity: Math.min(cap || 999, q),
      });
    }
    write(lines); set({ lines });
    return { error: null };
  },

  setQuantity(productId, quantity) {
    const q = Math.floor(Number(quantity) || 0);
    const lines = get().lines.flatMap((l) => (l.productId !== productId ? [l] : q <= 0 ? [] : [{ ...l, quantity: Math.min(q, l.stock || 999) }]));
    write(lines); set({ lines });
  },

  remove(productId) { get().setQuantity(productId, 0); },

  /** Update the stored price, stock and name of lines from fresh database rows; drop products no longer on sale. */
  refresh(rows) {
    const by = new Map(rows.map((r) => [r.id, r]));
    const lines = get().lines.flatMap((l) => {
      const r = by.get(l.productId);
      if (!r) return [l];
      if (r.status !== "active" || r.stock < 1) return [];
      return [{ ...l, name: r.name, price: Number(r.price), stock: r.stock, unit: r.unit || l.unit, image: r.images?.[0] || l.image, quantity: Math.min(l.quantity, r.stock) }];
    });
    write(lines); set({ lines });
  },

  clearShop(businessId) { const lines = get().lines.filter((l) => l.businessId !== businessId); write(lines); set({ lines }); },
  openDrawer() { set({ drawer: true }); },
  closeDrawer() { set({ drawer: false }); },
}));

export const lineTotal = (lines) => lines.reduce((s, l) => s + l.price * l.quantity, 0);
