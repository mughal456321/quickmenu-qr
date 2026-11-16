# PHASE 06A – Core order engine, validation and error handling, first vertical slice (Week 6)

**Prerequisite:** phases 01 to 03 are done and committed (scaffold, database layer, authentication).

**Read first:** `AGENTS.md`, `DECISIONS.md` (D-1, D-5, D-7), `docs/01_SRS.md` (FR-17, FR-18, FR-23..FR-29, NFR-R4, NFR-R5), `docs/03_DATABASE_API_WIREFRAMES.md` (sections 2.8 Q4, 2.9, 3.3, 3.4.4, 3.4.5, 3.5 `POST /public/orders` and `GET /public/orders/{id}`, 3.6, and wireframes 1 to 3), `docs/02_ARCHITECTURE.md` section 6. Look at `docs/diagrams/QuickMenuQR_Wireframe_1_CustomerMenu.png`, `..._2_CartOrder.png`, `..._3_OrderStatus.png`.

## Goal
Deliver, in this order:
1. The **core domain engine** (the order and pricing logic) as pure, heavily tested code.
2. **Server-side validation and error handling** used by every endpoint.
3. One **end-to-end vertical slice**: a customer opens the menu from a table QR link, adds items, places an order, and the order is stored in PostgreSQL and visible to the kitchen side, with the customer able to see its status.

Real-time WebSockets, translation, filters, owner dashboard, and image upload are **out of scope** for this phase. Use polling where live updates would be needed.

---

## Part A – Core domain engine (pure functions, no database, no HTTP)

Create `apps/api/src/domain/` (or `packages/shared/src/domain/` if the web app needs the same code for display totals). Nothing in this folder may import `pg`, Express, or any I/O.

1. **Money module**
   - Represent money as **integer minor units** (paisa) in memory. Provide `toMinor(decimalString)`, `fromMinor(int)`, `formatMoney(int, currency)`, `add`, `multiply(int, quantity)`.
   - Never use JavaScript floating-point arithmetic on money. Reject values with more than 2 decimals.
2. **Pricing engine** `priceOrder(menuSnapshot, requestLines)`
   - Input: the items and variants **as loaded from the database** (id, name, base price, variants, `isAvailable`, restaurant id) and the customer's lines (`itemId`, `variantId | null`, `quantity`, `specialInstructions`).
   - Rules (from the documents and `DECISIONS.md` D-5): 1 to 30 lines; quantity 1 to 50; item must belong to the same restaurant as the table; item must be available; if the item has variants then `variantId` is required, otherwise it must be null and `base_price` is used; the variant must belong to the item.
   - Output: priced lines with **name and unit price snapshots**, line totals, and the order total. Same input always gives the same output.
   - Errors are typed domain errors (not strings): `ItemUnavailableError` (lists every unavailable item, not just the first), `InvalidVariantError`, `InvalidQuantityError`, `EmptyOrderError`, `TooManyLinesError`, `ForeignItemError`.
3. **Order state machine** `canTransition(from, to)` and `allowedNext(status)` exactly as in section 3.6 of the database/API document. Terminal states: `served`, `cancelled`.
4. **Tracking token** `createTrackingToken(orderId, secret)` = base64url(HMAC-SHA256(secret, orderId)); `hashToken(token)` = SHA-256 hex; `verifyToken(...)` uses constant-time comparison (`DECISIONS.md` D-1).
5. **Idempotency decision** `decideOnReplay(existingOrder | null)`: returns `create` or `return-existing`.

### Tests for Part A (Vitest)
- Table-driven tests for every pricing rule and every error type, including multiple unavailable items at once.
- **Property-based tests** with `fast-check`: for random valid carts, `total === sum(lineTotal)`; total never negative; reordering lines never changes the total; quantity multiplication has no rounding drift (for example 3 x 0.10 = 0.30 exactly).
- State machine: test **every** (from, to) pair against an expected table.
- Token: round-trip, tampering, constant-time path.
- Target: at least 90% line and branch coverage for `domain/`.

---

## Part B – Server-side validation and error handling

1. **Validation:** zod schemas in `packages/shared` for every request in this phase (`POST /public/orders`, `GET /public/orders/{id}` headers, `PATCH /orders/{id}/status`, query strings for `GET /orders`). One `validate({ body, query, params, headers })` middleware that returns the documented `400 VALIDATION_ERROR` with `details: [{ field, issue }]`. Strip unknown fields. Limit JSON body size (for example 100 KB). Trim strings; limit lengths (`specialInstructions` 200 characters, `notes` 500).
2. **Error handling:**
   - A base `AppError(code, httpStatus, message, details?)` and subclasses for the documented codes used in this phase: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `ITEM_UNAVAILABLE` (409), `INVALID_STATUS_TRANSITION` (409), `TABLE_INACTIVE` (422), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).
   - A mapping layer that converts domain errors (Part A) and database errors (unique violation, foreign key violation, check violation) into `AppError`.
   - One central error middleware: logs with the request id, returns the documented error JSON, **never** leaks stack traces, SQL, or internal messages. Unknown errors become `INTERNAL_ERROR`.
   - `asyncHandler` wrapper so rejected promises always reach the middleware.
