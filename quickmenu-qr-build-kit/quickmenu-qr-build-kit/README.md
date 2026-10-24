# QuickMenu QR

Multi-tenant digital menu and ordering system for cafes and restaurants.
Customers scan a table QR code, browse a translated menu, and order from their
phone. Orders appear instantly on a kitchen screen.

## Repository layout

```
quickmenu-qr-build-kit/
├── AGENTS.md, CLAUDE.md, DECISIONS.md, README.md
├── .env.example  .gitignore  docker-compose.yml  eslint.config.js
├── package.json (root) + workspaces: ["apps/*", "packages/*"]
├── apps/
│   ├── api/                       # Express + TypeScript
│   │   ├── src/server.ts           # app, middleware, error handler, graceful shutdown
│   │   ├── src/config.ts           # zod-validated env
│   │   ├── src/db.ts               # pg Pool, withTransaction, healthCheck
│   │   ├── src/db/migrate.ts       # runs db/migrations/*.sql, schema_migrations table
│   │   ├── src/db/seed.ts          # Cafe Aroma demo data (Phase 02)
│   │   ├── src/repositories/       # all SQL: one module per table (Phase 02)
│   │   ├── src/services/           # business rules (auth, staff, restaurant)
│   │   ├── src/controllers/        # request parsing -> services -> envelope
│   │   ├── src/lib/                # password, tokens, cookies, slug, asyncHandler
│   │   ├── src/mail/               # Mailer interface + console adapter (D-4)
│   │   ├── src/middleware/         # requestId, cors, errorHandler, auth, rateLimit
│   │   ├── src/routes/             # health, auth, staff, restaurant
│   │   ├── src/test/               # Vitest setup (real test database)
│   │   └── openapi.yaml
│   └── web/                        # Next.js App Router + Tailwind + PWA
│       ├── src/app/               # layout, page, globals.css
│       ├── public/                 # manifest.json, icons, sw.js
│       └── next.config.js
├── packages/shared/                # zod schemas + TS types shared by web & api
│   └── src/schemas.ts, types.ts
├── db/
│   ├── migrations/001_init.sql     # approved schema (12 tables + trigger)
│   └── seeds/001_seed.sql          # Cafe Aroma demo data (Phase 02)
├── docs/                           # spec documents and diagrams
├── prompts/                        # 00_MASTER_PROMPT.md + 10 phase prompts
└── .github/workflows/ci.yml
```

## Prerequisites

- Node.js LTS (20 or newer)
- Git
- Docker Desktop (for the local database)

## Setup (about 15 minutes)

1. `docker compose up -d` – starts PostgreSQL on `localhost:5432`.
2. `npm install`
3. `npm run db:migrate` – applies `db/migrations/001_init.sql`.
4. `npm run db:seed` – populates the demo restaurant (Phase 02).
5. `npm run dev` – starts the API on `:4000` and the web on `:3000`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start API (`:4000`) and web (`:3000`) |
| `npm run db:migrate` | Apply all migrations in order (idempotent) |
| `npm run db:reset` | Drop all public tables and re-apply migrations |
| `npm run db:seed` | Populate the demo restaurant |
| `npm run lint` | ESLint across all packages |
| `npm run typecheck` | `tsc --noEmit` across all packages |
| `npm run test` | Vitest (API + shared) |
| `npm run test:coverage` | API tests with V8 coverage (services ≥ 80%) |
| `npm run build` | Build shared, API, and web |

## Authentication (Phase 03)

All routes are under `/api/v1`. Owner/kitchen routes require
`Authorization: Bearer <accessToken>`; the refresh token lives in the
`qm_refresh` HttpOnly cookie (7 days).

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | Creates restaurant + owner; returns tokens |
| POST | `/auth/login` | public | 10 req/min per IP; locks after 5 failures (423) |
| POST | `/auth/refresh` | cookie | Issues a new 60-minute access token |
| POST | `/auth/logout` | bearer | Clears the refresh cookie |
| POST | `/auth/forgot-password` | public | Always 202; console mailer in development |
| POST | `/auth/reset-password` | public | Single-use token, valid 30 minutes |
| GET | `/me` | bearer | Current user + restaurant |
| GET / POST | `/staff` | owner | List / create kitchen accounts |
| PATCH / DELETE | `/staff/{id}` | owner | Update/deactivate/reset or delete |
| GET | `/restaurant` | bearer | Restaurant profile |
| PATCH | `/restaurant` | owner | Name, default language, currency |

Demo accounts from `npm run db:seed`: `owner@cafearoma.pk` / `CafeAroma2026!`
and `kitchen@cafearoma.pk` / `KitchenCafe2026!`.

## Verification

- `GET /api/v1/health` returns `{ "data": { "status": "ok", "db": "up" } }`.
- Migrations create all 12 tables, indexes, and the `trg_limit_item_images` trigger;
  `npm run db:reset && npm run db:seed` works and is repeatable.
- Unknown routes return the documented `NOT_FOUND` error shape with `X-Request-Id`.
- Phase 02: 17 repository tests (tenant isolation, constraints, trigger,
  transaction rollback, Q1–Q5, `ix_orders_active`).
- Phase 03: auth/staff/restaurant tests covering FR-01…FR-05, NFR-S2/S3/S4/S6;
  `npm run test:coverage` keeps services ≥ 80%.
- `npm run lint`, `npm run typecheck`, and `npm test` all pass.
- `npm run build` succeeds for shared, API, and web.
- CI passes on a clean clone (`.github/workflows/ci.yml`).

## Phases

See `prompts/00_MASTER_PROMPT.md` for the full plan. Each phase is a separate
prompt in `prompts/01_*.md` … `prompts/10_*.md`. Follow them one at a time.