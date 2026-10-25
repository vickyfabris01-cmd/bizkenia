// src/lib/brandStudio/icons/agriculture.js — NEW FILE
//
// AIM
// Eight farm symbols. Each is drawn in a 60 x 60 box centred on 0,0 (so -30 to 30).
//   draw(c, plain)  returns SVG. c = { fill, cut, acc }: fill is the symbol colour, cut is the colour
//                   of the thin detail lines (it should match what the symbol sits on), acc is an accent.
//                   plain = true leaves out the detail lines, so a letter can sit on the symbol.
//   slot            where an initial can be written on the symbol: { x, y, s } (s = font size), or null.
// Order is part of the v1 pool: never reorder or remove, only add at the end.

import { circle, solid, stroke, dots } from "../svgKit.js";

export const AGRICULTURE = [
  {
    name: "Leaf",
    slot: { x: 1, y: -2, s: 17 },
    draw: (c, plain) =>
      solid(c.fill, "M-25 21C-30-10-8-30 26-27C28 4 8 27-25 21Z") +
      (plain ? "" : stroke(c.cut, "M-22 19Q-3 3 17-18M-9 8L-11-5M3-3L15 0", 3)),
  },
  {
    name: "Tree",
    slot: { x: 0, y: -8, s: 20 },
    draw: (c, plain) =>
      solid(c.fill, "M0-29C-15-29-26-18-23-6C-29 2-21 14-9 14L-9 29H9L9 14C21 14 29 2 23-6C26-18 15-29 0-29Z") +
      (plain ? "" : stroke(c.cut, "M0 14V1M0 8L-8-1M0 4L8-5", 3)),
  },
  {
    name: "Tractor",
    slot: { x: 12, y: 5, s: 13 },
    draw: (c, plain) =>
      solid(c.fill, circle(-14, 12, 15)) +
      solid(c.fill, circle(20, 19, 9)) +
      solid(c.fill, "M-27 0V-24H-4V0Z") +
      solid(c.fill, "M-6-2H28V12H-6Z") +
      solid(c.fill, "M14-22H19V-2H14Z") +
      (plain ? "" : dots(c.cut, [[-14, 12]], 7) + dots(c.cut, [[20, 19]], 4.5) + stroke(c.cut, "M-22-19H-9V-8H-22Z", 2.5)),
  },
  {
    name: "Jembe",
    slot: null,
    draw: (c, plain) =>
      solid(c.fill, "M8-13L13-8L-22.5 27.5L-27.5 22.5Z") +
      solid(c.fill, "M6-31L31-6L23 2L-2-23Z") +
      (plain ? "" : stroke(c.cut, "M9-22L22-9", 2.5)),
  },
  {
    name: "Maize",
    slot: { x: 0, y: 1, s: 17 },
    draw: (c, plain) =>
      solid(c.fill, "M0-29C10-29 14-12 14 2C14 18 8 26 0 28C-8 26-14 18-14 2C-14-12-10-29 0-29Z") +
      solid(c.fill, "M-2 30C-18 25-27 10-25-9C-14-1-8 12-2 30Z") +
      solid(c.fill, "M2 30C18 25 27 10 25-9C14-1 8 12 2 30Z") +
      (plain ? "" : dots(c.cut, [[-4, -17], [4, -17], [-5, -9], [0, -9], [5, -9], [-5, -1], [0, -1], [5, -1], [-4, 7], [4, 7]], 3.2)),
  },
  {
    name: "Seedling",
    slot: null,
    draw: (c, plain) =>
      solid(c.fill, "M-2.2 30H2.2V5H-2.2Z") +
      solid(c.fill, "M-2 11C-24 13-31-8-28-21C-10-21-2-9-2 11Z") +
      solid(c.fill, "M2 5C22 7 31-12 27-27C10-27 2-15 2 5Z") +
      solid(c.fill, "M-20 30Q0 19 20 30Z") +
      (plain ? "" : stroke(c.cut, "M-23-16L-9 0M22-22L9-4", 2.5)),
  },
  {
    name: "Cow",
    slot: { x: 0, y: 4, s: 15 },
    draw: (c, plain) =>
      solid(c.fill, "M-15-12C-15-20-8-23 0-23C8-23 15-20 15-12L19 14C19 24 10 29 0 29C-10 29-19 24-19 14Z") +
      solid(c.fill, "M-15-9L-30-14L-28-3L-16 1Z") +
      solid(c.fill, "M15-9L30-14L28-3L16 1Z") +
      solid(c.fill, "M-11-21C-16-29-23-29-27-24C-22-24-18-21-11-15Z") +
      solid(c.fill, "M11-21C16-29 23-29 27-24C22-24 18-21 11-15Z") +
      (plain ? "" : dots(c.cut, [[-8, -4], [8, -4]], 4) + dots(c.cut, [[-4, 20], [4, 20]], 3.2) + stroke(c.cut, "M-10 14Q0 24 10 14", 2.4)),
  },
  {
    name: "Field",
    slot: { x: 0, y: 18, s: 13 },
    draw: (c, plain) =>
      solid(c.fill, circle(0, -14, 9)) +
      solid(c.fill, "M-31 29L-23 4H23L31 29Z") +
      (plain ? "" : stroke(c.cut, "M-11 29L-8 4M11 29L8 4M0 29V4M-27 17H27", 2.6)),
  },
];
