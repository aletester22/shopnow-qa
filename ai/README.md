# AI usage

## Approach in one paragraph

I treated the AI as a fast executor inside a QA process that I designed and controlled, not as an oracle. The process was: **spec as oracle, then static reading, then dynamic execution, then evidence, then ticket, then test, then fix**. Every AI output had to pass a check that does not depend on the AI saying it is right: a failing test for the right reason, a real request/response, a screenshot, a number computed by code. Anything that could not pass such a check was dropped or labeled as unverified.

## Tools and models

- **Claude Code** (Anthropic) in a cloud workspace with shell, repository, Node and Playwright with Chromium. It is the only AI tool used for this repository.
- Tools the AI ran under my direction: Playwright (UI and API tests, screenshots), axe-core (accessibility scan, scratch folder only, not a dependency), plain `fetch` scripts for bulk API probing.

## How I worked with the AI (human-in-the-loop controls)

1. **Approval gate.** The AI had to announce what it was about to do and wait for my approval before each step, and show results before the next. When it ran tests before I approved, I stopped it and the gate became a standing rule.
2. **Separate discovery from classification.** The AI proposed findings; I decided what is a bug, its severity and its priority. Examples of my calls: a user must never see another user's cart (a shared cart would be a separate feature); a stale price in the cart is a bug; mobile overflow and accessibility are bugs and important; the confirmation email cannot be verified here, so it goes to the PO as a high-priority question instead of being reported as a bug.
3. **I widened the test surface when the first pass was too narrow.** I asked for the whole UI, not only the cart flow, for evidence of backend findings, and for abuse scenarios (someone trying to exploit a promotion), not just functional checks.
4. **I did not accept the three user reports as the full list of bugs.** They map to BUG-03, BUG-07 and BUG-08; the other 18 tickets came from the exploration below.
5. **I approved the final ticket list** (21 tickets) before any tests or documents were committed.

## Techniques used (what I asked the AI to do, and why)

| Technique | Applied to | Why it matters |
|---|---|---|
| Spec-derived oracle (expected values written from `SPEC.md`, not from what the app does) | all tests | A test that copies current behavior proves nothing |
| Static reading with line-level root cause | `app/server/api.ts`, `cart.tsx`, `Catalog.tsx`, `money.ts` | Links symptoms to causes for the optional fixes |
| **Dynamic execution, not only reading** | API sweep with malformed bodies | Found BUG-01 (the server dies on `items:[null]` and on non-string shipping fields); reading alone had missed it |
| Boundary and type-confusion probing | quantities 0, negative, fractional, text, 1e9; arrays instead of strings | BUG-04, BUG-21 |
| **Exhaustive check instead of one example** | all 8 products x quantities 1 to 10 (80 cases) | Showed the rounding bug is systematic (5 of 80), not a single case (BUG-16) |
| Concurrency probing | 4 simultaneous purchases of a 2-unit item, double submit | BUG-03, BUG-05 |
| Abuse and fraud scenarios | coupon stacking up to negative totals, negative payments, repeated card attempts | BUG-04, BUG-06, BUG-12 |
| Authorization testing (IDOR) | order detail of another user, API and UI | BUG-02 |
| Client-side state attacks | corrupted `localStorage` cart, stale prices, user switch in one browser | BUG-09, BUG-10, BUG-13 |
| Responsive sweep and automated accessibility scan | 320, 390 and 768 px and up; axe-core | BUG-11, BUG-19 |
| Time zone check against a seeded record | order created at `2026-10-15T02:30:00Z` | BUG-17 |

## How I evaluated the AI (not only used it)

**Autonomy level.** I set how much freedom the AI had, and changed it when it misbehaved. It started with analysis only, then one announced step at a time with my approval, with results shown before the next step. When it acted ahead of that, I tightened it back. Temperature is not a setting exposed in this tool, so I did not rely on sampling settings; I controlled reliability with executable checks, so a claim does not depend on how the model happened to answer that time.

**Claim classification.** Every statement from the AI was sorted by how it was backed, and the documents keep that label:

