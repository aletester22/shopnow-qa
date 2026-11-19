import { test, expect } from "@playwright/test";
import { login, resetData } from "./helpers";
import { addFromDetail, seedCart } from "./support";

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test("[BUG-08] a product added from the catalog is still in the cart after reloading", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("quick-add-1").click();
  await expect(page.getByTestId("nav-cart")).toContainText("Cart (1)");
  await page.reload();
  await expect(page.getByTestId("nav-cart")).toContainText("Cart (1)");
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line-1")).toBeVisible();
});

for (const width of [320, 390]) {
  test(`[BUG-11] the cart page fits a ${width}px wide phone without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await addFromDetail(page, 1);
    await page.goto("/cart");
    await expect(page.getByTestId("cart-line-1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
}

test("[BUG-11] the payments page fits a 320px wide phone without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await login(page);
  await page.getByTestId("nav-payments").click();
  await expect(page.getByTestId("payment-row-1")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test("[BUG-13] the app still renders when the saved cart has an unexpected shape", async ({ page }) => {
  await seedCart(page, "{}");
  await page.goto("/");
  await expect(page.getByTestId("search-input")).toBeVisible();
});

test("[BUG-15] the cart cannot hold more units than the stock when adding from the detail page twice", async ({ page }) => {
  // Bluetooth headphones: stock 3.
  await page.goto("/product/2");
  await page.getByTestId("quantity-select").selectOption("3");
  await page.getByTestId("add-to-cart").click();
  await page.getByTestId("add-to-cart").click();
  await page.goto("/cart");
  expect(Number(await page.getByTestId("cart-qty-2").inputValue())).toBeLessThanOrEqual(3);
});

test("[BUG-15] the cart cannot hold more units than the stock when using the catalog quick-add", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 5; i++) await page.getByTestId("quick-add-2").click();
  await page.getByTestId("nav-cart").click();
  expect(Number(await page.getByTestId("cart-qty-2").inputValue())).toBeLessThanOrEqual(3);
});

test("[BUG-16] the line total of 3 ceramic mugs is $25.05 in the cart", async ({ page }) => {
  await addFromDetail(page, 1, 3);
  await page.goto("/cart");
  // 3 x $8.35 = $25.05
  await expect(page.getByTestId("cart-line-total-1")).toHaveText("$25.05");
  await expect(page.getByTestId("cart-total")).toHaveText("$25.05");
});

test("[BUG-14] an expired session does not leave My orders loading forever", async ({ page, context }) => {
  await login(page);
  await context.clearCookies();
  await page.getByTestId("nav-orders").click();
  await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 4000 });
});

test("[BUG-14] an expired session does not leave My payments loading forever", async ({ page, context }) => {
  await login(page);
  await context.clearCookies();
  await page.getByTestId("nav-payments").click();
  await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 4000 });
});

test("[BUG-17] the order page shows the Argentina date that matches the displayed time", async ({ page }) => {
  await login(page);
  // Order #2: 2026-10-15T02:30Z = 14 Oct 23:30 in Argentina (UTC-3).
  await page.goto("/orders/2");
  await expect(page.getByTestId("order-date")).toContainText("23:30");
  await expect(page.getByTestId("order-date")).toContainText("10/14/2026");
  await page.goto("/orders");
  await expect(page.getByTestId("order-row-2")).toContainText("10/14/2026");
});

test("[BUG-19] the category filter has an accessible name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: /categor/i })).toBeVisible();
});

test("[BUG-19] the quantity field in the cart has an accessible name", async ({ page }) => {
  await addFromDetail(page, 1);
  await page.goto("/cart");
  await expect(page.getByRole("spinbutton", { name: /quantity/i })).toBeVisible();
});
