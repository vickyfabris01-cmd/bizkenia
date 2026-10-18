// Checks that need no database: every public page loads, has the right metadata, is keyboard friendly,
// passes automated accessibility rules, and the install files are in place.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PUBLIC = ["/", "/explore", "/login", "/signup", "/forgot-password"];

for (const path of PUBLIC) {
  test(`${path} loads without crashing and has a title and description`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expect(page).toHaveTitle(/BizKenia|Log|Sign|Explore|Reset|password/i);
    expect((await page.locator('meta[name="description"]').getAttribute("content") || "").length).toBeGreaterThan(20);
    expect(errors).toEqual([]);
  });

  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await page.locator("main").waitFor();
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length} element(s)`)).toEqual([]);
  });

  test(`${path} does not scroll sideways on a phone`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone project only");
    await page.goto(path);
    await page.locator("main").waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}

test("the skip link is the first thing a keyboard user reaches", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard test");
  await page.goto("/");
  await page.locator("main").waitFor(); // wait for the page to finish loading before pressing keys
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /skip to content/i })).toBeFocused();
});

test("private and unknown pages are marked noindex; public ones are not", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.goto("/this-page-does-not-exist");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^(?!.*noindex)/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/$/);
});

test("signed-out visitors are sent to log in from private areas", async ({ page }) => {
  for (const path of ["/app/anything", "/admin", "/orders"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("install files are served", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.ok()).toBe(true);
  const manifest = await m.json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get("/sw.js")).ok()).toBe(true);
  expect((await request.get("/offline.html")).ok()).toBe(true);
  expect(await (await request.get("/robots.txt")).text()).toMatch(/Disallow: \/admin\//);
});

test("the app shell still opens with no connection after one visit", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // let the worker take control and cache the shell
  await context.setOffline(true);
  await page.goto("/");
  await expect(page.locator("#root, h1")).not.toHaveCount(0);
  await context.setOffline(false);
});

test("the theme follows the device when nothing is saved", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
});
