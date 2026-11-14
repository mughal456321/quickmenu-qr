# NFR results (Phase 10)

Every non-functional requirement in `docs/01_SRS.md` section 3.4 with the
measured result and how it was measured. Measurements marked **measured** were
taken on this repository; **pending** items need cloud accounts, real users, or
hardware that is not available in the build environment. Each pending row has a
concrete plan and an owner-visible next step.

## Environment used for local measurements

| Item | Value |
|---|---|
| API | Production build (`tsup` → `node dist/server.js`), `NODE_ENV=production`, `DB_POOL_MAX=50` |
| Database | PostgreSQL 16 in Docker on the same laptop |
| Web | `next build` output (`next start`) |
| Load tool | `load/node-load.mjs` (500 sessions, 25 kitchen sockets, concurrency 50, think time ≤ 1.5 s) |
| Raw results | `docs/NFR_LOAD_RESULTS.json` |
| Date | 2026-11-13 |

Local numbers are a lower bound for a cloud deployment in one region, and an
upper bound for nothing: they include Docker networking and a shared laptop CPU.
Re-run the same probe against staging with `load/k6.js` before the pilot.

## Performance

| ID | Target | Result | Status | Evidence / plan |
|---|---|---|---|---|
| NFR-P1 | Customer menu LCP ≤ 2.5 s, interactive ≤ 3 s on 4G for 95% of loads | Not measured yet | **Pending** | Run Lighthouse (mobile, 4G throttle) on `/m/<qrToken>` against staging; plan: `npx lighthouse <url> --preset=desktop` and the mobile default. The menu is server-rendered with no blocking third-party script; images are lazy-loaded. |
| NFR-P2 | API p95 ≤ 300 ms, p99 ≤ 800 ms | p95 **90.6 ms**, p99 **234.8 ms** (all requests); menu p95 215.5 ms; orders p95 66.3 ms / p99 86.2 ms | **Met locally** | `docs/NFR_LOAD_RESULTS.json`, 1 000 requests, 0 errors, 56 req/s. Re-run with `load/k6.js` on staging. |
| NFR-P3 | New order on KOT ≤ 2 s for 95% of orders | p95 **46.1 ms**, p99 46.7 ms (20 samples); Playwright asserts the card in < 5 s | **Met locally** | `orderToKitchenMs` in `docs/NFR_LOAD_RESULTS.json`; `e2e/kitchen-flow.spec.ts`. |
| NFR-P4 | Language switch ≤ 1.5 s cached, ≤ 3 s uncached | Not timed | **Pending** | The menu is cached per `(restaurant, table, language, filters)` for 5 s; switching language is a client fetch plus rerender. Measure with the Performance panel on staging for `?lang=ur` and `?lang=ar` (first and second request). |
| NFR-P5 | Product images ≤ 200 KB after Cloudinary optimization | Delivery URLs request `f_auto,q_auto,w_800`; actual bytes not measured | **Partial** | `apps/web/src/lib/images.ts` (with unit tests) rewrites Cloudinary URLs. Verify one hero image in DevTools Network on staging, then mark met. |
| NFR-P6 | ≥ 500 concurrent customer sessions and ≥ 25 KOT sockets, ≤ 1% errors | **500 sessions + 25 sockets, 0% errors** | **Met locally** | `load/node-load.mjs`; 500 menu reads + 500 order writes, all `200`/`201`. |

## Security

