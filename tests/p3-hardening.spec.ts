import { test, expect } from "@playwright/test";
import { resetData } from "./helpers";
import { addFromDetail } from "./support";

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test("[BUG-20] a malformed JSON body gets a JSON error with status 400", async ({ request }) => {
  const res = await request.post("/api/login", { data: "{bad", headers: { "Content-Type": "application/json" } });
  expect(res.status()).toBe(400);
  expect(res.headers()["content-type"]).toContain("application/json");
});

test("[BUG-20] an unknown API route returns 404 instead of the web page", async ({ request }) => {
  const res = await request.get("/api/does-not-exist");
  expect(res.status()).toBe(404);
});

test("[BUG-21] the API does not advertise the server technology", async ({ request }) => {
  const res = await request.get("/api/products");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});

test("[BUG-21] each page has its own title", async ({ page }) => {
  await page.goto("/cart");
  await expect(page).toHaveTitle(/cart/i);
});

test("[BUG-21] a trailing slash in the URL still opens the cart", async ({ page }) => {
  await addFromDetail(page, 1);
  await page.goto("/cart/");
  await expect(page.getByTestId("cart-line-1")).toBeVisible();
});

test("[BUG-21] the cart does not show a negative zero discount when there is no coupon", async ({ page }) => {
  await addFromDetail(page, 1);
  await page.goto("/cart");
  await expect(page.getByTestId("cart-discount")).not.toHaveText("-$0.00");
});
