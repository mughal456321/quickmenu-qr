# QuickMenu QR

Multi-tenant digital menu and ordering system for cafes and restaurants.
Customers scan a table QR code, browse a translated menu, and order from their
phone. Orders appear instantly on a kitchen screen.

- **Customer PWA** — translated menu, dietary/allergen filters, search, cart,
  live order status, installable on a phone.
- **Owner dashboard** — menu builder, variants, photos, tables and printable QR
  codes, staff accounts, settings.
- **Kitchen display** — three-column real-time board with sound, reconnect
  recovery and a screen wake lock.

## Repository layout

```
quickmenu-qr-build-kit/quickmenu-qr-build-kit/
├── apps/
│   ├── api/                       # Express + TypeScript + Socket.IO
│   │   ├── src/server.ts          # app, security middleware, graceful shutdown
│   │   ├── src/config.ts          # zod-validated environment
│   │   ├── src/db.ts              # pg pool, transactions, migrations
│   │   ├── src/routes/            # auth, staff, restaurant, menu, tables,
│   │   │                          # public, orders, health
│   │   ├── src/controllers/       # request -> service -> envelope
│   │   ├── src/services/          # business rules and transactions
│   │   ├── src/repositories/      # all SQL, one module per table
│   │   ├── src/domain/            # pricing, status machine, tracking tokens
│   │   ├── src/realtime/          # Socket.IO auth, rooms, kot:sync
│   │   ├── src/lib/               # tokens, media, translation, cache
│   │   └── src/middleware/        # auth, CORS, rate limits, error handler
│   └── web/                       # Next.js App Router + Tailwind + PWA
│       ├── src/app/               # login, register, dashboard, kitchen,
│       │                          # customer menu (/m/[qrToken]), order status
│       ├── src/components/        # shared UI, toast, confirm dialog
│       ├── src/lib/               # API client, auth, cart, filters, realtime
│       └── public/                # manifest, service worker, icons
├── packages/shared/               # zod schemas + TS types shared by web & api
├── db/migrations/001_init.sql     # approved schema (12 tables + trigger)
├── docs/                          # SRS, architecture, API contract, runbook
├── e2e/                           # Playwright flows
├── load/                          # local and k6 load probes
└── render.yaml (repo root)        # Render blueprint for the API
```

## Prerequisites

- Node.js LTS (20 or newer)
- Git
- Docker Desktop (for the local database)

## Setup (about 15 minutes)

1. `docker compose up -d` — starts PostgreSQL on `localhost:5432`.
2. `npm install`
3. `cp .env.example apps/api/.env` and `cp .env.example apps/web/.env.local`
   (keep only `NEXT_PUBLIC_API_URL` in the web file if you prefer).
4. `npm run db:migrate` — applies `db/migrations/001_init.sql`.
5. `npm run db:seed` — populates the Cafe Aroma demo restaurant.
6. `npm run dev` — API on `:4000`, web on `:3000`.

Open `http://localhost:3000` for the entry page, or log in directly:

| Role | URL | Email | Password |
|---|---|---|---|
| Owner | `/login` | `owner@cafearoma.pk` | `CafeAroma2026!` |
| Kitchen | `/login` → `/kitchen` | `kitchen@cafearoma.pk` | `KitchenCafe2026!` |

The seed prints a table QR token. Open `http://localhost:3000/m/<qrToken>` on a
phone-sized viewport to use the customer app.

If Docker Desktop does not fit in the machine's memory, or it keeps getting
killed while the dev servers run, start the same PostgreSQL without Docker:

```sh
npm run db:local   # starts PostgreSQL 18 from node_modules, data in .pgdata/
```