| Level | Meaning | Example |
|---|---|---|
| Executed | Reproduced with a real request or browser run, with evidence | BUG-01 crash with real stack trace |
| Code only | Cause read in the code, not separately proven | root-cause lines in each ticket |
| Simulated | Reproduced with an injected condition | BUG-20 screenshot (500 injected in the browser) |
| Unverified | Could not be checked here, so it became a question | confirmation email, `ANALYSIS.md` question 1 |

**Failure modes of the AI that I observed and handled.**

| Failure mode | What happened | My response |
|---|---|---|
| Overconfident hypothesis | Proposed that another tab overwrites the cart, without reproducing it | Asked for proof; it failed; dropped it; the real cause is BUG-08 |
| Inflated estimate | 8 to 12 hours | Challenged it; corrected to 2 to 3 hours |
| Static-analysis blind spot | Code reading missed the server crash | Required dynamic execution; it found BUG-01 and a second crash path |
| Test that passes for the wrong reason | BUG-19 coupon-field test passed on the buggy app | Treated a passing bug test as a defect of the test; removed it |
| Imprecise explanation | Blamed the wrong column for an empty table header | Re-read the DOM and corrected the evidence |
| Acting ahead of instructions | Wrote and ran tests when only analysis was agreed | Set the approval gate described above |
| Scope narrowing | First exploration covered only the cart flow | Asked for the whole UI and for abuse scenarios |

**Test quality check.** A test counts only if it fails on the unmodified app for the reason written in the ticket (compared message by message), and the existing team tests still pass.

## What I verified, and how (the AI's output was not trusted by default)

- **Each bug test was run against the unmodified app and checked to fail for the right reason**, comparing the failure message with the bug, not only the red status. Examples: BUG-07 expects a discount of 1.67 and gets 0; BUG-16 expects $25.05 and gets $25.04; BUG-09 shows $10.00 and charges $16.70; BUG-08 shows `Cart (1)` before reload and `Cart (0)` after.
- The existing team tests (`tests/cart.spec.ts`, `tests/login.spec.ts`) were left untouched and still pass, so the new tests do not break the baseline.
- Tests follow the rules of the challenge: clean state through `resetData` in `beforeEach`, `data-testid` selectors, only UI and documented API, no `test.fail`, `fixme`, `skip` or `only`, no mocks, no config changes, no new dependencies.
- Evidence comes from real runs. The one exception is the BUG-20 screenshot (a 500 injected in the browser) and it is labeled as simulated in `BUGS.md`.
- Behaviors that were checked and are correct are listed in `ANALYSIS.md` (sessions, no password leak, no user enumeration, payments only visible to the owner, client price ignored, declined card has no side effects, double click creates one order). This shows the exploration was not looking only for failures.

## What I discarded or corrected from the AI output, and why

- **Time estimate.** The AI estimated 8 to 12 hours. I challenged it; the corrected estimate was about 2 to 3 hours.
- **Incomplete first bug list.** The first list came from code reading and missed the server crash. Execution found it. The AI's own sweep script also crashed the server and had to be changed to restart it, which exposed a second crash path.
- **Hypothesis not reproduced.** The AI suggested that another tab overwrites the cart. It could not be reproduced, so it was dropped; the real cause is BUG-08.
- **Useless test.** A BUG-19 test on the coupon field passed on the buggy app (the placeholder already gives an accessible name), so it did not detect anything and was removed.
- **Factual slip in the evidence.** The accessibility note blamed the hidden Price column for an empty table header; it is the header of the Remove-button column. Corrected.
- **Scope kept honest.** BUG-18 has no maximum-length test because the spec does not define it.

## Known limits

Confirmation emails (no mail service and no code that sends one), a real payment gateway, browsers other than Chromium and real devices were not tested. Concurrency checks use a handful of simultaneous requests, not production load.

## Evidence

- `ANALYSIS.md`, `BUGS.md`, `evidence/` (request/response transcripts and screenshots) and `tests/`.
