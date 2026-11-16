# PHASE 01 – Repository scaffold, tooling, CI, local database

**Read:** `AGENTS.md`, `docs/02_ARCHITECTURE.md` (sections 4, 9, 10), `db/migrations/001_init.sql`, `.env.example`, `docker-compose.yml`.

## Goal
A running empty skeleton of all three packages with quality tooling, a working database, and CI.

## Tasks
1. Create the npm-workspaces monorepo: `apps/web`, `apps/api`, `packages/shared`. TypeScript `strict` everywhere; shared `tsconfig.base.json`.
2. `apps/api`: Express app with `helmet`, `cors` (origin from `FRONTEND_ORIGIN`), JSON body limit, request-id middleware (`X-Request-Id`), structured logging (pino), central error handler that returns the documented error format, `GET /api/v1/health` (checks DB with `select 1`), graceful shutdown. Config loaded and validated with zod from env.
3. `apps/api`: database module (`pg` Pool), migration runner that executes `db/migrations/*.sql` in order and records them in a `schema_migrations` table. Scripts: `db:migrate`, `db:reset`, `db:seed` (seed comes in phase 02).
4. `apps/web`: Next.js (App Router, TypeScript, Tailwind) with a placeholder home page and PWA setup (manifest, service worker via a maintained plugin or a minimal custom one).
5. `packages/shared`: export an empty zod/types package that both apps import (prove the import works).
6. Tooling: ESLint, Prettier, Husky pre-commit (lint-staged + typecheck), Vitest in api and shared, a root `npm run lint | typecheck | test | dev | build`.
7. GitHub Actions workflow `ci.yml`: install, lint, typecheck, test (with a Postgres service container and migrations applied), build.
8. `README.md`: prerequisites, setup steps (`docker compose up -d`, copy env files, migrate, run dev), scripts table, folder structure.

## Acceptance criteria
- `docker compose up -d && npm install && npm run db:migrate && npm run dev` starts web on 3000 and api on 4000.
- `GET /api/v1/health` returns `{ "data": { "status": "ok", "db": "up" } }`.
- Migration creates all 12 tables, indexes, and the trigger; running it twice does nothing.
- CI passes on a clean clone.
- A test proves unknown routes return the documented `NOT_FOUND` error shape.

## Do not
Write any business endpoints yet.
