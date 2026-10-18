import { defineConfig } from "vite";
import react            from "@vitejs/plugin-react";
import path             from "path";

// =============================================================================
// vite.config.js
// =============================================================================
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Allows: import Foo from "@/components/Foo"
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    port: 5173,
    // Listen on all network interfaces so a phone on the same Wi-Fi/hotspot
    // can open the dev server via the laptop's IP (Local + Network URLs).
    host: true,
  },

  build: {
    // Raise the chunk warning threshold slightly — several route chunks are
    // legitimately large (charts, modals).
    chunkSizeWarningLimit: 800,

    rollupOptions: {
      output: {
        // Manual chunking: vendor libs, charts, and pages each get their own
        // chunk to improve long-term caching.
        manualChunks: {
          "vendor-react":    ["react", "react-dom", "react-router-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-charts":   ["recharts"],
          "vendor-state":    ["zustand"],
        },
      },
    },
  },

  // Expose env variables that start with VITE_ to the browser bundle.
  envPrefix: "VITE_",
});