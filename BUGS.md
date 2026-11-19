# Bugs found

All bugs were reproduced on the unmodified app (Chromium, Argentina time zone, fresh data after `npm run reset`). Every bug has automated Playwright tests in `tests/` whose names start with `[BUG-XX]`; they fail today and must pass once the bug is fixed. Evidence (screenshots and request/response transcripts) is in `evidence/` with the same ID.

**Severity** = damage when it happens (Critical: money lost, data leaked or site down; High: wrong amounts or blocked purchases; Medium: wrong or confusing behavior with a workaround; Low: polish or hardening).
**Priority** = order of the fix, which also weighs how likely users are to hit it. IDs are sorted by priority.

| ID | Bug | Severity | Priority | Source |
|---|---|---|---|---|
| BUG-01 | One malformed checkout request crashes the whole server | Critical | P1 | found by me |
| BUG-02 | Any logged-in user can read other users' orders (name and address leak) | Critical | P1 | found by me |
| BUG-03 | Slow payment shows "failed" but charges; the retry charges twice | Critical | P1 | user report 1 |
| BUG-04 | Checkout accepts 0, negative, fractional and text quantities (negative payments) | Critical | P1 | found by me |
| BUG-05 | Checkout never validates stock (oversell, negative stock) | Critical | P1 | found by me |
| BUG-06 | Coupons stack without limit (totals can go negative) | High | P1 | found by me |
| BUG-07 | Lowercase coupon accepted but gives 0% discount | High | P1 | user report 2 |
| BUG-08 | Product added from the catalog disappears from the cart on reload | High | P1 | user report 3 |
| BUG-09 | Outdated price in the cart: the amount charged differs from the amount shown | High | P1 | found by me |
| BUG-10 | The cart is shared between different users of the same browser | High | P1 | found by me |
| BUG-11 | Cart and payments pages overflow horizontally on phones | Medium | P1 (many users buy from phones) | found by me |
| BUG-12 | No rate limiting on login or payments | High | P2 | found by me |
| BUG-13 | Blank screen when the saved cart has an unexpected shape | Medium | P2 | found by me |
| BUG-14 | Expired session leaves My orders / My payments loading forever | Medium | P2 | found by me |
| BUG-15 | The cart can hold more units than the stock | Medium | P2 | found by me |
| BUG-16 | Rounding loses one cent (3 mugs = $25.04) | Medium | P2 | found by me |
| BUG-17 | Order date uses the UTC day with Argentina time | Medium | P2 | found by me |
| BUG-18 | Valid names and addresses are rejected (accents, apostrophe, &, parentheses) | Medium | P2 | found by me |
| BUG-19 | Accessibility: unlabeled controls, contrast, empty header | Medium | P2 | found by me |
| BUG-20 | Errors are not JSON, unknown API routes return the web page, server errors look like empty results | Low | P3 | found by me |
| BUG-21 | Hardening and polish (grouped) | Low | P3 | found by me |

Where the code points to the cause, it is listed as "Root cause" (optional part of the challenge). Line numbers refer to the unmodified repository.

---

## BUG-01 — One malformed checkout request crashes the whole server

- **Source:** found by me
- **Type:** Logic / Integration
- **Severity:** Critical
- **Priority:** P1. Any logged-in user (or a bug in a client) can take the shop down for everybody with one request; it stays down until someone restarts it.
- **Preconditions:** logged in as any user.
- **Steps to reproduce:**
  1. `POST /api/login` with Ana's credentials and keep the `sid` cookie.
  2. `POST /api/checkout` with `{"items":[null],"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"card":{"number":"4242424242424242"}}`.
  3. `GET /api/products`.
  4. Same effect with `"shipping":{"name":5,"address":5}`.
- **Expected result:** `400` with an error message; the server keeps running.
- **Actual result:** the connection is closed without a response, the Node process exits (`TypeError: Cannot read properties of null (reading 'productId')`) and every later request fails with `ECONNREFUSED`.
- **Evidence:** `evidence/BUG-01-server-crash.txt` (request, result and server log).
- **Automated test:** `tests/zz-server-crash.spec.ts` (runs last on purpose because it stops the server).
- **Root cause in the code (optional):** `app/server/api.ts` line 163 reads `item.productId` and the shipping block calls `shipping.name.trim()` without checking types. Express 4 does not catch errors thrown inside an `async` handler, so the rejection ends the process.

