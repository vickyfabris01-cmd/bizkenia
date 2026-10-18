// src/modules/index.js — MODIFIED FILE (Phase 5: shop module)
//
// The entry point for the module registry. Importing it loads every business-type module so
// each one registers itself. Add a line here when a new module is created (Phase 4: agriculture,
// Phase 5: shop). Code outside src/modules imports from here, never from registry.js directly.

import "./rental/index.js";
import "./agriculture/index.js";
import "./shop/index.js";

export * from "./registry.js";
