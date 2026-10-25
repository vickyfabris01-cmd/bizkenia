// src/lib/brandStudio/icons/index.js — NEW FILE
//
// AIM
// The symbol set for each business type. Types that are not listed (a future type, or bad data)
// use the neutral GENERIC set, so a logo can always be drawn.

import { solid } from "../svgKit.js";
import { AGRICULTURE } from "./agriculture.js";
import { RENTAL } from "./rental.js";
import { SHOP } from "./shop.js";

const star = (c) => solid(c.fill, "M0-30L9-10L31-9L14 6L20 29L0 17L-20 29L-14 6L-31-9L-9-10Z");
const GENERIC = Array.from({ length: 8 }, () => ({ name: "Star", slot: { x: 0, y: 3, s: 16 }, draw: star }));

export const ICON_SETS = { rental: RENTAL, agriculture: AGRICULTURE, shop: SHOP };
export const ICON_COUNT = 8;
export const iconSet = (type) => ICON_SETS[type] || GENERIC;