| ID | Target | Result | Status | Evidence / plan |
|---|---|---|---|---|
| NFR-S1 | HTTPS/TLS 1.2+, HTTP redirects to HTTPS, SSL Labs grade A | Local: helmet sends HSTS. Cloud: not deployed yet | **Pending** | Vercel and Render terminate TLS and redirect HTTP. After the first staging deploy, run an SSL Labs scan and paste the grade here. |
| NFR-S2 | bcrypt cost ≥ 10, no plaintext passwords stored or logged | Cost **10** everywhere (`lib/password.ts`, seed) | **Met** | `apps/api/src/routes/auth.test.ts` (NFR-S2 hash test); code review. |
| NFR-S3 | Access token 60 min, refresh ≤ 7 days | Access **60 min**, refresh **7 days** in `qm_refresh` HttpOnly/SameSite=Lax | **Met** | `lib/tokens.ts`, auth tests. Cookies are `Secure` in production. |
| NFR-S4 | Lock after 5 failed logins for 15 minutes | 5th failure sets `locked_until = now() + 15 min`, returns `423 ACCOUNT_LOCKED` | **Met** | `apps/api/src/routes/auth.test.ts` (lockout cases). |
| NFR-S5 | Parameterized SQL, zero SQL injection/XSS | All SQL uses `$1…$n`; React escapes output; API sends a deny-all CSP | **Met (code review)** | `rg "query\(\`"` shows no concatenated user input. OWASP ZAP baseline against staging is **pending** (needs a deployed URL). |
| NFR-S6 | 0 cross-tenant leaks | **0 leaks** across the endpoint matrix | **Met** | `apps/api/src/routes/security.test.ts`: menu, tables, orders, staff and public order endpoints all return 404/400 for another tenant. |
| NFR-S7 | No personal data collected for ordering | No name, phone or email on the customer path | **Met** | Design review: `POST /public/orders` takes only `qrToken`, `items`, optional `notes`. |
| NFR-S8 | 100 req/min/IP | 101st request in a minute returns `429 RATE_LIMITED`; login 10/min, orders 5/min per table+IP | **Met** | `apps/api/src/routes/security.test.ts`; limits are configured in `server.ts` and `middleware/orderRateLimit.ts`. |

## Reliability and availability

| ID | Target | Result | Status | Evidence / plan |
|---|---|---|---|---|
| NFR-R1 | ≥ 99.5% monthly uptime | Not monitored yet | **Pending** | Create an UptimeRobot monitor on `https://api.<domain>/api/v1/health` (1-minute interval, email alert) after the pilot deploy. Record the first month here. |
| NFR-R2 | Daily backups, RPO ≤ 24 h, RTO ≤ 4 h, restore test recorded | Not performed (local Docker has no managed backups) | **Pending** | Enable the managed PostgreSQL daily backup on Render, then perform the restore drill in `docs/RUNBOOK.md` §6 and record the elapsed time here. |
| NFR-R3 | KOT socket reconnects within 10 s and recovers missed orders | Socket.IO heartbeat reduced to 5 s + 5 s (≤ 10 s detection); the browser `offline`/`online` events update the pill immediately; on connect the server emits `kot:sync`; while offline the board polls every 5 s | **Met (design + E2E)** | `e2e/kitchen-flow.spec.ts` offline test; reconnect logic in `app/kitchen/page.tsx` and `lib/kitchenBoard.ts`. |
| NFR-R4 | No order lost: persist before confirming | Order, lines, history and counter commit in one transaction, then the response is sent and events fire | **Met** | `services/orderService.ts`; transaction/rollback tests in `routes/orders.test.ts`. |
| NFR-R5 | Idempotency, 0 duplicate orders | Reused `Idempotency-Key` returns the original order (`200`); `client_request_id` is unique in the database | **Met** | `routes/orders.test.ts` (FR-28, NFR-R5), plus property tests. |

## Usability and accessibility

