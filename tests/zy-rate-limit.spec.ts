// Runs near the end on purpose: a fix that throttles by address could also slow down later logins.
import { test, expect } from "@playwright/test";
import { resetData } from "./helpers";
import { apiLogin, checkout } from "./support";

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test("[BUG-12] repeated failed logins are throttled", async ({ request }) => {
  let throttled = false;
  for (let i = 0; i < 60 && !throttled; i++) {
    const res = await request.post("/api/login", { data: { email: "attacker@shopnow.test", password: `wrong-${i}` } });
    throttled = [423, 429].includes(res.status());
  }
  expect(throttled).toBe(true);
});

test("[BUG-12] a burst of payment attempts with declined cards is throttled", async ({ request }) => {
  await apiLogin(request);
  const results = await Promise.all(
    Array.from({ length: 40 }, (_, i) => checkout(request, { items: [{ productId: 1, quantity: 1 }], card: { number: `40000000000${String(i).padStart(2, "0")}0000`.slice(0, 16) } })),
  );
  expect(results.some((r) => [423, 429].includes(r.status()))).toBe(true);
});
