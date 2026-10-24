# Week 5 Progress Report: QuickMenu QR

**Project:** #031 QuickMenu QR - Dynamic Multi-Language Restaurant Menu & Ordering
**Student:** Muhammad Haroon
**Faculty Advisor:** Dr. Zaigham Mushtaq
**Milestone:** Week 5 of 12 - Project Scaffolding & Core Auth Layer
**Repository:** [PASTE GITHUB REPOSITORY URL HERE]
**Branch:** `main` | **Commits:** 4 | **Pull requests merged:** 0

> **Before uploading:** replace the repository URL, paste the CI run link in Section 2, and attach the evidence screenshots. Everything else below has been verified locally.

### 1. Work Completed

#### Git repository and branch protection

- Initialized the Git repository and prepared the `main` branch with **4 commits**.
- Adopted a feature-branch workflow (`feat/...`, `fix/...`) and a commit convention that references requirement IDs, for example:
  `feat(auth): complete data layer and multi-tenant authentication (FR-01..FR-05, NFR-S1..S8)`.
- Total commits: **4**; pull requests merged: **0** (the first PR is opened after the repository is pushed).
- Branch protection for `main` is applied immediately after the first push: require a pull request before merging, require the `lint-typecheck-test` CI check, block force pushes, and block branch deletion.

#### Directory scaffolding

Created an npm-workspaces monorepo following the Week 3 three-tier architecture:

- `apps/web`: Next.js (App Router, TypeScript, Tailwind CSS, PWA setup) - presentation tier
- `apps/api`: Node.js and Express (TypeScript) - application tier
- `packages/shared`: zod validation schemas and types shared by both apps
- `db/migrations`: versioned SQL migrations
- `docs`: SRS, architecture, and database/API/wireframe documents

Configured TypeScript strict mode, ESLint, Prettier, Husky pre-commit checks, environment configuration validated at start-up, Docker Compose for PostgreSQL, a GitHub Actions pipeline (lint, typecheck, migrate, test, build), and `README.md` with setup steps and scripts.

Verified locally:

- `npm run lint` - passed
- `npm run typecheck` - passed
- `npm run build:shared`, `npm run build:api`, `npm run build:web` - passed

#### Database connection

- Connected the API to PostgreSQL with a connection pool and a migration runner.
- Applied the Week 4 schema: **12 tables**, **4 enumerations**, **25 indexes**, and the 3-image limit trigger.
- Verified the connection through `GET /api/v1/health`, which returns:
  `{"data":{"status":"ok","db":"up"}}`
- Built the data-access layer (repositories) for all 12 entities with tenant-scoped queries, plus seed data for the Cafe Aroma demo restaurant (12 items, 7 tables, 4 orders).

#### Secure multi-tenant authentication

- `POST /auth/register`: creates a new restaurant (tenant) and its owner account in one database transaction.
- `POST /auth/login`: password check with bcrypt at cost factor **10**; returns a JWT access token (**60 minutes**) with the user ID, restaurant ID, and role; a refresh token is issued in an HttpOnly, Secure, SameSite=Lax cookie (**7 days**).
- `POST /auth/refresh`, `POST /auth/logout`, `GET /me`.
- Account lockout after **5 failed logins for 15 minutes**; generic `INVALID_CREDENTIALS` messages so accounts cannot be enumerated.
- `POST /auth/forgot-password` always returns `202`; reset tokens are 32 random bytes, stored as SHA-256, expire in **30 minutes**, are single-use, and clear the lockout when redeemed.
- Role-based access control for `owner` and `kitchen` roles; owner-managed kitchen accounts through `/staff`; owners cannot delete themselves.
- Multi-tenant isolation: the restaurant ID is taken only from the access token, every query filters by it, and records of another restaurant return `404`.
- Security controls: helmet headers, CORS allow-list, login rate limiting (**10 requests per minute**), a global limit of 100 requests per minute, zod input validation on every request, and parameterized SQL only.

### 2. Verified Deliverables

