# Smoke Test and Live Demo Guide
## QuickMenu QR – Week 7 Milestone Gate

| Field | Detail |
|---|---|
| **Project** | #031 QuickMenu QR – Dynamic Multi-Language Restaurant Menu & Ordering |
| **Student** | Muhammad Haroon |
| **Faculty Supervisor** | Dr. Zaigham Mushtaq |
| **Tested build** | [[FILL: commit hash or tag]] |
| **Environment** | [[FILL: local or staging URL]] |
| **Date and tester** | [[FILL: date, name]] |

A **smoke test** is a short end-to-end check that the most important user journey works from start to finish. This guide has three parts: (1) the smoke test checklist, (2) the live demo script, and (3) prepared answers to likely questions.

---

## Part 1: End-to-End Smoke Test

**Before you start**
1. Reset the data: `npm run db:reset && npm run db:seed`
2. Start everything: `docker compose up -d`, then `npm run dev`
3. Open three browser windows: (A) owner or staff on a laptop, (B) customer on a phone-sized window or a real phone, (C) the database viewer (optional)
4. Have the demo restaurant's QR link ready: `http://localhost:3000/m/<qrToken>`

**Mark each step PASS or FAIL and write a short note. Take a screenshot of every step that matters.**

| # | Step | Expected result | Req. | Result | Notes |
|---|---|---|---|---|---|
| 1 | Open `/api/v1/health` | Returns status ok and database up | NFR-R1 | [[FILL]] | |
| 2 | Register a new restaurant owner | Account created; logged in; restaurant created | FR-01 | [[FILL]] | |
| 3 | Log out, then log in with the wrong password | Generic error message; not logged in | FR-02 | [[FILL]] | |
| 4 | Log in with the correct password | Dashboard opens | FR-02 | [[FILL]] | |
| 5 | Create a category and an item with a variant and price | Item saved and listed (or seeded data visible) | FR-06, FR-07, FR-08 | [[FILL]] | |
| 6 | Create a table and download its QR code | QR code PNG or PDF downloads | FR-14 to FR-16 | [[FILL]] | |
| 7 | Scan the QR (or open the menu link) on the phone window | Menu opens with the correct restaurant and table | FR-17, FR-18 | [[FILL]] | |
| 8 | Mark one item out of stock in the dashboard, reload the menu | Item shows greyed out with no Add button | FR-11 | [[FILL]] | |
| 9 | Add two items (one with a variant) to the cart | Cart bar shows the right count and total | FR-23, FR-25 | [[FILL]] | |
| 10 | Change a quantity and add a special instruction | Totals update; note kept | FR-24 | [[FILL]] | |
| 11 | Place the order, then double-tap the button quickly | Exactly **one** order is created; order number shown | FR-26, FR-28, NFR-R5 | [[FILL]] | |
| 12 | Check the staff orders page | The new order appears with items, table, and note | FR-30, FR-31 | [[FILL]] | |
| 13 | Change the order to Preparing, then Ready, then Served | Each change saved; invalid jumps are rejected | FR-33 | [[FILL]] | |
| 14 | Look at the customer status page | Shows the latest status | FR-29 | [[FILL]] | |
| 15 | Check the database rows (or API response) | One order, correct order items with snapshot prices, status history rows | NFR-R4 | [[FILL]] | |
| 16 | Try an invalid action (empty cart, quantity 0, wrong table link) | Friendly error; nothing stored | FR-27 | [[FILL]] | |

**Optional steps (only if built):** language switch (FR-20), dietary and allergen filters (FR-22), real-time order alert on the kitchen screen (FR-30), image upload (FR-09).

**Result summary:** [[FILL: for example, 15 of 16 steps passed; step X failed because Y; fixed in commit Z]]

### Quick checks from the terminal (optional proof)

```bash
# health check
curl http://localhost:4000/api/v1/health

# public menu for a table
curl http://localhost:4000/api/v1/public/menu/<qrToken>

# unit and integration tests
npm test
```

### Optional: automate the smoke test with your coding agent

Paste this prompt to the agent:

```
Read AGENTS.md and DECISIONS.md. Create a Playwright end-to-end smoke test in e2e/smoke.spec.ts
that runs the user journey in docs/SMOKE_TEST.md (steps 2 to 15) against a freshly seeded database:
register owner, open the customer menu from a table QR link at a 360x740 viewport, add two items
(one with a variant), place an order with a double click, verify only one order exists, log in as
staff, advance the status to Preparing, Ready and Served, and verify the customer status page shows
each change. Add an npm script "smoke" and a CI job that runs it. Print a clear PASS/FAIL summary.
```

