# Spec analysis

Sources: `SPEC.md`, `USER_REPORTS.md`, the code, and running the app. Questions are ordered by how much money or trust depends on the answer. Until the PO answers, the "assumption" next to each one is what the tests and `BUGS.md` rely on.

## Questions for the PO (prioritized)

### Must answer first

1. **Confirmation email (cannot be verified here).** The order page says "We sent you a confirmation email", but nothing in the code sends one and this environment has no mail service. Is the email part of the product? If yes: when is it sent (after payment approved), to which address, and what happens if sending fails? *Assumption:* it is expected, I could not test it, and the banner must not claim it if it is not sent (BUG-21).
2. **Stock rules.** Is stock reserved when the item is in the cart, or only decided at payment? What should the user see when two people buy the last unit (the API should answer `409`; what text)? Is there a per-customer limit? The quantity selector stops at 10 in the UI: is 10 the real maximum? *Assumption:* stock is checked at payment, never below 0, `409` on conflict (BUG-05, BUG-15).
3. **Slow or failed payments.** What is the maximum time the user waits? If the processor answers late, who wins (the order or the "failed" message)? Should a retry ever create a second charge? Is there a refund process for double charges already made? *Assumption:* one cart = one charge, the user is told the real result (BUG-03).
4. **Coupons.** One per purchase (spec): confirmed also for the same code twice? Is `BIENVENIDA15` for first purchases only (once per customer)? Is the discount rounded to cents up, down or to nearest? Minimum total after discount? *Assumption:* exactly one coupon, case-insensitive, nearest cent (BUG-06, BUG-07, BUG-16).
5. **Whose cart is it?** *Answered by the user (QA lead) during this work:* a user must never see another user's cart; a shared cart would be a separate feature. Also open: should a guest cart be merged into the account cart on login? *Assumption:* the cart belongs to the person (BUG-10).

### Important

6. **Price or stock changes while the product is in a saved cart.** Which price wins (the current one)? Should the user be warned about what changed? *Assumption:* the current price is charged and shown before paying (BUG-09).
7. **Dates.** Format `MM/DD/YYYY` or `DD/MM/YYYY` (the shop is in Argentina and the format is US style today)? The payments page shows no date at all: intended? *Assumption:* date and time both in Argentina time, format unchanged (BUG-17).
8. **Allowed characters and maximum length for name and address.** Today only plain ASCII is accepted. *Assumption:* letters with accents, apostrophes, `&`, parentheses and similar are valid; a maximum length is needed but unknown (BUG-18).
9. **Mobile and accessibility targets.** Which phone widths and which accessibility level are required? *Assumption:* phones from 320 px, WCAG 2.1 AA (BUG-11, BUG-19).
10. **Sessions and abuse.** Session lifetime, lockout rules after failed logins, rate limits for payments. *Assumption:* some limit is required (BUG-12, BUG-14).
11. **`POST /api/test/reset`.** Is it only enabled in test environments? *Assumption:* yes; if it were reachable in production it would be critical (BUG-21).

### Nice to know

12. Search scope: names only or also descriptions and categories? Case, accents and partial words?
13. Taxes and shipping costs: not in the spec, the total is the sum of the products minus the discount. Intended?
14. Order states (pending, paid, cancelled) and cancellation: only "approved" exists today.
15. Should search and category filters stay in the URL so a page can be shared or restored with Back?

## Ambiguities found

- **Where stock is enforced.** The spec says users can't buy more than the stock, and the API documents `409`. It does not say whether the cart limits it too. Both are needed in practice: the UI for a good experience, the server for safety.
- **"The cart persists even if the user closes the browser".** Per device, per user, or both? The code uses one browser key for everybody.
- **"Codes are case-insensitive" and "only one per purchase".** Does "one" count different coupons only or also repeated ones?
- **Discount rounding.** The spec gives no rule (the code floors, which is also wrong for the prices, BUG-16).
- **Payment and order atomicity.** If the payment is approved and creating the order fails (or the other way round), what is the state?
- **"Minimum 1" quantity.** There is no maximum in the spec; the UI uses 10 and the API accepts anything.
- **Argentina time.** The spec says dates and times are shown in Argentina time but gives no date format.
- **The three user reports** are short and a bit vague: "sometimes" a payment fails but charges (reproduced: totals above $100 take about 4 s and the app gives up at 3 s); "the discount is not applied" (only for lowercase codes); "things disappear from my cart" (only items added from the catalog).

## Assumptions I make to move forward

- The cart belongs to a person: another user on the same browser never sees it.
- The amount shown at checkout is the amount charged.
- A rejected request changes nothing (stock, payments, orders).
- Quantities are positive whole numbers.
- Argentina time (UTC-3) for every date shown.
- `/api/test/reset` exists only for the test environment.
- Phones from 320 px wide are supported, and the accessibility target is WCAG 2.1 AA.
- Only Chromium was tested (the repository only configures Chromium).

## What I could not verify

- Confirmation emails (no mail service and no code that sends one).
- A real payment gateway (the processor is a simulator).
- Other browsers and real devices (emulated viewports only).
- Behavior under real production load (the concurrent tests use a handful of simultaneous requests).
- BUG-18's maximum length (the spec is silent, so it is a question and has no test).

## Behaviors checked and found correct

Sessions (HttpOnly cookie), no password in any response, no user enumeration on login, payments only visible to their owner, the client price is ignored by the server, a declined card leaves no order or stock change, double click or Enter on Pay creates a single order, Back and Forward work, no XSS or SQL injection through the search, no open redirect through `next`, the out-of-stock state works, layouts are fine from 768 px, and checkout, login, orders and payments pages pass the accessibility scan.
