// Runs LAST on purpose: on the current app these requests kill the server process.
import { test, expect } from "@playwright/test";
import { resetData } from "./helpers";
import { apiLogin, checkout } from "./support";

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test("[BUG-01] malformed checkout bodies are rejected with 400 and do not crash the server", async ({ request }) => {
  await apiLogin(request);

  const nullItem = await checkout(request, { items: [null] }).catch(() => null);
  expect(nullItem?.status()).toBe(400);
  expect((await request.get("/api/products").catch(() => null))?.ok()).toBeTruthy();

  const badShipping = await checkout(request, { items: [{ productId: 1, quantity: 1 }], shipping: { name: 5, address: 5 } }).catch(() => null);
  expect(badShipping?.status()).toBe(400);
  expect((await request.get("/api/products").catch(() => null))?.ok()).toBeTruthy();
});
