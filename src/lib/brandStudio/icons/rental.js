// src/lib/brandStudio/icons/rental.js — NEW FILE
//
// AIM
// Eight property symbols, each a different kind of home or building. Same rules as agriculture.js:
// drawn in a 60 x 60 box centred on 0,0, with draw(c, plain) and an optional letter slot.
// Order is part of the v1 pool: never reorder or remove, only add at the end.

import { circle, solid, stroke, dots } from "../svgKit.js";

// window dashes laid out in a grid (used by the apartment block and the high-rise)
const windows = (cols, rows, len = 5) =>
  rows.map((y) => cols.map((x) => `M${x} ${y}h${len}`).join("")).join("");

export const RENTAL = [
  {
    name: "House",
    slot: { x: 0, y: 3, s: 21 },
    draw: (c, plain) =>
      solid(c.fill, "M-31-2L0-29L31-2H23V28H-23V-2Z") + (plain ? "" : stroke(c.cut, "M-6 28V14H6V28", 3) + stroke(c.cut, "M-15 3h6M9 3h6", 3.5)),
  },
  {
    name: "Apartments",
    slot: { x: 0, y: -1, s: 23 },
    draw: (c, plain) =>
      solid(c.fill, "M-19-29H19V29H-19Z") +
      (plain ? "" : stroke(c.cut, windows([-11, 4], [-21, -11, -1, 9]), 4.5) + stroke(c.cut, "M-4 29V19H4V29", 3)),
  },
  {
    name: "Bungalow",
    slot: { x: 0, y: 12, s: 18 },
    draw: (c, plain) =>
      solid(c.fill, "M-31-3L-22-17H22L31-3Z") +
      solid(c.fill, "M-25-3H25V26H-25Z") +
      (plain ? "" : stroke(c.cut, "M-13-15L-15-5M0-15V-5M13-15L15-5", 2.4) + stroke(c.cut, "M-4 26V10H4V26", 3) + stroke(c.cut, "M-19 7h7M12 7h7", 4)),
  },
  {
    name: "Townhouses",
    slot: { x: 0, y: 7, s: 17 },
    draw: (c, plain) =>
      solid(c.fill, "M-31 29V0L-21.5-9L-12 0V29Z") +
      solid(c.fill, "M-10 29V-8L0-26L10-8V29Z") +
      solid(c.fill, "M12 29V0L21.5-9L31 0V29Z") +
      (plain ? "" : dots(c.cut, [[-21.5, 8], [0, -3], [21.5, 8]], 4.5) + stroke(c.cut, "M-25 29V20H-18V29M-3.5 29V19H3.5V29M18 29V20H25V29", 2.6)),
  },
  {
    name: "High-rise",
    slot: { x: -7, y: -4, s: 20 },
    draw: (c, plain) =>
      solid(c.fill, "M-17-30H3V29H-17Z") +
      solid(c.fill, "M5-8H23V29H5Z") +
      (plain ? "" : stroke(c.cut, windows([-12, -4], [-22, -12, -2, 8, 18], 4), 3.6) + stroke(c.cut, windows([10, 16], [0, 10, 20], 3), 3.6)),
  },
  {
    name: "Key",
    slot: { x: -14, y: 1, s: 19 },
    draw: (c, plain) =>
      solid(c.fill, circle(-14, 0, 14)) +
      solid(c.fill, "M-2-3.5H30V3.5H-2Z") +
      solid(c.fill, "M18 3H23V14H18Z") +
      solid(c.fill, "M25 3H30V11H25Z") +
      (plain ? "" : dots(c.cut, [[-14, 0]], 12)),
  },
  {
    name: "Door",
    slot: { x: 0, y: -4, s: 22 },
    draw: (c, plain) =>
      solid(c.fill, "M-18 29V-9Q-18-29 0-29Q18-29 18-9V29Z") +
      (plain ? "" : stroke(c.cut, "M-10 29V-7Q-10-20 0-20Q10-20 10-7V29", 2.4) + dots(c.cut, [[7, 11]], 5)),
  },
  {
    name: "Compound",
    slot: null,
    draw: (c, plain) =>
      solid(c.fill, "M-31 29V-8H-19V29Z") +
      solid(c.fill, "M19 29V-8H31V29Z") +
      solid(c.fill, "M-33-8H-17V-14H-33Z") +
      solid(c.fill, "M17-8H33V-14H17Z") +
      solid(c.fill, "M-14-4L0-20L14-4Z") +
      solid(c.fill, "M-11-4H11V14H-11Z") +
      stroke(c.fill, "M-14 29V17M-7 29V17M0 29V17M7 29V17M14 29V17", 3) +
      (plain ? "" : stroke(c.cut, "M-3 14V4H3V14", 2.6)),
  },
];