---

## BUG-02 — Any logged-in user can read other users' orders

- **Source:** found by me
- **Type:** Security
- **Severity:** Critical
- **Priority:** P1. Personal data (name and home address) of other customers is exposed, and order ids are sequential and easy to walk.
- **Preconditions:** two users; Ana owns orders #1 and #2, Bruno owns #3.
- **Steps to reproduce:**
  1. Log in as Bruno.
  2. `GET /api/orders/1`. In the app: log in as Ana and open `/orders/3`.
- **Expected result:** `403` or `404`; the app shows an error and no data of the other user.
- **Actual result:** `200` with the full order of the other user, including `shipping.name` and `shipping.address` (screen shows "Ship to: Bruno Diaz, 742 Evergreen St, Rosario"). The list endpoint (`/api/orders`) is filtered correctly, only the detail is not.
- **Evidence:** `evidence/BUG-02-orders-of-other-users.txt`, `evidence/BUG-02-2-ui-other-users-order.png`.
- **Automated test:** `tests/p1-checkout-api.spec.ts`, `tests/p1-checkout-ui.spec.ts` (`[BUG-02]`).
- **Root cause in the code (optional):** `app/server/api.ts` lines 121-127: `GET /orders/:id` finds the order by id and never compares `order.userId` with the logged-in user.

---

## BUG-03 — Slow payment shows "failed" but charges; the retry charges twice

- **Source:** user report 1 ("Sometimes when I pay it says it failed, but I still got charged")
- **Type:** Integration / Logic
- **Severity:** Critical
- **Priority:** P1. Customers are charged without a confirmation and are invited to pay again.
- **Preconditions:** logged in as Ana; a cart with a total above $100 (the simulated processor takes about 4 s for those).
- **Steps to reproduce:**
  1. Add the Ergonomic chair ($129) to the cart, go to checkout, fill in valid data and the card `4242424242424242`.
  2. Click Pay and wait about 4 seconds.
  3. Open My orders and My payments.
  4. Go back to the cart (the chair is still there) and pay again.
- **Expected result:** the user is told the truth: either the payment confirmation, or a failure with no order and no charge. Retrying never charges the same cart twice.
- **Actual result:** after 3 s the page shows "We couldn't process your payment. Please try again." but order #4 and an approved payment of $129.00 exist. The cart is not cleared, so the retry creates a second order: two charges ($258) and the stock goes from 2 to 0. The API also accepts two identical simultaneous checkouts and creates two orders.
- **Evidence:** `evidence/BUG-03-slow-payment-timing.txt`, `evidence/BUG-03-1-payment-processing.png` to `evidence/BUG-03-5-double-charge-after-retry.png`.
- **Automated test:** `tests/p1-checkout-ui.spec.ts` (`[BUG-03]`, two tests).
- **Root cause in the code (optional):** `app/web/src/pages/Checkout.tsx` aborts the request after `PAYMENT_TIMEOUT_MS = 3000` while `app/server/api.ts` line 185 waits 4000 ms and then still creates the order. There is no idempotency key, no duplicate-request protection, and no way for the client to find out what happened after an abort.

---

## BUG-04 — Checkout accepts 0, negative, fractional and text quantities

- **Source:** found by me
- **Type:** Logic / Data
- **Severity:** Critical
- **Priority:** P1. The store can "charge" negative amounts, give away items and corrupt the stock.
- **Preconditions:** logged in.
- **Steps to reproduce:** `POST /api/checkout` with `quantity` set to `0`, `-1`, `1.5`, `"abc"`, `1000000000`; also a negative line mixed with a real one (chair x1 + keyboard x -1) or only `{"productId":6,"quantity":-5}`.
- **Expected result:** `400` for any quantity that is not a positive whole number; stock and payments unchanged.
- **Actual result:** always `201`. `0` creates an approved $0 payment. `-1` makes the stock go up. `"abc"` leaves the stock as `null`. `1000000000` leaves the stock at -999,999,975. Only `keyboard x -5` creates an approved payment of -$449.50. Chair x1 + keyboard x -1 charges $39.10 for a $129 item and adds a unit of stock.
- **Evidence:** `evidence/BUG-04-invalid-quantities.txt`.
- **Automated test:** `tests/p1-checkout-api.spec.ts` (`[BUG-04]`, six tests).
- **Root cause in the code (optional):** `app/server/api.ts` line 168 `const quantity = Number(item.quantity)` with no validation (the web form limits it, the API does not).