Run it in its own terminal and use `npm run db:migrate` / `npm run db:seed` /
`npm run dev` in the others. It listens on the same `localhost:5432` with the
same `quickmenu` / `quickmenu` credentials, so nothing else changes; Compose
remains the default path and CI still uses it.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start API (`:4000`) and web (`:3000`) |
| `npm run build` | Build shared, API, and web |
| `npm run start:api` | Run the built API (`node apps/api/dist/server.js`) |
| `npm run start:web` | Run the built Next.js app |
| `npm run db:migrate` | Apply all migrations in order (idempotent) |
| `npm run db:reset` | Drop all public tables and re-apply migrations |
| `npm run db:seed` | Populate the demo restaurant (idempotent) |
| `npm run db:local` | Run PostgreSQL from node_modules instead of Docker |
| `npm run lint` | ESLint across all packages |
| `npm run typecheck` | `tsc --noEmit` across all packages |
| `npm test` | API + shared + web unit tests |
| `npm run test:coverage` | API tests with V8 coverage |
| `npm run test:e2e` | Playwright flows (order, dashboard, kitchen) |

Local Playwright can use an installed browser instead of the bundled one:
`PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` (PowerShell:
`$env:PLAYWRIGHT_CHANNEL='msedge'; npm run test:e2e`).

## API

All routes are under `/api/v1`. Success is `{ "data": ... }` (lists add `meta`);
errors are `{ "error": { "code", "message", "requestId", "details"? } }`.
`docs/openapi.yaml` is the full contract.

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `GET /me` |
| Staff | `GET/POST /staff`, `PATCH/DELETE /staff/{id}` |
| Restaurant | `GET/PATCH /restaurant` |
| Menu | `GET/POST /categories`, `PATCH/DELETE /categories/{id}`, `PUT /categories/order`, `GET/POST /items`, `GET/PATCH/DELETE /items/{id}`, `PATCH /items/{id}/availability`, `POST /items/{id}/variants`, `PATCH/DELETE /variants/{id}`, `POST /media/upload-signature`, `POST /items/{id}/images`, `DELETE /images/{id}` |
| Tables | `GET/POST /tables`, `PATCH/DELETE /tables/{id}`, `GET /tables/{id}/qr?format=png\|pdf` |
| Public | `GET /public/menu/{qrToken}`, `GET /public/languages`, `POST /public/orders`, `GET /public/orders/{id}` |
| Orders | `GET /orders`, `GET /orders/{id}`, `PATCH /orders/{id}/status` |

Auth is a 60-minute access token in the `Authorization: Bearer` header plus a
7-day refresh token in the `qm_refresh` HttpOnly cookie. Rate limits: 100
req/min/IP overall, 10/min on login, 5/min per table+IP on order creation.

Order statuses: `new → preparing → ready → served`, with `cancelled` allowed from
the three active states. The transition matrix lives in
`apps/api/src/domain/statusMachine.ts`.

### WebSocket

Socket.IO is served at `/ws` with rooms `restaurant:{id}`, `order:{id}` and
`menu:{restaurantId}`. Staff authenticate with `auth.token`; customers with
`{ orderId, trackingToken }`; the menu room with `menu:join { qrToken }`.
Events: `order:new`, `order:status`, `order:update_status` (ack), `kot:sync`,
`menu:updated`.

## Documentation

| Document | Purpose |
|---|---|
| `docs/01_SRS.md` | Requirements FR-01..FR-35, UC-01..UC-12, NFRs |
| `docs/02_ARCHITECTURE.md` | 3-tier design, DFDs, real-time design |
| `docs/03_DATABASE_API_WIREFRAMES.md` | ERD, DDL, 43 endpoints, wireframes |
| `docs/openapi.yaml` | OpenAPI 3 contract for the implemented API |
| `docs/ARCHITECTURE_AS_BUILT.md` | What was built and deviations (with decision ids) |
| `docs/NFR_RESULTS.md` | Every NFR with measured result, evidence, or plan |
| `docs/RUNBOOK.md` | Deploy, rollback, restore, rotate secrets, kitchen offline |
| `docs/PILOT_KIT.md` | Onboarding script, owner/kitchen guides, QR stand, SUS survey |
| `DECISIONS.md` | Every ambiguity and the choice made |

## Design system and demo content

