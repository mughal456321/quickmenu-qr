# PHASE 02 – Database layer, repositories, seed data

**Read:** `docs/03_DATABASE_API_WIREFRAMES.md` section 2 (all), `db/migrations/001_init.sql`, `AGENTS.md` (architecture rules).

## Goal
A tested data-access layer for every table, plus realistic seed data.

## Tasks
1. Repository modules (one per aggregate) in `apps/api/src/repositories/`: restaurants, users (+ reset tokens), categories, menuItems (+ variants, images), tables, orders (+ items, status history), translations. Each function takes `restaurantId` first where the table is tenant-scoped. Map snake_case rows to camelCase types defined in `packages/shared`.
2. A small `withTransaction(fn)` helper that commits or rolls back and releases the client.
3. Query functions for the documented query patterns Q1 to Q5 (section 2.8): menu by QR token, filtered menu (`@>` dietary, `NOT (allergens && ...)`, name search with `pg_trgm`), active orders for the kitchen, order creation primitives (counter increment, insert with `ON CONFLICT (client_request_id)`), translation cache lookup/upsert.
4. Seed script `db:seed`: 1 demo restaurant ("Cafe Aroma"), 1 owner and 1 kitchen user (documented dev passwords), 4 categories, 12 items with variants/tags/allergens (use placeholder image URLs), 7 tables with random 16+ char QR tokens, and a few orders in different statuses.
5. Tests against a real test database (separate schema or database, reset between tests):
   - tenant isolation: every repository function cannot read another restaurant's data
   - unique constraints (duplicate email, category name, table number, `client_request_id`)
   - CHECK constraints (negative price, quantity 0 or 51, invalid tag value)
   - the 3-images-per-item trigger
   - `EXPLAIN` sanity test (or documented manual check) that Q3 uses `ix_orders_active`.

## Acceptance criteria
- `npm run db:reset && npm run db:seed` produces a usable dataset.
- All repository tests pass; no SQL outside `repositories/`.
- No string-concatenated SQL anywhere.
