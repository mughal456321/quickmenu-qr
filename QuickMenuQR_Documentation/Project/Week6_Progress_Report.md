# Week 6 Progress Report: QuickMenu QR

**Project:** #031 QuickMenu QR – Dynamic Multi-Language Restaurant Menu & Ordering
**Student:** Muhammad Haroon
**Faculty Advisor:** Dr. Zaigham Mushtaq
**Milestone:** Week 6 of 12 – Core Business Logic & Vertical Slice
**Repository:** [github.com/mughal456321/quickmenu-qr](https://github.com/mughal456321/quickmenu-qr)

### 1. Work Completed

**Core domain logic: the order and pricing engine**
- Built the core business logic as pure, database-free modules (easy to test and reuse):
  - **Money module:** all prices handled as integer minor units (paisa), never floating point, so totals have no rounding errors
  - **Pricing engine:** takes the menu data loaded from the database and the customer's cart, validates it, and returns priced order lines with name and price snapshots and the order total. Prices sent by the client are ignored.
  - **Business rules enforced:** 1 to 30 lines, quantity 1 to 50, items must belong to the table's restaurant, items must be available, variant required when an item has variants, variant must belong to the item
  - **Order state machine:** new, preparing, ready, served, cancelled, with only the allowed transitions from the Week 4 API contract
  - **Tracking token:** each order gets a secure token derived from the order ID; only its hash is stored in the database
  - **Idempotency:** a repeated submission with the same key returns the original order instead of creating a duplicate
- Typed domain errors (unavailable items, invalid variant, invalid quantity, empty order, too many lines)

**Server-side input validation and error handling**
- Shared zod schemas validate every request (body, query, params, headers); unknown fields are stripped unless a schema is explicitly strict, and field lengths and the 100 KB JSON body size are limited
- Validation failures return the documented `400 VALIDATION_ERROR` with field-level details
- A central error handler converts domain and database errors into the documented error format and codes (400, 401, 403, 404, 409, 422, 429, 500); stack traces, SQL, and internal messages are never exposed; every error response carries a request ID, and the API logs each request with that ID
- Rate limiting on public order creation (5 per minute per table and IP)

**End-to-end vertical slice (UI, API, database)**
- **Customer menu page** (`/m/{qrToken}`): shows categories, items with prices and tags, greyed-out unavailable items, a variant picker, and a cart bar (Wireframe 1)
- **Cart and Place Order** with quantity controls, special instructions, and clear server error messages; the idempotency key prevents duplicate orders on double taps or retries (Wireframe 2)
- **Order Status page** showing the order number and progress, refreshed every 5 seconds with the tracking token (Wireframe 3)
- **Staff orders page** (`/dashboard/orders`) where a logged-in owner or kitchen user sees active orders and moves them to the next status
- **API endpoints:** `GET /public/menu/{qrToken}`, `POST /public/orders`, `GET /public/orders/{id}`, `GET /orders`, `PATCH /orders/{id}/status`
- **Database:** each order is saved in one transaction: order counter update, order, order items with price snapshots, and the first status-history record. A failure rolls everything back, so no partial orders exist.

### 2. Verified Deliverables
- Automated tests: **151** tests passing (147 API integration/unit + 4 shared-package tests)
- Coverage: domain engine **100%** statements, branches, functions and lines (target 90% or higher); backend business logic **97.18% lines / 87.98% branches / 100% functions** (target 70% or higher)
- The tests prove: totals are correct; changed prices in the request are ignored; a repeated key creates exactly one order; an unavailable item returns 409 and stores nothing; **20** parallel orders get unique consecutive order numbers; a failed transaction leaves no partial order; one restaurant cannot read another's orders; every allowed and forbidden status change behaves as specified
- Property-based tests confirm that totals always equal the sum of line totals with no rounding drift
- End-to-end test (Playwright, mobile 360×740): **2 tests passing** — the full menu → cart → order → staff → status flow, plus a double-tap test that creates exactly one order. The GitHub Actions workflow at the repository root runs the same suite (`npx playwright install --with-deps chromium` then `npm run test:e2e`) and **passes on GitHub**: [CI run 41326613069](https://github.com/mughal456321/quickmenu-qr/actions/runs/41326613069) (lint, typecheck, tests, coverage, API and web builds, then Playwright). Locally the suite was also executed with the installed Microsoft Edge channel because the browser download is blocked on the development machine; CI uses the Playwright-bundled Chromium.
- Implementation specification used this week: [06A Order Engine and Vertical Slice](https://claude.ai/artifact/YDe17joZKx5cW2WzBJdQwA) and the project's [AGENTS.md engineering rules](https://claude.ai/artifact/73EFcoBj83tDQbHXHYzJft)
- Demo evidence: five screenshots from the automated end-to-end run — `01-menu.png`, `02-cart.png`, `03-order-status.png`, `04-staff-orders.png`, `05-customer-preparing.png` ([`docs/week6/`](https://github.com/mughal456321/quickmenu-qr/tree/master/quickmenu-qr-build-kit/quickmenu-qr-build-kit/docs/week6)); the step-by-step run book, SQL checks for the order rows/items/history/counter, and API error-case walkthrough are in [`docs/WEEK6_DEMO.md`](https://github.com/mughal456321/quickmenu-qr/blob/master/quickmenu-qr-build-kit/quickmenu-qr-build-kit/docs/WEEK6_DEMO.md)

**Linked project documents (viewable online)**

| Document | Week | Used for this week's work | Link |
|---|---|---|---|
| Functional requirements (FR-01 to FR-35) | 2 | Ordering requirements FR-23 to FR-29 | [Section 3.2](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#32-functional-requirements) |
| Use case specifications | 2 | UC-06 Browse Menu, UC-09 Place Order, UC-10 Track Order | [Section 3.3](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#33-use-case-specifications) |
| Non-functional requirements | 2 | No lost orders (NFR-R4), no duplicate orders (NFR-R5), security | [Section 3.4](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#34-non-functional-requirements-quantifiable) |
| Real-time order design | 3 | Order flow: save first, notify after | [Section 6](https://claude.ai/artifact/Xi5fi2Gg9PGBu6Wn28qDuT#6-real-time-design-orders-to-kitchen) |
| Architecture decisions | 3 | Layering and stateless API | [Section 11](https://claude.ai/artifact/Xi5fi2Gg9PGBu6Wn28qDuT#11-architecture-decisions) |
| Key query patterns | 4 | Order creation transaction | [Section 2.8](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#28-key-query-patterns) |
| Database business rules | 4 | Checks, snapshots, idempotency | [Section 2.9](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#29-business-rules-enforced-in-the-database) |
| Error format and codes | 4 | Server-side error handling | [Section 3.3](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#33-error-format) |
| Detailed API contracts | 4 | `POST /public/orders`, `GET /public/orders/{id}`, status update | [Section 3.5](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#35-detailed-contracts-for-key-endpoints) |
| Order status state machine | 4 | Allowed status transitions | [Section 3.6](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#36-order-status-state-machine) |
| Wireframe 1: Customer Menu | 4 | Menu page | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#44-screen-1-customer-menu) |
| Wireframe 2: Cart and Place Order | 4 | Cart and order page | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#45-screen-2-cart--place-order) |
| Wireframe 3: Order Status | 4 | Status page | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#46-screen-3-order-status) |
| **Week 6 implementation prompt (06A):** order engine, validation and error handling, vertical slice | 6 | The specification given to the coding agent for this week's work, with tasks, rules, tests, and acceptance criteria | [Open](https://claude.ai/artifact/YDe17joZKx5cW2WzBJdQwA) |
| **Engineering rules for the coding agent (AGENTS.md)** | 6 | Stack, architecture rules, security rules, and definition of done followed during implementation | [Open](https://claude.ai/artifact/73EFcoBj83tDQbHXHYzJft) |
| Full documents | 2, 3, 4 | Complete specification set | [SRS](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY) · [Architecture](https://claude.ai/artifact/Xi5fi2Gg9PGBu6Wn28qDuT) · [Database, API, Wireframes](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx) |

### 3. Next Week Objectives
- Build the **menu management API** (categories, items, variants, availability) and the **owner dashboard** Menu Builder screen
- Add **Cloudinary image upload** with signed uploads
- Add **tables and QR code generation** (PNG and PDF download)
- Extend the public menu with **search, dietary and allergen filters**
- Add tenant-isolation tests for every new endpoint
- Review this week's work with the faculty advisor and apply feedback