| ID | Target | Result | Status | Evidence / plan |
|---|---|---|---|---|
| NFR-U1 | First order ≤ 3 min and ≤ 6 taps | Not tested with users | **Pending** | The happy path is: scan → add item → View cart → Place order = **4 taps**. Run the 5-user pilot test in `docs/PILOT_KIT.md` and fill in the median. |
| NFR-U2 | Add a menu item ≤ 2 min | Not tested with users | **Pending** | Dashboard → Add item → name/price → Save. Time an owner during onboarding. |
| NFR-U3 | WCAG 2.1 AA, Lighthouse accessibility ≥ 90 | Manual review only | **Pending** | Labels on every input, `aria-pressed` on toggles, visible focus rings, ≥ 4.5:1 text contrast. Run Lighthouse accessibility against staging and record the score. |
| NFR-U4 | ≥ 5 languages (en, ur, ar, zh, fr) | All 5 return in `/public/languages`; Urdu and Arabic set `dir="rtl"` | **Met** | `SUPPORTED_LANGUAGES` in `packages/shared/src/types.ts`; `CustomerMenu.tsx`; translation tests. |
| NFR-U5 | Touch targets ≥ 44 × 44 px | Primary actions use `py-3` (≈ 44–48 px); filter chips `py-2` | **Met (review)** | Manual review of the customer menu and kitchen board. Re-check on a 360 px device during the pilot. |
| NFR-U6 | SUS ≥ 70 | Not surveyed yet | **Pending** | `docs/PILOT_KIT.md` includes the 10-question SUS form and scoring sheet. Target: 5–10 pilot users. |

## Compatibility and portability

| ID | Target | Result | Status | Evidence / plan |
|---|---|---|---|---|
| NFR-C1 | Chrome, Safari, Firefox, Samsung Internet (latest 2), Android 9+, iOS 14+ | Chromium/Edge automated flows pass | **Pending** | Playwright covers Chromium locally. Run the same specs with `PLAYWRIGHT_CHANNEL=chrome` and a WebKit project on staging; smoke-test Safari on a real iPhone. |
| NFR-C2 | Lighthouse PWA + Performance ≥ 90 | Not measured | **Pending** | Manifest + service worker are in `apps/web/public`. Run Lighthouse against the production web build and record both categories. |
| NFR-C3 | Usable from 320 px to 1280 px | `E2E` runs at 360 px; kitchen board at 1280 px | **Partial** | Layout uses fluid grids and `min-[900px]` breakpoints. Add a 320 px check during the pilot device pass. |

## Maintainability and scalability

| ID | Target | Result | Status | Evidence / plan |
|---|---|---|---|---|
| NFR-M1 | ≥ 70% backend business-logic coverage | **95.26% statements** overall; **94.18%** statements in `src/services` | **Met** | `npm run test:coverage`; see the coverage summary in the Phase 10 report. |
| NFR-M2 | Onboard a restaurant in ≤ 15 min with no code changes | Register → menu → tables in one session | **Pending (manual timing)** | Follow `docs/PILOT_KIT.md` §2 and record the elapsed time for the first pilot restaurant. |
| NFR-M3 | Scale to 50 restaurants by adding resources only | Stateless API; sockets broadcast through rooms; PostgreSQL is the only shared state | **Met (design review)** | No in-process user sessions. The 5 s menu cache is per instance and safe to duplicate. Horizontal scaling needs sticky sessions only if long-polling is used; the client prefers WebSocket. |

## Summary

| Status | Count |
|---|---|
| Met / met locally | 17 |
| Partial | 2 |
| Pending (cloud, users, or hardware) | 12 |

Nothing is failing. The pending items are proof tasks, not missing features,
except NFR-P5 (Cloudinary delivery transformation), which must be enabled when
the Cloudinary account is connected.

## How to reproduce the measured rows

```bash
npm run db:seed

# Terminal 1 — production API
npm run build:shared
npm run build:api
cd apps/api && NODE_ENV=production DB_POOL_MAX=50 node dist/server.js

# Terminal 2 — probe
API_URL=http://localhost:4001/api/v1 node load/node-load.mjs
```

On Windows PowerShell, set `$env:NODE_ENV='production'` and
`$env:DB_POOL_MAX='50'` before `node dist/server.js`, and
`$env:API_URL='http://localhost:4001/api/v1'` before the probe.

For staging, use `load/k6.js` with `BASE_URL`, `QR_TOKEN` and `ITEM_ID` from an
active table (see `docs/RUNBOOK.md` §7).