---

## BUG-05 — Checkout never validates stock

- **Source:** found by me
- **Type:** Logic / Data
- **Severity:** Critical
- **Priority:** P1. Spec: "Users can't buy more than the available stock". The documented `409 out of stock` is never returned, so the shop sells products it does not have.
- **Preconditions:** logged in; Bluetooth headphones have stock 3, Ergonomic chair stock 2.
- **Steps to reproduce:** `POST /api/checkout` with 5 headphones; or two lines of 2 headphones; or buy all 3 and then 1 more; or send 4 simultaneous purchases of 1 chair.
- **Expected result:** `409` and the stock unchanged; with simultaneous purchases never more than the available units are sold.
- **Actual result:** always `201`; stock becomes -2, -1 and so on. Four simultaneous chair purchases all succeed (stock -2).
- **Evidence:** `evidence/BUG-05-no-stock-validation.txt`.
- **Automated test:** `tests/p1-checkout-api.spec.ts` (`[BUG-05]`, four tests).
- **Root cause in the code (optional):** `app/server/api.ts` checkout subtracts `line.quantity` from `product.stock` without checking it, and does not group repeated products.

---

## BUG-06 — Coupons stack without limit

- **Source:** found by me (related to user report 2)
- **Type:** Logic
- **Severity:** High
- **Priority:** P1. Spec: "only one per purchase". With enough repeated codes the total becomes negative.
- **Preconditions:** a cart; in the app, a coupon already applied.
- **Steps to reproduce:**
  1. API: `POST /api/checkout` with `"coupons":["FLOCK10","BIENVENIDA15"]`, then `["FLOCK10","FLOCK10"]`, then 7 x `BIENVENIDA15` on the $89.90 keyboard.
  2. App: add a product, apply `FLOCK10`, reload the page, apply `BIENVENIDA15`.
- **Expected result:** a second coupon is rejected (`400` on the API, an error message in the app), also after a reload.
- **Actual result:** the API accepts all of them (10% + 15% = 25% off; 7 x 15% gives a total of -$4.53, 10 x 15% gives -$45.00). In the app the rule works until the page is reloaded; afterwards a second coupon is accepted and both are shown (discount -$2.51 on $16.70).
- **Evidence:** `evidence/BUG-06-coupon-stacking.txt`, `evidence/BUG-06-2-second-coupon-blocked-before-reload.png`, `evidence/BUG-06-3-second-coupon-accepted-after-reload.png`.
- **Automated test:** `tests/p1-checkout-api.spec.ts` and `tests/p1-checkout-ui.spec.ts` (`[BUG-06]`).
- **Root cause in the code (optional):** `app/server/api.ts` lines 173-181 loop over every coupon received. `app/web/src/cart.tsx` lines 52 and 79-83 keep the rule in a `useRef` (`couponAppliedRef`) that is not restored from the saved cart.

---

## BUG-07 — Lowercase coupon accepted but gives 0% discount

- **Source:** user report 2 ("The discount code is accepted but the price doesn't change")
- **Type:** Logic
- **Severity:** High
- **Priority:** P1. Spec: "Codes are case-insensitive". Customers are charged without the discount they were told they got.
- **Preconditions:** a cart with 2 Ceramic mugs ($16.70).
- **Steps to reproduce:** apply `flock10` (or `Flock10`, `bienvenida15`) in the cart, then pay.
- **Expected result:** 10% off: discount $1.67, total $15.03.
- **Actual result:** the app says "Coupon flock10 applied (0%)", discount $0.00, and the order is charged $16.70. `POST /api/coupons/validate` returns `{"code":"flock10","percent":0}`.
- **Evidence:** `evidence/BUG-07-coupon-case.txt`, `evidence/BUG-07-2-lowercase-coupon-0-percent.png`.
- **Automated test:** `tests/p1-checkout-api.spec.ts` and `tests/p1-checkout-ui.spec.ts` (`[BUG-07]`).
- **Root cause in the code (optional):** `app/server/api.ts` lines 16-21: `findCoupon` matches the key case-insensitively but returns `COUPONS[typed]` (the text as typed) instead of `COUPONS[key]`.

