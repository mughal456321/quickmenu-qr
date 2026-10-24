# DECISIONS.md

Record every choice that the documents leave open, and every deviation from them. Format: **Date – Problem – Decision – Reason**.

## Known gaps in the documents (already decided; follow these)

| # | Gap | Decision |
|---|---|---|
| D-1 | `orders` stores only `tracking_token_hash`, but an idempotent replay of `POST /public/orders` must return the same `trackingToken`. | Derive `trackingToken = base64url(HMAC-SHA256(TRACKING_SECRET, orderId))`. Store its SHA-256 in `tracking_token_hash`. A replay recomputes the same token. |
| D-2 | No `refresh_tokens` table exists. | Use a signed, stateless refresh JWT in an HttpOnly cookie (7 days). Logout clears the cookie. Known limit: no server-side revocation. Revisit later. |
| D-3 | Translation provider not chosen (Week 4 open item). | Build a `TranslationProvider` interface. Ship a `FakeTranslationProvider` (returns text with a language prefix) and one real adapter selected by `TRANSLATION_PROVIDER` env var. Results always go through the `translations` cache table. |
| D-4 | Email provider for password reset not chosen. | Build a `Mailer` interface. In development log the reset link to the console. Add a real adapter (SMTP) later. |
| D-5 | If an item has variants, is `variantId` required when ordering? | Yes: if the item has variants, `variantId` is required; if it has none, `variantId` must be null and `base_price` is used. |
| D-6 | The doc says customers' open menus update on availability change but not which room. | Public customers join room `menu:{restaurantId}` after the QR token is validated; `menu:updated` is emitted there. |
| D-7 | `order_number` is a per-restaurant counter that grows forever. | Keep as documented (`restaurants.order_counter`). Display as `#<number>`. Optional daily reset is out of scope. |
| D-8 | Public menu caching. | Cache the public menu response in memory per `(qrToken, lang, filters)` for 5 seconds; invalidate on any menu change for that restaurant. |

## Log

### 2026-10-17 – Phase 00 decisions (from master-prompt review)