3. **Rate limits** on public order creation: 5 per minute per table and IP.

### Tests for Part B
Every error code above is produced by at least one request-level test and matches the documented JSON shape; a test proves an injected database error returns `INTERNAL_ERROR` without internal details; invalid UUIDs, oversized bodies, and unknown fields behave as specified.

---

## Part C – The vertical slice (UI -> API -> database)

### API endpoints (exact paths and shapes from the document)
- `GET /api/v1/public/menu/{qrToken}`: the **minimal** version (categories, items, variants, price, tags, `isAvailable`; no translation or filters yet). Invalid token `404`; inactive table `422 TABLE_INACTIVE`.
- `POST /api/v1/public/orders` with `Idempotency-Key`: validate -> resolve table -> load items and variants from the database -> `priceOrder` -> **one transaction** (increment `restaurants.order_counter`, insert order, order items with snapshots, first `order_status_history` row; `ON CONFLICT (client_request_id)` for replays) -> `201` with `orderNumber`, `total`, `trackingToken`. A replayed key returns `200` with the same order and token. Do **not** emit real-time events yet; leave a clearly marked `OrderEvents` interface with a no-op implementation for phase 06.
- `GET /api/v1/public/orders/{id}` with `X-Tracking-Token`: wrong or missing token returns `404`.
- `GET /api/v1/orders` (kitchen or owner, `status` filter) and `PATCH /api/v1/orders/{id}/status` (state machine, history row, tenant scoped).

### Web screens (follow the wireframes' structure)
1. `/m/[qrToken]` – **Customer Menu** (Wireframe 1, reduced): header with restaurant name and table, category sections, item cards with price and tags, out-of-stock cards greyed with no Add button, variant picker when an item has variants, sticky cart bar.
2. **Cart and Place Order** (Wireframe 2): quantity stepper, remove, special instructions, total (display only; the server recalculates). Generate the `Idempotency-Key` once per attempt and reuse it on retry; disable the button while sending so a double tap creates one order. Show server validation and `ITEM_UNAVAILABLE` errors clearly (which items changed) and let the customer fix and retry.
3. **Order Status** (Wireframe 3): order number, progress (Received, Preparing, Ready, Served, Cancelled), items, total; **poll every 5 seconds** with the tracking token stored in `sessionStorage` (wrap storage calls in try/catch).
4. `/dashboard/orders` – a **minimal staff page** for the owner or kitchen account (log in with the phase 03 auth): list active orders, button to move each order to its next allowed status. This is only to prove the slice end to end; the full kitchen display comes later.

### Tests for Part C
- API integration tests on a real test database: happy path totals; price tampering in the request body is ignored; replay with the same key creates exactly one order; unavailable item returns 409 and **nothing is stored**; order numbers are unique and consecutive under 20 parallel requests; transaction rollback leaves no partial order; cross-restaurant and wrong-token access returns 404; every allowed and forbidden status change.
- One **Playwright end-to-end test** (mobile viewport 360 x 740): seed -> open `/m/{token}` -> add two items (one with a variant) -> place order -> see confirmation -> staff page shows the order -> staff advances to Preparing -> customer page shows Preparing; plus a double-tap test proving a single order.

---

## Acceptance criteria (verify each yourself and tell me the result)
1. `npm run lint`, `npm run typecheck`, and `npm test` pass; domain coverage is at least 90%, overall backend business-logic coverage at least 70%.
2. The Playwright test passes in CI.
3. After the demo flow, the database shows: one `orders` row, the right `order_items` rows with snapshot names and prices, two `order_status_history` rows, and an incremented `order_counter`.
4. Price tampering, empty cart, quantity 0 or 51, an unavailable item, an invalid QR token, a wrong tracking token, and a forbidden status change each return the documented status code and error code, and no internal details leak.
5. A short `docs/WEEK6_DEMO.md` with run steps and the commands/screenshots that prove the slice works.
6. Any deviation or new decision is recorded in `DECISIONS.md`.

## Final answer format
Summarize: what you built per part, how to run the demo, test counts and coverage, any deviations, and what is left for the real-time phase.