---

## BUG-08 — Product added from the catalog disappears from the cart on reload

- **Source:** user report 3 ("Some things disappear from my cart when I reload the page")
- **Type:** Logic / Data
- **Severity:** High
- **Priority:** P1. Spec: "The cart persists even if the user closes the browser". It is the first action in the shop and it silently loses what the user chose.
- **Preconditions:** none.
- **Steps to reproduce:**
  1. Open the catalog and click "Add" on any product. The header shows `Cart (1)`.
  2. Reload the page.
- **Expected result:** the header still shows `Cart (1)` and the product is in the cart.
- **Actual result:** `Cart (0)`. Adding from the product detail page does persist, so the same user action behaves differently depending on the page.
- **Evidence:** `evidence/BUG-08-quick-add-lost-after-reload.png`.
- **Automated test:** `tests/p1-cart-ui.spec.ts` (`[BUG-08]`).
- **Root cause in the code (optional):** `app/web/src/pages/Catalog.tsx` line 24 calls `cart.setItems(...)`, which only updates React state; saving to `localStorage` happens only inside `cart.add` (used by the detail page).

---

## BUG-09 — Outdated price in the cart: the amount charged differs from the amount shown

- **Source:** found by me
- **Type:** Logic / Data
- **Severity:** High
- **Priority:** P1. The cart persists between sessions by design, so prices and stock saved there get old. The user pays an amount different from the one displayed.
- **Preconditions:** a saved cart whose price differs from the current one.
- **Steps to reproduce:**
  1. Log in as Ana and add 2 Ceramic mugs. Simulate the price change either with the developer tools (edit `price` inside the `shopnow.cart` entry of localStorage to `5`) or by changing the product price in the data. This is how the automated test does it.
  2. Open the cart and go to checkout; read "Total to pay".
  3. Pay and read the total of the order.
- **Expected result:** the amount shown at checkout is the amount charged (the cart refreshes prices and stock, ideally telling the user what changed).
- **Actual result:** checkout shows $10.00 and the order is charged $16.70. In my exploration, with the product price changed to $10.00 on the server, the cart and checkout showed $16.70 and the order was charged $20.00. The saved stock is also old (`max=25` when the real stock was 1).
- **Evidence:** `evidence/BUG-09-stale-price-charged-different.png`.
- **Automated test:** `tests/p1-checkout-ui.spec.ts` (`[BUG-09]`).
- **Root cause in the code (optional):** `app/web/src/cart.tsx` `mergeItem` (lines 24-30) stores a snapshot of name, price and stock when the product is added and never refreshes it; the checkout total comes from that snapshot while the server recalculates with current prices.

---

## BUG-10 — The cart is shared between different users of the same browser

- **Source:** found by me
- **Type:** Data / Security
- **Severity:** High
- **Priority:** P1. One user sees (and can pay for) what another user put in the cart.
- **Preconditions:** one browser.
- **Steps to reproduce:**
  1. Log in as Ana and add the Mechanical keyboard.
  2. Log out.
  3. Log in as Bruno on the same browser and open the cart.
- **Expected result:** Bruno never sees Ana's items (assumption: the cart belongs to the person; either it is cleared on logout or it is saved per user).
- **Actual result:** Bruno's header shows `Cart (1)` and the cart contains Ana's keyboard. The cart also stays in the browser after logout.
- **Evidence:** `evidence/BUG-10-cart-shared-between-users.png`.
- **Automated test:** `tests/p1-checkout-ui.spec.ts` (`[BUG-10]`).
- **Root cause in the code (optional):** `app/web/src/cart.tsx` uses one global localStorage key (`shopnow.cart`) that does not depend on the user, and logout does not touch it.

---

## BUG-11 — Cart and payments pages overflow horizontally on phones

