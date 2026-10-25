// src/lib/brandStudio/icons/shop.js — NEW FILE
//
// AIM
// Eight shopping symbols: a bag, trolley, kiosk, basket, price tag, storefront, parcel and market
// scale. Same rules as agriculture.js: drawn in a 60 x 60 box centred on 0,0, with
// draw(c, plain) and an optional letter slot.
// Order is part of the v1 pool: never reorder or remove, only add at the end.

import { circle, solid, stroke } from "../svgKit.js";

export const SHOP = [
  {
    name: "Bag",
    slot: { x: 0, y: 10, s: 20 },
    draw: (c, plain) =>
      solid(c.fill, "M-24-10H24L20 29H-20Z") +
      stroke(c.fill, "M-10-10V-17A10 10 0 0 1 10-17V-10", 4.5) +
      (plain ? "" : stroke(c.cut, "M-8 6Q0 14 8 6", 3)),
  },
  {
    name: "Trolley",
    slot: { x: 5, y: -1, s: 15 },
    draw: (c, plain) =>
      solid(c.fill, "M-20-14H30L24 10H-14Z") +
      stroke(c.fill, "M-31-24H-23L-13 16H22", 4.5) +
      solid(c.fill, circle(-8, 24, 4.5)) +
      solid(c.fill, circle(16, 24, 4.5)) +
      (plain ? "" : stroke(c.cut, "M-6-14L-4 10M7-14V10M20-14L18 10", 2.4)),
  },
  {
    name: "Kiosk",
    slot: { x: 0, y: 8, s: 16 },
    draw: (c, plain) =>
      solid(c.fill, "M-30-8L-20-27H20L30-8Q22-1 15-8Q7.5-1 0-8Q-7.5-1-15-8Q-22-1-30-8Z") +
      solid(c.fill, "M-22-4V29H22V-4Z") +
      solid(c.fill, "M-28 15H28V21H-28Z") +
      (plain ? "" : stroke(c.cut, "M-14 2H14V11H-14Z", 2.8) + stroke(c.cut, "M-10-24L-13-12M0-24V-12M10-24L13-12", 2.2)),
  },
  {
    name: "Basket",
    slot: { x: 0, y: 13, s: 16 },
    draw: (c, plain) =>
      solid(c.fill, "M-27-2H27L21 27H-21Z") +
      stroke(c.fill, "M-19-2C-19-26 19-26 19-2", 4.5) +
      (plain ? "" : stroke(c.cut, "M-24 8H24M-20 18H20M-9-2V27M9-2V27", 2.4)),
  },
  {
    name: "Price tag",
    slot: { x: 0, y: 0, s: 19 },
    draw: (c, plain) =>
      solid(c.fill, "M-29-24H9L31 0L9 24H-29Z") +
      stroke(c.cut, "M-20 0h.01", 7),
  },
  {
    name: "Storefront",
    slot: { x: 0, y: 12, s: 17 },
    draw: (c, plain) =>
      solid(c.fill, "M-31-6L-24-25H24L31-6Z") +
      solid(c.fill, "M-26-6V29H26V-6Z") +
      (plain ? "" : stroke(c.cut, "M-12-25L-14-6M0-25V-6M12-25L14-6", 2.4) + stroke(c.cut, "M-16 29V10H-4V29", 3) + stroke(c.cut, "M5 11H21V20H5Z", 2.8)),
  },
  {
    name: "Parcel",
    slot: null,
    draw: (c, plain) =>
      solid(c.fill, "M0-29L27-15V15L0 29L-27 15V-15Z") +
      (plain ? "" : stroke(c.cut, "M-27-15L0 0L27-15M0 0V29", 3)),
  },
  {
    name: "Scale",
    slot: null,
    draw: (c) =>
      solid(c.fill, "M-2.5-22H2.5V24H-2.5Z") +
      solid(c.fill, "M-14 29H14L10 23H-10Z") +
      solid(c.fill, "M-29-17H29V-12H-29Z") +
      solid(c.fill, circle(0, -25, 4.5)) +
      solid(c.fill, "M-33 5H-11Q-13 15-22 15Q-31 15-33 5Z") +
      solid(c.fill, "M11 5H33Q31 15 22 15Q13 15 11 5Z") +
      stroke(c.fill, "M-29-14L-33 5M-29-14L-11 5M29-14L11 5M29-14L33 5", 2),
  },
];
