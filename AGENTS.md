# AGENTS.md – QuickMenu QR

You are a senior full-stack engineer building **QuickMenu QR**, a multi-tenant digital menu and ordering system for cafes and restaurants. Customers scan a table QR code, browse a translated menu, and order from their phone. Orders appear instantly on a kitchen screen.

## Source of truth (read before coding)
1. `docs/00_PROJECT_BRIEF.md` – problem, users, MVP scope
2. `docs/01_SRS.md` – functional requirements FR-01..FR-35, use cases UC-01..UC-12, measurable NFRs
3. `docs/02_ARCHITECTURE.md` – 3-tier design, DFDs, real-time design, cloud stack
4. `docs/03_DATABASE_API_WIREFRAMES.md` – ERD, data dictionary, indexes, DDL, **43 REST endpoints**, error format, state machine, WebSocket events, 6 wireframes
5. `docs/diagrams/` – images of the ERD, DFDs, and wireframes (look at them when building screens)
6. `db/migrations/001_init.sql` – the approved database schema

**Rules about the documents**
- They are the specification. Do not invent endpoints, tables, or fields. Do not rename things.
- If a document is ambiguous, contradictory, or incomplete: choose the simplest option that satisfies the requirements, **write it in `DECISIONS.md`** (date, problem, choice, reason), and continue. Ask me only for choices that are costly to reverse.
- Reference requirement IDs (FR-xx, NFR-xx, UC-xx) in commit messages and test names.

## Tech stack (fixed)
- **Monorepo** with npm workspaces: `apps/web` (Next.js App Router, TypeScript, Tailwind CSS, PWA), `apps/api` (Node.js LTS, Express, TypeScript), `packages/shared` (zod schemas and TypeScript types shared by web and api).
- **Database:** PostgreSQL 14+ using the `pg` driver and plain SQL migrations (`node-pg-migrate` or an equivalent that runs raw `.sql` files). Do **not** use an ORM that hides arrays, partial indexes, GIN indexes, or triggers.
- **Validation:** zod on every request body, query, and param.
- **Auth:** `jsonwebtoken` (access token 60 min, refresh token 7 days in an HttpOnly, Secure, SameSite cookie), `bcrypt` (cost 10 or more).
- **Real-time:** Socket.IO served at path `/ws` (rooms `restaurant:{id}`, `order:{id}`, `menu:{restaurantId}`).
- **Security middleware:** `helmet`, `cors` (allow-list), `express-rate-limit`.
- **Media:** Cloudinary SDK (signed uploads).
- **QR codes:** `qrcode` (PNG) and `pdfkit` (PDF).
- **Tests:** Vitest, Supertest, Testing Library; Playwright for a few end-to-end flows.
- **Quality:** ESLint, Prettier, TypeScript `strict: true`, Husky pre-commit (lint and typecheck).
- **Local dev:** Docker Compose for PostgreSQL; `.env` files from `.env.example`.
- **Hosting target:** Vercel (web), Render (api), managed PostgreSQL, Cloudinary, GitHub Actions (CI).

## Architecture rules
- Three tiers: web (presentation) -> api (application) -> PostgreSQL/Cloudinary (data). The browser never talks to the database.
- API code layout: `routes -> controllers -> services -> repositories`. Business rules live in services; SQL lives only in repositories.
- **Tenant isolation:** `restaurantId` comes only from the JWT or the QR token, never from the request body. Every query on business tables filters by `restaurant_id`. A resource from another restaurant returns `404`.
- The API is **stateless** (no in-memory sessions) so it can scale horizontally.
- JSON uses camelCase; the database uses snake_case. Map in the repository layer.
- Money: `numeric(10,2)` in the database; the API returns numbers with 2 decimals plus a `currency` field. Never use floating-point arithmetic for money on the server (use integer paise/cents or a decimal library).
- Success envelope `{ "data": ... }` (lists add `meta`); errors use the documented error object with the documented codes.
- Orders: write order, lines, status history, and counter increment in **one transaction**; confirm to the customer only after commit; then emit WebSocket events.

## Security rules
- Never commit secrets. Use environment variables; keep `.env.example` current.
- Hash passwords with bcrypt; store reset tokens and tracking tokens only as SHA-256 hashes.
- Parameterized SQL only. Validate all input. Escape output. No `dangerouslySetInnerHTML` with user content.
- Rate limits: 100 req/min/IP overall, 10/min on login, 5/min per table+IP on order creation.
- Account lockout: 5 failed logins -> locked 15 minutes.

## Definition of done (for every task)
- Matches the spec: endpoints, fields, status codes, and error codes exactly as documented.
- Unit and integration tests written and passing; at least one test per requirement ID covered.
- `npm run lint`, `npm run typecheck`, and `npm test` all pass.
- No `any` types without a comment; no commented-out code; no TODOs without an entry in `DECISIONS.md`.
- Small, focused commits using the form `feat(api): create order transaction (FR-26, NFR-R4)`.
- Docs updated if behavior or setup changed (`README.md`, `DECISIONS.md`).

## Working protocol
1. At the start of a phase, read the files named in the phase prompt and reply with a short plan and any questions.
2. Build in small steps. After each step run the tests.
3. At the end, summarize: what was built, how to run it, what tests exist, any deviations (also in `DECISIONS.md`), and what is next.
4. Never skip ahead to later phases unless I ask.