- **Source:** found by me
- **Type:** UI
- **Severity:** Medium
- **Priority:** P1. A large share of shoppers use phones; the cart is the step right before paying.
- **Preconditions:** a phone-sized window.
- **Steps to reproduce:** set the viewport to 390 x 844 (or 320 x 640), add a product and open `/cart`; log in and open `/payments` at 320 px.
- **Expected result:** no horizontal scrolling.
- **Actual result:** the page is wider than the screen: 142 px of overflow at 390 px, 212 px at 320 px (the header is cut off as well), 16 px on `/payments` at 320 px. All pages are fine from 768 px up.
- **Evidence:** `evidence/BUG-11-1-cart-390px.png`, `evidence/BUG-11-2-cart-320px.png`.
- **Automated test:** `tests/p1-cart-ui.spec.ts` (`[BUG-11]`, three tests).
- **Root cause in the code (optional):** the cart is a table with fixed-width controls (`.table input[type="number"] { width: 72px }`, `app/web/styles.css` line 76) and no responsive layout; at small widths only the Price column is hidden (line 100).

---

## BUG-12 — No rate limiting on login or payments

- **Source:** found by me
- **Type:** Security
- **Severity:** High
- **Priority:** P2. Passwords can be guessed and stolen cards can be tested without any friction.
- **Steps to reproduce:** send 300 wrong-password logins for one account; send 60 checkouts with different card numbers.
- **Expected result:** after a number of failures the API answers `429` (or `423`) for a while.
- **Actual result:** 300 failures in 0.3 s, all `401`, and the correct password still works right after. 60 payment attempts in 0.8 s (30 approved, 30 declined) with no limit.
- **Evidence:** `evidence/BUG-12-no-rate-limiting.txt`.
- **Automated test:** `tests/zy-rate-limit.spec.ts` (`[BUG-12]`, two tests, run late because a fix by address could slow later tests).
- **Root cause in the code (optional):** no limiter in `app/server/api.ts` for `/login` or `/checkout`.

---

## BUG-13 — Blank screen when the saved cart has an unexpected shape

- **Source:** found by me
- **Type:** Logic / UI
- **Severity:** Medium
- **Priority:** P2. The whole app stops rendering and the user cannot recover without clearing site data. A realistic trigger is data written by another version of the app.
- **Steps to reproduce:** in the developer tools set `localStorage["shopnow.cart"]` to `{}` (or `{"items":null,"coupons":null}`, or `[]`) and reload any page.
- **Expected result:** the app ignores the invalid data and starts with an empty cart.
- **Actual result:** completely blank page; console error `Cannot read properties of undefined (reading 'reduce')`. Text that is not valid JSON is handled correctly.
- **Evidence:** `evidence/BUG-13-white-screen-bad-saved-cart.png`.
- **Automated test:** `tests/p1-cart-ui.spec.ts` (`[BUG-13]`).
- **Root cause in the code (optional):** `app/web/src/cart.tsx` lines 10-18 `readStoredCart` returns the parsed JSON without checking its shape; line 98 then calls `items.reduce`.

---

## BUG-14 — Expired session leaves My orders / My payments loading forever

- **Source:** found by me
- **Type:** Logic / UI
- **Severity:** Medium
- **Priority:** P2. Sessions are kept in server memory, so every server restart silently ends all sessions.
- **Preconditions:** logged in.
- **Steps to reproduce:** log in, delete the `sid` cookie (or restart the server), click "My orders" and "My payments". Also try paying with an expired session.
- **Expected result:** the user is sent to log in, or sees an error; the header no longer shows them as logged in.
- **Actual result:** "Loading…" forever and the header still says "Log out (Ana)". Paying with an expired session shows "You need to log in." but stays on the form without redirecting.
- **Evidence:** `evidence/BUG-14-loading-forever-expired-session.png`.
- **Automated test:** `tests/p1-cart-ui.spec.ts` (`[BUG-14]`, two tests).
- **Root cause in the code (optional):** `app/web/src/pages/Orders.tsx` and `Payments.tsx` call the API without a `.catch`; `app/web/src/auth.tsx` only checks `/me` once at startup.

---

