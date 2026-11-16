# PHASE 10 – Hardening, testing, deployment, pilot readiness

**Read:** `docs/01_SRS.md` section 3.4 (all NFRs), `docs/02_ARCHITECTURE.md` sections 7 to 10, `AGENTS.md`.

## Goal
Prove the NFRs, deploy to the cloud, and prepare the 5-restaurant pilot.

## Tasks
1. **Security review:** run `npm audit`, OWASP ZAP baseline against staging, verify headers (HSTS, CSP, X-Content-Type-Options), cookie flags, CORS allow-list, rate limits, lockout, tenant isolation tests for every endpoint (generate the matrix from the route table), and that no secrets or stack traces leak in errors.
2. **Performance:** load test with k6 or Artillery: 500 concurrent customer sessions browsing and ordering and 25 kitchen sockets; record API p95/p99, order-to-kitchen latency, error rate (targets: p95 at most 300 ms, p99 at most 800 ms, order-to-kitchen at most 2 s for 95%, errors at most 1%). Fix hot spots (check `EXPLAIN` for the main queries). Run Lighthouse on the customer menu and dashboard pages.
3. **Quality:** coverage report (backend business logic at least 70%), Playwright end-to-end suite in CI, accessibility checks, cross-browser smoke tests, RTL check for Urdu and Arabic.
4. **Deployment:** Vercel for `apps/web`, Render web service for `apps/api` (WebSocket-capable, health check at `/api/v1/health`, always-on plan for the pilot), managed PostgreSQL in the same region, Cloudinary account, Cloudflare in front. Separate **staging** and **production** environments with separate databases and secrets. CI/CD: merge to `main` deploys staging; manual promotion to production. Run migrations as a release step. Document every environment variable.
5. **Operations:** UptimeRobot (or equivalent) on `/health`, Sentry for web and api, structured logs, daily database backup verified with a **restore test** (record the result), `docs/RUNBOOK.md` (deploy, rollback, restore, rotate secrets, what to do if the kitchen screen is offline).
6. **Pilot kit:** onboarding script (create restaurant, import first menu), a one-page owner guide and a kitchen guide (screenshots), a printable QR stand template, and a feedback survey including the System Usability Scale (target SUS at least 70).
7. **Final documentation:** update `README.md`, `DECISIONS.md`, API docs as an OpenAPI 3 file generated or hand-written to match the implementation, and a short architecture-as-built note listing any deviation from the Week 3 and Week 4 documents.

## Acceptance criteria
A table in `docs/NFR_RESULTS.md` lists every NFR from the SRS with the measured result and how it was measured; anything not met is listed with a plan. Staging and production are live and a full order flow works on a real phone.
