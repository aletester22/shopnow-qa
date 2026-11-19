import { test, expect } from "@playwright/test";
import { resetData, USERS } from "./helpers";
import { apiLogin, checkout, stockOf } from "./support";

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test("[BUG-02] a user cannot read another user's order", async ({ request }) => {
  await apiLogin(request, USERS.bruno);
  // Order #1 belongs to Ana.
  const res = await request.get("/api/orders/1");
  expect([403, 404]).toContain(res.status());
});

for (const quantity of [0, -2, 1.5, "abc", null]) {
  test(`[BUG-04] checkout rejects the invalid quantity ${JSON.stringify(quantity)} and keeps the stock`, async ({ request }) => {
    await apiLogin(request);
    const res = await checkout(request, { items: [{ productId: 1, quantity }] });
    expect(res.status()).toBe(400);
    expect(await stockOf(request, 1)).toBe(25);
  });
}

test("[BUG-04] a negative quantity can never produce a negative payment", async ({ request }) => {
  await apiLogin(request);
  await checkout(request, { items: [{ productId: 6, quantity: -5 }] });
  const payments = await (await request.get("/api/payments")).json();
  expect(payments.every((p: { amount: number }) => p.amount > 0)).toBe(true);
});

test("[BUG-05] checkout returns 409 and keeps the stock when the quantity exceeds the stock", async ({ request }) => {
  await apiLogin(request);
  // Bluetooth headphones: stock 3.
  const res = await checkout(request, { items: [{ productId: 2, quantity: 5 }] });
  expect(res.status()).toBe(409);
  expect(await stockOf(request, 2)).toBe(3);
});

test("[BUG-05] the same product repeated in two lines is checked against the stock as a whole", async ({ request }) => {
  await apiLogin(request);
  const res = await checkout(request, { items: [{ productId: 2, quantity: 2 }, { productId: 2, quantity: 2 }] });
  expect(res.status()).toBe(409);
  expect(await stockOf(request, 2)).toBe(3);
});

test("[BUG-05] a sold-out product cannot be bought again", async ({ request }) => {
  await apiLogin(request);
  expect((await checkout(request, { items: [{ productId: 2, quantity: 3 }] })).status()).toBe(201);
  expect((await checkout(request, { items: [{ productId: 2, quantity: 1 }] })).status()).toBe(409);
  expect(await stockOf(request, 2)).toBe(0);
});

test("[BUG-05] simultaneous purchases of the last units never oversell", async ({ request }) => {
  await apiLogin(request);
  // Ergonomic chair: stock 2.
  const results = await Promise.all([1, 2, 3, 4].map(() => checkout(request, { items: [{ productId: 8, quantity: 1 }] })));
  expect(results.filter((r) => r.status() === 201).length).toBeLessThanOrEqual(2);
  expect(await stockOf(request, 8)).toBeGreaterThanOrEqual(0);
});

test("[BUG-06] checkout rejects two different coupons in the same purchase", async ({ request }) => {
  await apiLogin(request);
  const res = await checkout(request, { items: [{ productId: 1, quantity: 1 }], coupons: ["FLOCK10", "BIENVENIDA15"] });
  expect(res.status()).toBe(400);
});

test("[BUG-06] checkout rejects the same coupon repeated, so the total can never go negative", async ({ request }) => {
  await apiLogin(request);
  const res = await checkout(request, { items: [{ productId: 6, quantity: 1 }], coupons: Array(7).fill("BIENVENIDA15") });
  expect(res.status()).toBe(400);
});

test("[BUG-07] the coupon validation is case-insensitive and returns the real percentage", async ({ request }) => {
  const res = await request.post("/api/coupons/validate", { data: { code: "flock10" } });
  expect(res.status()).toBe(200);
  expect((await res.json()).percent).toBe(10);
});

test("[BUG-07] a lowercase coupon is charged with the same discount as the uppercase one", async ({ request }) => {
  await apiLogin(request);
  const res = await checkout(request, { items: [{ productId: 1, quantity: 2 }], coupons: ["flock10"] });
  expect(res.status()).toBe(201);
  const order = await res.json();
  // 2 x $8.35 = $16.70, 10% = $1.67
  expect(order.discount).toBe(1.67);
  expect(order.total).toBe(15.03);
});

test("[BUG-16] the order subtotal of 3 ceramic mugs is $25.05", async ({ request }) => {
  await apiLogin(request);
  const res = await checkout(request, { items: [{ productId: 1, quantity: 3 }] });
  expect(res.status()).toBe(201);
  expect((await res.json()).subtotal).toBe(25.05);
});

test("[BUG-16] 3 mugs + 3 T-shirts add up to $68.10", async ({ request }) => {
  await apiLogin(request);
  const res = await checkout(request, { items: [{ productId: 1, quantity: 3 }, { productId: 3, quantity: 3 }] });
  expect((await res.json()).total).toBe(68.1);
});

test("[BUG-17] the order date is the Argentina date that matches the displayed time", async ({ request }) => {
  await apiLogin(request);
  // Order #2: 2026-10-15T02:30Z = 14 Oct 23:30 in Argentina (UTC-3).
  const orders = await (await request.get("/api/orders")).json();
  const order = orders.find((o: { id: number }) => o.id === 2);
  expect(order.displayTime).toBe("23:30");
  expect(order.displayDate).toBe("10/14/2026");
});

for (const [label, shipping] of [
  ["an accented name", { name: "José Pérez", address: "Av. Corrientes 1234" }],
  ["an apostrophe", { name: "Ana O'Brien", address: "1234 Corrientes Ave" }],
  ["an ampersand and parentheses", { name: "Ana Garcia", address: "Calle 5 & 6 (2nd floor)" }],
] as const) {
  test(`[BUG-18] shipping details with ${label} are accepted`, async ({ request }) => {
    await apiLogin(request);
    const res = await checkout(request, { items: [{ productId: 1, quantity: 1 }], shipping });
    expect(res.status()).toBe(201);
  });
}
