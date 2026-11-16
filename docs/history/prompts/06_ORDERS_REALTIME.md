# PHASE 06 – Orders, state machine, WebSocket real-time

**Read:** `docs/03_DATABASE_API_WIREFRAMES.md` sections 2.8 (Q4), 3.4.4, 3.4.5, 3.5 (`POST /public/orders`, `GET /public/orders/{id}`, `GET /orders`, `PATCH /orders/{id}/status`), 3.6, 3.7; `docs/02_ARCHITECTURE.md` section 6; `docs/01_SRS.md` FR-23..FR-35, NFR-P3, NFR-R3..R5; `DECISIONS.md` D-1, D-5, D-6.

## Goal
Processes 5.0 and 6.0. This is the most critical part of the product.

## Order creation (`POST /public/orders`)
- Requires `Idempotency-Key` header (UUID) -> stored as `client_request_id`. A repeated key returns `200` with the original order (same `orderNumber`, same `trackingToken` per D-1) and creates nothing.
- Resolve the table from `qrToken` (must be active). Load every item and variant **from the database**; ignore any client prices. Reject unavailable items with `409 ITEM_UNAVAILABLE` and the list of items. Apply D-5 for variants. Limits: 1 to 30 lines, quantity 1 to 50.
- In **one transaction:** increment `restaurants.order_counter` (`UPDATE ... RETURNING`), insert the order with the server-calculated total (use integer minor units or a decimal library), insert `order_items` with name/price snapshots, insert the first `order_status_history` row. Commit.
- **After commit only:** emit `order:new` to room `restaurant:{id}`. Return `201` exactly as documented.

## Other endpoints
- `GET /public/orders/{id}` with `X-Tracking-Token` (constant-time hash compare; wrong token -> `404`).
- `GET /orders` (kitchen or owner): `status` list filter, `from`, `to`, pagination; `GET /orders/{id}`.
- `PATCH /orders/{id}/status`: enforce the state machine in 3.6 (`409 INVALID_STATUS_TRANSITION`), write history with `changed_by`, update `updated_at`, then emit `order:status` to `restaurant:{id}` and `order:{id}`.

## WebSocket (Socket.IO, path `/ws`)
- Staff connect with the access JWT -> join `restaurant:{id}`; on connect send `kot:sync` with all active orders (Q3).
- Customers connect with `orderId` + `trackingToken` -> join `order:{id}`; public menu pages join `menu:{restaurantId}` after QR validation (D-6).
- Events exactly as in 3.7: `order:new`, `order:status`, `order:update_status` (client -> server, same validation and state machine as the REST endpoint), `kot:sync`, `menu:updated` (subscribe to the `menu.changed` domain event from phase 04).
- Server-side rooms prevent cross-restaurant leaks. A client can never join a room it is not authorized for.
- Make the emitter an interface so a Redis adapter can be added later without changing services.

## Tests (these matter most)
- Happy path creates correct totals; price tampering in the request is ignored.
- Idempotency: same key twice -> one order, same token.
- Concurrency: 20 parallel orders for the same restaurant get unique, consecutive `order_number`s.
- Unavailable item -> 409 and **nothing** persisted.
- Transaction rollback if any insert fails (simulate); no WebSocket event is emitted on rollback.
- State machine: every allowed and every forbidden transition.
- WebSocket integration test with two restaurants: restaurant B never receives A's events; reconnect receives `kot:sync` with missed orders.
- Latency test: order POST to `order:new` received in under 2 s (log p95 over 100 orders locally).

## Acceptance criteria
All endpoints in 3.4.4 and 3.4.5 and all events in 3.7 behave as documented; NFR-R4 and NFR-R5 are proven by tests.