The web app uses a warm editorial palette instead of default utility colours:
cream `canvas` `#FAF7F2`, ink `#151412`, persimmon `accent` `#C2441D`, hairline
`line` `#E9E2D8`, and a dark `night` canvas for the kitchen board. Inter is the
body face and Instrument Serif (`display` class) carries headings and numbers;
both are loaded with `next/font/google`. Tokens live in
`apps/web/tailwind.config.js`, utilities (`display`, `tabular`, `no-scrollbar`,
`safe-bottom`) in `apps/web/src/app/globals.css`, and primitives in
`apps/web/src/components/ui.ts`.

The seeded Cafe Aroma menu uses twelve dish photos that ship with the web app in
`apps/web/public/demo/`. Each is an openly licensed image from Wikimedia
Commons, square-cropped to 1000x1000; author, licence and source links are in
`apps/web/public/demo/ATTRIBUTION.md`. Re-download them with
`node scripts/fetch-demo-images.mjs` (it needs Wikipedia API access and
PowerShell's `System.Drawing` for the crop). Production uploads still go to
Cloudinary; the seed only needs URLs that work offline.

## Scanning a table QR from a phone

The QR code encodes `PUBLIC_MENU_BASE_URL`, and the browser bundle calls
`NEXT_PUBLIC_API_URL`, so both must use an address the phone can reach. A phone
cannot resolve `localhost`: that is the phone itself.

1. Find the PC's LAN IPv4 address (`ipconfig`, usually `192.168.x.x`).
2. In `apps/api/.env` set
   `PUBLIC_MENU_BASE_URL=http://<lan-ip>:3000/m` and add the same host to the
   allow-list: `FRONTEND_ORIGIN=http://localhost:3000,http://<lan-ip>:3000`.
   `FRONTEND_ORIGIN` accepts a comma-separated list, so desktop and phone
   browsing work at the same time.
3. In `apps/web/.env.local` set `NEXT_PUBLIC_API_URL=http://<lan-ip>:4000/api/v1`.
4. Restart both dev servers, allow inbound TCP 3000 and 4000 through the Windows
   firewall, then download the QR again from **Dashboard -> Tables & QR codes**;
   previously downloaded images still contain the old address.
5. Keep the phone on the same network and open `http://<lan-ip>:3000/m/<token>`
   to test without scanning.

## Deployment

- **API:** Render web service from `render.yaml` in the repository root. Build
  `npm ci && npm run build:shared && npm run build:api`; pre-deploy
  `npm run db:migrate`; start `node apps/api/dist/server.js`; health check
  `/api/v1/health`. Staging auto-deploys from `main`; production is promoted
  manually.
- **Web:** Vercel project with root directory
  `quickmenu-qr-build-kit/quickmenu-qr-build-kit/apps/web` and
  `NEXT_PUBLIC_API_URL=https://api.<domain>/api/v1`.
- **Database:** managed PostgreSQL in the same region, daily backups.
- Set every variable in `.env.example`; never commit secrets.

`docs/RUNBOOK.md` has the full checklist, rollback and restore drill.

## Verification

- `GET /api/v1/health` returns `{ "data": { "status": "ok", "db": "up" } }`.
- Migrations create all 12 tables, indexes, and the `trg_limit_item_images`
  trigger; `npm run db:reset && npm run db:seed` is repeatable.
- API: 184 tests covering FR-01..FR-35, NFR-S2..S8, NFR-R4/R5, with coverage
  above 95% statements (services above 94%).
- Web: 21 unit tests for the cart, filters, kitchen board and image delivery.
- Playwright: customer order flow, owner menu/table/QR flow, kitchen real-time
  and offline recovery.
- Load: 500 customer sessions + 25 kitchen sockets, 0% errors; p95 90.6 ms,
  p99 234.8 ms, order-to-kitchen p95 46.1 ms (`docs/NFR_LOAD_RESULTS.json`).
- Security: headers, safe errors, tenant-isolation matrix and 429 rate limiting
  (`apps/api/src/routes/security.test.ts`).
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass.
- CI: `.github/workflows/ci.yml` at the repository root; the app lives in
  `quickmenu-qr-build-kit/quickmenu-qr-build-kit`.

## Phases

See `prompts/00_MASTER_PROMPT.md`; each phase is a separate prompt in
`prompts/01_*.md` … `prompts/10_*.md`.