| # | Problem | Decision | Reason |
|---|---|---|---|
| D-9 | `GET /orders` default scope is unspecified (active vs history). | No `status` and no `from`/`to` → active orders (`new/preparing/ready`) via `ix_orders_active`; `from` and/or `to` → all statuses (history) via `ix_orders_history`. | Matches the kitchen board's default view and the index definitions. |
| D-10 | `GET /public/menu` envelope puts `warnings` outside `data`. | Follow the §3.5 example exactly: `{ "data": {...}, "warnings": [...] }`. | The example is the authoritative contract; deviates from the generic envelope rule. |
| D-11 | Idempotent replay of `POST /public/orders` returns 200, not 201. | First `Idempotency-Key` → `201`; repeated key → `200` with the original order (same `orderNumber`, same `trackingToken` per D-1). | Required by NFR-R5 and D-1; catalogue's 201 applies only to the first creation. |
| D-12 | FR-12 says price changes reflect "immediately" but `menu:updated` only carries `{ itemId, isAvailable }`. | Emit `menu:updated` on availability toggles only (instant push); other writes invalidate the 5 s public-menu cache (D-8). | Literal deviation from "immediately"; mitigated by cache invalidation. Flagged for the advisor. |
| D-13 | `users.email` and `restaurants.slug` are globally unique (no `restaurant_id` in the constraint). | Accept: one email = one restaurant globally; slugify the name and append `-2`, `-3` on collision. | The DDL is the source of truth; do not alter the schema. |
| D-14 | `PATCH /staff/{id}` "reset password" mechanism is unspecified. | Support `isActive` toggle and a `password` field the owner sets directly (owner-provisioned password); no email needed for staff. | Simplest option satisfying FR-05. |
| D-15 | Customers reordering: Appendix B open issue #3. | "Back to menu" starts a **new** cart/order; no add-to-existing-order. Each order is independent. | Simplest option; out of scope for the MVP. |
| D-16 | Anonymous customer WebSocket auth is not in §3.7. | Handshake: `{ qrToken }` → validate → join `menu:{restaurantId}`; `{ orderId, trackingToken }` → validate → join `order:{id}`. Server never lets a socket join a room it cannot prove. | Extends D-6; preserves tenant isolation. |
| D-17 | `trackingToken` format. | Generate `t_<base64url(HMAC-SHA256(TRACKING_SECRET, orderId))>` and store SHA-256 of the **full** string including the `t_` prefix. | Matches the §3.5 example format. |
| D-18 | Money arithmetic. | Order service computes totals in integer minor units (×100); stores/returns `numeric(10,2)`. | AGENTS forbids floating-point arithmetic for money. |
| D-19 | `DELETE /tables/{id}` and `DELETE /categories/{id}` blocked by DB `RESTRICT` FKs. | Catch PG error `23503` → `409 CONFLICT` (table: suggest deactivate; category: `409 CATEGORY_NOT_EMPTY` unless `force=true`, in which case delete category + items in one transaction). | Maps documented behaviour to the FK constraint. |
| D-20 | Duplicate email/table-number/category-name violations. | Catch PG error `23505` → `409 CONFLICT` with a readable message. | Standard conflict handling. |
| D-21 | `PUT /categories/order` body and error handling unspecified. | Body `{ "ids": [<uuid>, ...] }`; must be exactly the restaurant's categories (no more, no less) else `422 VALIDATION_ERROR`; rewrite `display_order` in one transaction. | Simplest option satisfying FR-06. |
| D-22 | Image folder naming for Cloudinary. | `quickmenu/{restaurantId}`; `POST /items/{id}/images` rejects a `publicId` not starting with that prefix. | Prevents cross-tenant image leakage. |
| D-23 | `warnings`/`TRANSLATION_UNAVAILABLE` must never block the menu. | Translation runs with a 3 s timeout, in parallel per text; original returned on failure. | NFR-P4 and graceful degradation. |
| D-24 | Real translation provider (user decision). | Google Cloud Translation API wired behind the `TranslationProvider` interface, with a LibreTranslate fallback if no billing card is attached. **Default for development and offline testing: the `FakeTranslationProvider`** (returns text with a language prefix), selected by `TRANSLATION_PROVIDER=fake`. | Keeps the codebase clean and modular for evaluation, meets the SRS 5+ language requirement, and avoids unexpected API charges during grading. |
| D-25 | Email/mailer for password reset (user decision). | Keep console-only (console logger / stub) for now via the `Mailer` interface; evaluate a real SMTP driver in Phase 10 if needed. | Standard practice for a semester presentation/defense; avoids third-party key configuration during local execution. |
| D-26 | Demo seed credentials and branding (user decision). | Restaurant "Cafe Aroma"; admin email `owner@cafearoma.pk`; admin password `CafeAroma2026!`. | Localized `.pk` branding and standard credentials make seed data easily verifiable by university faculty. |
| D-27 | Repository-root naming oddity. | Treat the inner folder `…\quickmenu-qr-build-kit\quickmenu-qr-build-kit` as the repo root (it already has `AGENTS.md`, `docs/`, `db/`, `prompts/`). Recommend renaming the outer folder to `quickmenu-qr` so paths read cleanly in commits and CI. | The inner folder is the actual project root; the outer folder is just the download wrapper. |

### 2026-10-18 – Phase 02 decisions (data layer, repositories, seed)

