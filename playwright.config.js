// Playwright end-to-end tests. `npm run test:e2e` builds the site, serves it and runs e2e/*.spec.js in Chromium
// (desktop and a phone-sized screen). Set E2E_BASE_URL to test an already-deployed site instead.
import { defineConfig, devices } from "@playwright/test";

const external = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: "e2e/report.json" }]],
  use: { baseURL: external || "http://localhost:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 5"] } },
  ],
  webServer: external ? undefined : { command: "npm run build && npm run preview -- --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: !process.env.CI, timeout: 180000 },
});
