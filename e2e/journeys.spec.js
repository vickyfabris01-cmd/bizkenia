// Full journeys against a REAL backend (a test Supabase project, never production data).
// They are skipped unless these are set, because they create orders and sign in:
//   E2E_BASE_URL     a site built with that project's VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
//   E2E_SHOP_SLUG    an active shop with at least one product in stock
//   E2E_USER_EMAIL / E2E_USER_PASSWORD   an ordinary customer account
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD an admin account (optional)
import { test, expect } from "@playwright/test";

const { E2E_SHOP_SLUG: SHOP, E2E_USER_EMAIL: USER, E2E_USER_PASSWORD: PASS, E2E_ADMIN_EMAIL: ADMIN, E2E_ADMIN_PASSWORD: APASS } = process.env;

async function login(page, email, password) {
  await page.goto("/login");
  await page.getByLabel(/email|phone/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe("shop customer", () => {
  test.skip(!SHOP, "E2E_SHOP_SLUG not set");

  test("browse, add to cart and reach checkout", async ({ page }) => {
    await page.goto(`/b/${SHOP}`);
    await page.getByRole("link", { name: /products|shop|browse/i }).first().click();
    await page.getByRole("link").filter({ hasText: /KSh/ }).first().click();
    await page.getByRole("button", { name: /add to cart/i }).click();
    await page.goto(`/b/${SHOP}/checkout`);
    await expect(page).toHaveURL(/\/(login|b\/.*\/checkout)/);
  });

  test("signed in: place a pay-on-delivery order and see it in My orders", async ({ page }) => {
    test.skip(!USER || !PASS, "customer credentials not set");
    await login(page, USER, PASS);
    await page.goto(`/b/${SHOP}/browse`);
    await page.getByRole("link").filter({ hasText: /KSh/ }).first().click();
    await page.getByRole("button", { name: /add to cart/i }).click();
    await page.goto(`/b/${SHOP}/checkout`);
    await page.getByLabel(/name/i).first().fill("E2E Tester");
    await page.getByLabel(/phone/i).first().fill("0712345678");
    await page.getByRole("button", { name: /place order/i }).click();
    await expect(page).toHaveURL(/\/orders\//);
  });
});

test.describe("platform admin", () => {
  test.skip(!ADMIN || !APASS, "admin credentials not set");
  test("can open transactions, audit log and app errors", async ({ page }) => {
    await login(page, ADMIN, APASS);
    for (const [path, heading] of [["/admin/transactions", /transactions/i], ["/admin/audit", /audit log/i], ["/admin/errors", /app errors/i]]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    }
  });
});

test("an ordinary customer cannot open the admin area", async ({ page }) => {
  test.skip(!USER || !PASS, "customer credentials not set");
  await login(page, USER, PASS);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin$/);
});