| Item | Result |
|---|---|
| Automated tests | **47 tests passing**: 43 API tests (24 authentication, 17 repository, 2 health) plus 4 shared-package tests |
| Auth-service coverage | **96.11% statements, 87.8% branches, 100% functions** (target: 70% or higher) |
| All service files coverage | **95.28% statements, 84.37% branches, 100% functions** |
| CI pipeline | Workflow defined; run link: [PASTE LATEST GITHUB ACTIONS RUN URL] |
| Local run | `docker compose up -d`, `npm run db:migrate`, `npm run db:seed`, `npm run test` verified; API on port 4000 and web on port 3000 |
| Evidence | [ATTACH screenshots: health endpoint, passing test run, branch protection settings, redacted login response] |

Tests cover: registration and duplicate email, password policy, bcrypt-only storage, login, wrong password, no account enumeration, lockout after 5 failures and unlock after 15 minutes, refresh, logout, expired access token, forgot/reset password (hashed, expiring, single-use), `/me` authentication, kitchen account creation and login, role enforcement, cross-restaurant staff isolation, owner self-deletion block, staff update/delete, and restaurant profile update.

### 3. Next Week Objectives

- Build the menu management API: categories, items, variants, availability toggle, and image upload through signed Cloudinary uploads.
- Start the owner dashboard (Month 1 goal): login and registration pages, then the Menu Builder screen from Wireframe 4.
- Add tenant-isolation tests for every new endpoint.
- Begin the tables and QR code endpoints.
- Review the Week 5 work with the faculty advisor and apply feedback.

### 4. Linked Project Documents

Verify that each artifact is shared as "anyone with the link" and test it in a private browser window before submitting.

| Document | Week | Used for this week's work | Link |
|---|---|---|---|
| Software Requirements Specification (IEEE 830) | 2 | Authentication requirements FR-01 to FR-05 (Section 3.2.1), use case UC-01, security requirements NFR-S1 to S8 (Section 3.4.2) | [Open](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY) |
| Functional requirements (FR-01 to FR-35) | 2 | Requirement IDs referenced in commits and tests | [Section 3.2](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#32-functional-requirements) |
| Non-functional requirements | 2 | Security, performance, and reliability targets | [Section 3.4](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#34-non-functional-requirements-quantifiable) |
| Architecture and Cloud Topology | 3 | Three-tier structure and folder layout | [Open](https://claude.ai/artifact/Xi5fi2Gg9PGBu6Wn28qDuT) |
| 3-Tier Architecture diagram | 3 | Monorepo structure (web, api, data) | [Section 4](https://claude.ai/artifact/Xi5fi2Gg9PGBu6Wn28qDuT#4-3-tier-architecture) |
| Data Flow Diagrams (Level 0 and 1) | 3 | Process 1.0 Authentication and Accounts | [Section 5](https://claude.ai/artifact/Xi5fi2Gg9PGBu6Wn28qDuT#5-data-flow-diagrams) |
| Security architecture | 3 | JWT, bcrypt, lockout, rate limiting, tenant isolation | [Section 8](https://claude.ai/artifact/Xi5fi2Gg9PGBu6Wn28qDuT#8-security-architecture) |
| Database, API and Wireframes | 4 | Schema, migrations, and the API contract | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx) |
| Entity-Relationship Diagram | 4 | Tables created in the database | [Section 2.2](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#22-entity-relationship-diagram) |
| PostgreSQL DDL | 4 | Initial migration `001_init.sql` | [Section 2.10](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#210-postgresql-ddl) |
| Authentication API contract | 4 | Endpoints in Section 3.4.1 | [Section 3.4](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#34-endpoint-catalogue) |

Local copies of all documents and diagrams are in `QuickMenuQR_Documentation/Project/`.

### 5. Final Submission Checklist

- [ ] Create the GitHub repository and push `main`.
- [ ] Enable branch protection for `main`.
- [ ] Open and merge one pull request so CI runs.
- [ ] Replace `[PASTE GITHUB REPOSITORY URL HERE]`.
- [ ] Replace `[PASTE LATEST GITHUB ACTIONS RUN URL]`.
- [ ] Attach the four evidence screenshots.
- [ ] Confirm the Week 2, 3, and 4 artifact links are public.