---

## Part 2: Live Demo Script (about 8 to 10 minutes)

**Setup the day before and one hour before**
- Run the smoke test once more; fix anything that fails
- Seed realistic demo data: real dish names, prices in Rs, real food photos, 5 to 7 tables
- Use a real phone for the customer side if possible; connect the laptop and phone to the same Wi-Fi
- Close other apps, increase browser zoom to about 125%, and turn off notifications
- Keep a **backup**: a short screen recording of the full journey and screenshots, in case the network or database fails
- Charge laptop and phone; have the repository, report, and slides open in tabs

| Time | What you do | What you say |
|---|---|---|
| 0:00 to 1:00 | Slide: problem and solution | "Restaurants lose money reprinting menus and struggle with languages and out-of-stock items. QuickMenu QR puts the menu and ordering on the customer's phone through a QR code." |
| 1:00 to 2:00 | Slide: architecture | "Three tiers: a Next.js app, a Node API, and PostgreSQL. Every record belongs to one restaurant, so many restaurants can share the system safely." |
| 2:00 to 3:30 | **Owner side:** log in, show the menu, mark an item out of stock | "The owner changes a price or availability once, and every customer sees it immediately. No reprinting." |
| 3:30 to 4:30 | Show the table QR code | "Each table gets its own QR code with an unguessable token." |
| 4:30 to 6:30 | **Customer side on the phone:** scan, browse, add items, place the order | "No app, no login. The server recalculates the price, so the customer cannot change it." |
| 6:30 to 7:30 | **Staff side:** order appears; change status; customer page updates | "The order was saved in one database transaction. Staff move it through the allowed statuses." |
| 7:30 to 8:30 | Show a failure case: double tap or out-of-stock item | "A double tap creates only one order, and an unavailable item is rejected with a clear message." |
| 8:30 to 9:30 | Show test results and the repository | "[[FILL: number]] automated tests pass; coverage is [[FILL]] percent; the code and documents are in the repository." |
| 9:30 to 10:00 | Slide: plan for Weeks 8 to 12 | "Next: real-time kitchen screen, translation and filters, deployment, and the pilot with campus cafes." |

**Demo tips**
- Narrate every click; silence feels long
- If something fails, stay calm: say what you expected, show the backup recording, and continue
- Show the unhappy path (error handling) once. It proves quality
- Do not apologize for unfinished features; say "planned for Week X"

---

## Part 3: Questions the Supervisor May Ask

| Question | Short answer |
|---|---|
| Why REST and not GraphQL? | Our screens need fixed, predictable data; REST is easy to cache and rate limit and simpler for a small team. Live updates use WebSockets either way. |
| Why PostgreSQL and not MongoDB? | Orders, menus, and tables have strict relationships and need transactions. PostgreSQL also supports array columns and special indexes we use for filters and search. |
| How do you prevent duplicate orders? | Every order attempt carries a unique idempotency key. The database has a unique constraint on it, so a retry returns the original order. |
| How do you stop customers changing prices? | The client sends only item IDs and quantities. The server loads prices from the database and calculates the total. |
| How is data from different restaurants kept apart? | The restaurant ID comes only from the login token or the QR token, never from the request. Every query filters by it, and tests confirm another restaurant's data returns "not found". |
| How are passwords and sessions secured? | bcrypt hashing, short-lived JWT access tokens, an HttpOnly refresh cookie, lockout after 5 failed logins, and rate limiting. |
| What if the kitchen internet drops? | The screen reconnects automatically, reloads any missed orders from the database, and falls back to polling. |
| Why store item names and prices on each order line? | So old orders and reports stay correct even after the menu changes. |
| What have you tested? | [[FILL: number]] unit and integration tests, an end-to-end smoke test, and tests for security rules such as blocked cross-restaurant access. |
| What is not finished? | [[FILL: honest list, for example real-time kitchen screen, translation, deployment]]. Planned for Weeks 8 to 12. |
| How will it scale? | The API is stateless so more instances can be added; the database has indexes for the main queries; load testing is planned in Week 11. |
| What was the hardest part? | [[FILL: your real answer, for example the order transaction and idempotency logic]] |
| How will you run the pilot? | Onboard 5 campus cafes, print QR stands, collect feedback with a usability survey (target SUS 70 or higher). |

---

*End of Guide*