## BUG-15 — The cart can hold more units than the stock

- **Source:** found by me
- **Type:** Logic
- **Severity:** Medium
- **Priority:** P2. Spec: "Users can't buy more than the available stock". (BUG-05 is the server side of the same rule.)
- **Steps to reproduce:** on the headphones page (stock 3) choose 3 and click "Add to cart" twice; or click "Add" five times on the headphones in the catalog; open the cart.
- **Expected result:** at most 3 units, or a message that the stock is reached.
- **Actual result:** quantity 6 (detail page) and 5 (catalog) while the input says `max=3`.
- **Evidence:** `evidence/BUG-15-1-five-quick-adds-stock-3.png`, `evidence/BUG-15-2-cart-quantity-5-max-3.png`.
- **Automated test:** `tests/p1-cart-ui.spec.ts` (`[BUG-15]`, two tests).
- **Root cause in the code (optional):** `app/web/src/cart.tsx` `mergeItem` adds the quantity without limiting it to `product.stock`.

---

## BUG-16 — Rounding loses one cent

- **Source:** found by me
- **Type:** Logic
- **Severity:** Medium
- **Priority:** P2. Small amounts, but every total and every order is affected when it happens, and it is a classic money bug.
- **Steps to reproduce:** add 3 Ceramic mugs ($8.35 each) and look at the cart or pay.
- **Expected result:** $25.05 (and $68.10 for 3 mugs + 3 T-shirts).
- **Actual result:** $25.04 (and $68.09). Checking every product with quantities 1 to 10: 5 of 80 line totals are one cent short (mug x3, x6, x9; backpack x3, x6), and the discounts and totals that depend on them are off as well.
- **Evidence:** `evidence/BUG-16-rounding.txt` (includes the exhaustive check), `evidence/BUG-16-rounding-3-mugs-25-04.png`.
- **Automated test:** `tests/p1-checkout-api.spec.ts` and `tests/p1-cart-ui.spec.ts` (`[BUG-16]`).
- **Root cause in the code (optional):** `app/shared/money.ts` line 7 `Math.floor(price * quantity * 100) / 100`: floating point gives 25.049999999999997, which `floor` turns into 25.04. Working in integer cents and rounding to nearest fixes it.

---

## BUG-17 — Order date uses the UTC day with Argentina time

- **Source:** found by me
- **Type:** Logic
- **Severity:** Medium
- **Priority:** P2. Spec: "Dates and times are shown in Argentina time". Orders placed in the evening show the next day.
- **Steps to reproduce:** log in as Ana and open order #2 (created `2026-10-15T02:30:00Z`).
- **Expected result:** `10/14/2026` and `23:30`.
- **Actual result:** "Date: 10/15/2026 · 23:30"; the list also shows 10/15. The date and the time belong to different days.
- **Evidence:** `evidence/BUG-17-order-date.txt`, `evidence/BUG-17-date-15-oct-with-time-23-30.png`.
- **Automated test:** `tests/p1-checkout-api.spec.ts` and `tests/p1-cart-ui.spec.ts` (`[BUG-17]`).
- **Root cause in the code (optional):** `app/server/api.ts` lines 23-28: the time uses the Argentina time zone but the date comes from `iso.slice(0, 10)`, the UTC date.

---

## BUG-18 — Valid names and addresses are rejected

- **Source:** found by me
- **Type:** Logic / UI
- **Severity:** Medium
- **Priority:** P2. The shop targets Argentina: names such as "José Pérez" or addresses with `&`, `'` or parentheses cannot buy. The message is generic ("Please fill in the shipping details.") and does not say what is wrong.
- **Steps to reproduce:** at checkout use the name `José Pérez`, or the address `O'Brien St 5`, `Calle 5 & 6 (2nd floor)`.
- **Expected result:** the order is created.
- **Actual result:** `400` / the red message above. A 600-character address is accepted (no maximum length) and breaks the layout of the order page (about 5,500 px wide); the maximum length is a question for the PO, so it has no automated test.
- **Evidence:** `evidence/BUG-18-shipping-validation.txt`, `evidence/BUG-18-1-accented-name-rejected.png`, `evidence/BUG-18-2-long-address-layout.png`.
- **Automated test:** `tests/p1-checkout-api.spec.ts` and `tests/p1-checkout-ui.spec.ts` (`[BUG-18]`).
- **Root cause in the code (optional):** `app/server/api.ts` line 149 `SAFE_TEXT = /^[A-Za-z0-9 .,#/-]+$/` allows only ASCII letters, digits and a few symbols.

