import { test, expect } from "@playwright/test";
import { login, resetData, USERS } from "./helpers";
import { addFromDetail, fillCheckout, seedCart } from "./support";

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test("[BUG-02] opening another user's order in the app shows an error, not their data", async ({ page }) => {
  await login(page);
  // Order #3 belongs to Bruno.
  await page.goto("/orders/3");
  await expect(page.getByTestId("order-error")).toBeVisible();
  await expect(page.getByTestId("order-shipping")).toHaveCount(0);
});

test("[BUG-03] the app never reports a failed payment when the payment was actually charged", async ({ page }) => {
  await login(page);
  // Ergonomic chair ($129): totals above $100 make the payment processor slow (about 4 s).
  await addFromDetail(page, 8);
  await page.goto("/checkout");
  await fillCheckout(page);
  const ordersBefore = (await (await page.request.get("/api/orders")).json()).length;
  await page.getByTestId("pay-button").click();
  await expect(page.getByTestId("order-success").or(page.getByTestId("checkout-error"))).toBeVisible({ timeout: 15_000 });
  // Give a slow processor time to finish, then compare what the user was told with what happened.
  await page.waitForTimeout(3000);
  const ordersAfter = (await (await page.request.get("/api/orders")).json()).length;
  if (await page.getByTestId("checkout-error").isVisible()) {
    expect(ordersAfter).toBe(ordersBefore);
  } else {
    expect(ordersAfter).toBe(ordersBefore + 1);
  }
});

test("[BUG-03] retrying after an error can never charge the same cart twice", async ({ page }) => {
  await login(page);
  await addFromDetail(page, 8);
  await page.goto("/checkout");
  await fillCheckout(page);
  await page.getByTestId("pay-button").click();
  await expect(page.getByTestId("order-success").or(page.getByTestId("checkout-error"))).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(3000);
  if (await page.getByTestId("checkout-error").isVisible()) {
    await page.getByTestId("pay-button").click();
    await page.waitForTimeout(6000);
  }
  const payments = await (await page.request.get("/api/payments")).json();
  // Ana starts with 2 payments; one chair order adds exactly one.
  expect(payments.length).toBe(3);
});

test("[BUG-06] a second coupon is rejected even after reloading the page", async ({ page }) => {
  await page.goto("/product/1");
  await page.getByTestId("add-to-cart").click();
  await page.goto("/cart");
  await page.getByTestId("coupon-input").fill("FLOCK10");
  await page.getByTestId("coupon-apply").click();
  await expect(page.getByTestId("coupon-applied")).toHaveCount(1);
  await page.reload();
  await page.getByTestId("coupon-input").fill("BIENVENIDA15");
  await page.getByTestId("coupon-apply").click();
  await expect(page.getByTestId("coupon-error")).toBeVisible();
  await expect(page.getByTestId("coupon-applied")).toHaveCount(1);
});

test("[BUG-07] a lowercase coupon applies the same discount as the uppercase one in the cart", async ({ page }) => {
  await addFromDetail(page, 1, 2);
  await page.goto("/cart");
  await page.getByTestId("coupon-input").fill("flock10");
  await page.getByTestId("coupon-apply").click();
  await expect(page.getByTestId("coupon-applied")).toBeVisible();
  // 2 x $8.35 = $16.70, 10% = $1.67
  await expect(page.getByTestId("cart-discount")).toHaveText("-$1.67");
  await expect(page.getByTestId("cart-total")).toHaveText("$15.03");
});

test("[BUG-09] the total shown at checkout is the amount that is charged, even with an outdated cart", async ({ page }) => {
  // The cart was saved when the mug cost $5.00; today it costs $8.35.
  await seedCart(page, JSON.stringify({ items: [{ productId: 1, name: "Ceramic mug", price: 5, stock: 25, quantity: 2 }], coupons: [] }));
  await login(page);
  await page.getByTestId("nav-cart").click();
  await page.getByTestId("go-to-checkout").click();
  const shownAtCheckout = (await page.getByTestId("checkout-total").textContent())?.trim();
  await fillCheckout(page);
  await page.getByTestId("pay-button").click();
  await expect(page.getByTestId("order-total")).toBeVisible({ timeout: 10_000 });
  const charged = (await page.getByTestId("order-total").textContent())?.trim();
  expect(charged).toBe(shownAtCheckout);
});

test("[BUG-18] the checkout form accepts an accented name and an apostrophe in the address", async ({ page }) => {
  await login(page);
  await addFromDetail(page, 1);
  await page.goto("/checkout");
  await fillCheckout(page, "José Pérez", "O'Brien St 5");
  await page.getByTestId("pay-button").click();
  await expect(page.getByTestId("order-success")).toBeVisible({ timeout: 10_000 });
});

test("[BUG-10] a user never sees the cart of the previous user in the same browser", async ({ page }) => {
  await login(page, USERS.ana);
  await addFromDetail(page, 6);
  await expect(page.getByTestId("nav-cart")).toContainText("Cart (1)");
  await page.getByTestId("logout").click();
  await login(page, USERS.bruno);
  await expect(page.getByTestId("nav-cart")).toContainText("Cart (0)");
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line-6")).toHaveCount(0);
});