| # | Problem | Decision | Reason |
|---|---|---|---|
| D-28 | The demo kitchen account had no documented password. | Kitchen login `kitchen@cafearoma.pk` / `KitchenCafe2026!` (owner is D-26). | Needed a second role for the kitchen board demo; printed by `db:seed`. |
| D-29 | `db:reset` only dropped tables, so re-running migrations failed with "type already exists" (and the `limit_item_images` function lingered). | `resetDatabase` now also drops the project's enum types and non-extension functions after dropping tables. | Required by the Phase 02 acceptance criteria (`npm run db:reset && npm run db:seed`). |
| D-30 | Seed scripts must not contain SQL (no SQL outside `repositories/`). | `db:seed` is built entirely from repository calls; added `restaurants.deleteBySlug` for idempotency (delete the demo tenant, cascade, then rebuild). | Keeps the rule "SQL lives only in repositories" and makes the seed re-runnable. |
| D-31 | Repository functions need to run inside a caller's transaction (Q4) as well as standalone. | Every repository function takes an optional trailing `client?: Queryable` (the pool by default); tenant-scoped functions take `restaurantId` first. | One signature works for both cases without a repository factory. |
| D-32 | `pg` returns `numeric` as strings and `timestamptz` as `Date`; the API contract wants numbers and ISO strings. | Mappers convert: numeric → number, timestamptz → ISO 8601 string. Enum/array params are cast (`::order_status`, `'{}'::text[]`). | Keeps shared types accurate for the JSON API (docs/03 3.2). |
| D-33 | Vitest `setupFiles` run per test file; the second file could not `DROP DATABASE` while the first file's pool held connections. | `test/setup.ts` drops the test DB `WITH (FORCE)` and closes the application pool in `afterAll`. | Makes multi-file DB tests reliable. |
| D-34 | Q3 must be shown to use `ix_orders_active`. | The repository exports `ACTIVE_ORDERS_SQL`; the test runs `EXPLAIN (FORMAT JSON)` with `enable_seqscan = off` and asserts the plan contains `ix_orders_active`. | A deterministic automated form of the documented manual check. |
| D-35 | Infrastructure SQL exists outside `repositories/`. | Accepted for schema tooling only: `db/migrate.ts` (migration runner/reset) and `test/setup.ts` (create test DB). All business/query SQL lives in `repositories/` (including the test `truncateAll` helper). | The rule targets the data-access layer; a migration runner and test-database bootstrap are not business queries. |

### 2026-10-24 – Phase 03 decisions (authentication, staff, restaurant profile)

| # | Problem | Decision | Reason |
|---|---|---|---|
| D-36 | The refresh cookie must be read, but `cookie-parser` is not a dependency. | Added a small `lib/cookies.ts` parser/setter; `res.cookie` is built into Express. | One less dependency; cookie values are simple JWT strings. |
| D-37 | The spec fixes `201` for register but not the response body. | Register returns the same `{ accessToken, expiresIn, user }` payload as login and sets the refresh cookie. | The client can go straight to the dashboard; consistent envelope. |
| D-38 | Login needs both lockout and no account enumeration. | The 5th consecutive failure sets `locked_until = now() + 15 min` and returns `423 ACCOUNT_LOCKED`; unknown email, wrong password, and inactive account all return the same `401 INVALID_CREDENTIALS` message. A successful login resets the counter. | FR-02 / NFR-S4 without leaking which emails exist. |
| D-39 | No error code is specified for a bad, used, or expired reset token. | Return `400 VALIDATION_ERROR` with `details: [{ field: "token" }]`. A successful reset stores a new bcrypt hash, clears the lockout, marks the token used, and deletes the user's tokens. | Matches the documented envelope without inventing a code. |
| D-40 | Staff endpoints could be abused to change roles or delete the owner. | `POST /staff` always creates `role = kitchen`; `PATCH/DELETE /staff/{id}` only touch kitchen accounts (403 otherwise); deleting your own id returns `400`. `role` is never accepted from the client. | FR-05 and least privilege; blocks privilege escalation and self-lockout. |
| D-41 | Password reset knows the token, not the tenant. | Added `users.getByIdUnscoped`, used only inside the reset flow; request-scoped queries still require `restaurantId`. | The reset token is the capability; no tenant data bypasses the normal scoping. |
| D-42 | The 10 req/min login limit would block the lockout tests. | `loginRateLimiter` is skipped when `NODE_ENV=test`; the global 100 req/min limiter stays enabled. | Lockout is tested against the DB without fighting the limiter; production limits stay per NFR-S8. |
| D-43 | Coverage must be ≥ 80% for the auth services. | Added `@vitest/coverage-v8` and `npm run test:coverage` (V8, `src/services/**`, thresholds 80 lines/functions/statements, 75 branches). | Makes the acceptance criterion measurable. |
| D-44 | Restaurants need a unique slug derived from the name. | `slugify` (lowercase, ASCII, hyphens, max 70 chars) then `-2`, `-3` … until free, inside the register transaction. | FR-01 with deterministic, readable URLs. |