---

## BUG-19 — Accessibility: unlabeled controls, contrast, empty header

- **Source:** found by me
- **Type:** UI
- **Severity:** Medium
- **Priority:** P2. Screen-reader users cannot tell what the category filter and the quantity field are; both are on the purchase path.
- **Steps to reproduce:** scan the pages with an accessibility checker (axe-core) or inspect the controls with a screen reader.
- **Expected result:** every form control has an accessible name; text meets the contrast ratio.
- **Actual result:** `select-name` (critical) on the category filter in the catalog; `label` (critical) on the quantity field in the cart; `color-contrast` (serious) on the category text of the product page; `empty-table-header` (minor) in the cart. Checkout, login, orders and payments have no violations.
- **Evidence:** `evidence/BUG-19-accessibility-scan.txt`.
- **Automated test:** `tests/p1-cart-ui.spec.ts` (`[BUG-19]`, two tests that check accessible names with Playwright roles; axe itself is not a dependency of the repo).
- **Root cause in the code (optional):** `app/web/src/pages/Catalog.tsx` line 39 (`<select>` without label), `app/web/src/pages/Cart.tsx` line 45 (quantity input without label) and line 36 (empty `<th>`).

---

## BUG-20 — Errors are not JSON, unknown API routes return the web page, server errors look like empty results

- **Source:** found by me
- **Type:** Integration / UI
- **Severity:** Low
- **Priority:** P3
- **Steps to reproduce:** `POST /api/login` with the body `{bad` and `Content-Type: application/json`; `GET /api/does-not-exist`. In the app, make `GET /api/products` fail with a 500.
- **Expected result:** a JSON error with `400`; `404` for an unknown API route; the app tells the user that something went wrong.
- **Actual result:** `400` but with an HTML error page; `200` with the HTML of the web app; the catalog says "No products match your search." and the product page says "This product does not exist." when the server fails.
- **Evidence:** `evidence/BUG-20-error-handling.txt`. The screenshot `evidence/BUG-20-catalog-server-error-shown-as-empty.png` was taken by making the browser receive a simulated 500 for the products request (this app never returns a 500 by itself); the behavior comes from the code (`Catalog.tsx` has no error handling).
- **Automated test:** `tests/p3-hardening.spec.ts` (`[BUG-20]`, two API tests; the UI part has no test because it would need a mocked server error, which the rules do not allow).

---

## BUG-21 — Hardening and polish (grouped)

- **Source:** found by me
- **Type:** Security / UI
- **Severity:** Low
- **Priority:** P3
- **Items (each reproduced; evidence in `evidence/BUG-21-hardening-and-polish.txt`):**
  1. `X-Powered-By: Express` is sent on every response.
  2. `coupons` sent as text instead of an array is ignored without any error; login accepts `email` as an array and coupon validation accepts the code as an array.
  3. `POST /api/test/reset` has no authentication (assumed to exist only in the test environment; it would be critical in production).
  4. All pages have the title "ShopNow" and there is no favicon.
  5. `/cart/`, `/product/1/` and `/Orders` show "Page not found".
  6. The cart shows `Discount: -$0.00` when there is no coupon; negative amounts are formatted as `$-16.70`.
  7. The success banner "We sent you a confirmation email" reappears on every reload of the order page (it depends on `?new=1`) and no email is ever sent by the code (see `ANALYSIS.md`).
  8. Search and category filters are lost when going back from a product and are not in the URL.
  9. The card field accepts letters and any length (the server validates) and has no `autocomplete`; the login form shows the same generic message for empty fields; a logged-in user who opens `/login` sees the form again; the `next` parameter of the login is not validated (`/login?next=/nope` ends on "Page not found").
- **Automated test:** `tests/p3-hardening.spec.ts` (`[BUG-21]`: items 1, 4, 5 and 6). The rest are documented only.
