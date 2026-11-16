# Week 7 Progress Report: QuickMenu QR

**Project:** #031 QuickMenu QR – Dynamic Multi-Language Restaurant Menu & Ordering
**Student:** Muhammad Haroon
**Faculty Advisor:** Dr. Zaigham Mushtaq
**Milestone:** Week 7 of 12 – Live Working Prototype Milestone Gate
**Repository:** https://github.com/mughal456321/quickmenu-qr
**Live prototype:** Runs locally (API on `:4000`, web on `:3000`) and is reachable from a phone on the same Wi-Fi through the table QR code; demonstrated live to the supervisor on [[FILL: date and time]].

### 1. Work Completed

**End-to-end smoke test**
- Prepared and executed a 16-step smoke test of the complete user journey: owner registration and login, menu and table setup, QR code, customer menu from the QR link, cart, order placement, staff handling of the order, status updates, and the customer's status page
- Verified the protective behaviors in the same run: wrong-password handling, out-of-stock items blocked, a double tap creating only one order, invalid input rejected with clear messages, and the saved order rows checked directly in the database
- Result: **16 of 16 steps passed** on build `75c10c4` (16 November 2026). The run log is committed at `docs/week7/smoke-test-run.log`
- Fixed **3 defects** found while preparing the demonstration:
  1. Scanning the table QR from a phone showed "localhost refused to connect" because the link encoded the laptop's `localhost`; QR links now use the machine's LAN address and the API accepts it as an origin (`53b2319`)
  2. The development database was killed along with Docker on the 8 GB laptop, taking the API down mid-demo; added `npm run db:local`, which runs PostgreSQL 18 from `node_modules` on the same port with the same credentials (`bbae219`)
  3. When port 3000 was busy, Next.js moved the app to 3001 and every API call failed the origin check, which looked like "server not found"; the API now accepts any `localhost` port in development while production stays strict (`75c10c4`)
- Automated the same journey as 5 Playwright end-to-end tests (`e2e/order-flow`, `e2e/dashboard-flow`, `e2e/kitchen-flow`) that run in CI and produce the screenshots in `docs/week6/`

**Mid-Term Progress Report**
- Compiled the Mid-Term Progress Report covering Weeks 1 to 7: objectives, weekly progress, system overview (3-tier architecture, 12-table database, 43-endpoint API), implementation status, test results, challenges and solutions, risks, and the plan for Weeks 8 to 12

**Slide deck**
- Prepared the mid-term presentation covering the problem, solution, architecture, live demo flow, test evidence, challenges, and remaining plan: [[FILL: slide deck link or file name]]

**Live demonstration**
- Prepared a timed 8 to 10 minute demo script (owner side, customer side, staff side, an error case, and test results), a backup screen recording, and answers to likely supervisor questions (REST vs GraphQL, PostgreSQL choice, duplicate-order protection, price tampering, tenant isolation, security, scaling)
- Demonstration to the faculty supervisor: [[FILL: date and time, and a one-line outcome or the feedback received]]

### 2. Verified Deliverables
- Smoke test: **16 of 16** steps passed on build `75c10c4`; evidence: `docs/week7/smoke-test-run.log` plus screenshots `docs/week6/01-menu.png`, `02-cart.png`, `03-order-status.png`, `04-staff-orders.png`, `05-customer-preparing.png`
- Automated tests: **213** passing (188 API, 4 shared contracts, 21 web); backend business-logic coverage **95.3%** of statements and lines (86.0% of branches), target 70% or higher; order engine coverage **100%**, target 90%
- CI pipeline: passing — lint, typecheck, coverage, both builds and Playwright in GitHub Actions: [run 43871564383](https://github.com/mughal456321/quickmenu-qr/actions/runs/43871564383)
- Prototype status: the main customer journey (scan, browse, order, track) and the staff order handling work end to end; features still to come are listed in the plan below

| Check (16 November 2026) | Command | Result |
|---|---|---|
| Lint | `npm run lint` | clean (API, web, shared) |
| Types | `npm run typecheck` | clean (API, web, shared) |
| Unit and integration tests | `npm test` | 213 passed, 0 failed |
| Backend coverage | `npm run test:coverage` | 95.27% statements/lines, 86.02% branches, 100% functions |
| Production build | `npm run build` | shared, API and web compiled; Next.js build succeeded |
| End-to-end tests | `npm run test:e2e` | 5 passed (1.9 min) |
| Smoke test | 16-step checklist | 16 passed |

**Submitted and linked documents (viewable online)**

| Deliverable | Link |
|---|---|
| **Mid-Term Progress Report** (Weeks 1 to 7) | [Open](https://claude.ai/artifact/45bnkzSfWMmP1G7J76WbWZ) |
| **Smoke Test Checklist and Live Demo Guide** (16 steps, demo script, Q&A) | [Open](https://claude.ai/artifact/Ruhgfu1eL1waKdL98Rhm6P) |
| Mid-Term Slide Deck | [[FILL: link to your slides]] |
| Source code repository | https://github.com/mughal456321/quickmenu-qr |

**Earlier project documents**

| Document | Week | Link |
|---|---|---|
| Software Requirements Specification (IEEE 830) | 2 | [Open](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY) |
| Architecture and Cloud Topology (3-tier, DFDs) | 3 | [Open](https://claude.ai/artifact/Xi5fi2Gg9PGBu6Wn28qDuT) |
| Database, API Contract and UI Wireframes | 4 | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx) |
| Implementation specification 06A: order engine and vertical slice | 6 | [Open](https://claude.ai/artifact/YDe17joZKx5cW2WzBJdQwA) |
| Engineering rules used for the build (AGENTS.md) | 6 | [Open](https://claude.ai/artifact/73EFcoBj83tDQbHXHYzJft) |

**Requirements covered by the smoke test**

| Requirement | Where it is defined | Link |
|---|---|---|
| FR-01, FR-02: registration and login | SRS functional requirements | [Section 3.2](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#32-functional-requirements) |
| FR-06 to FR-16: menu management, tables and QR codes | SRS functional requirements | [Section 3.2](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#32-functional-requirements) |
| FR-17 to FR-29: browsing, cart, ordering, status | SRS functional requirements | [Section 3.2](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#32-functional-requirements) |
| FR-30 to FR-34: staff order handling and offline recovery | SRS functional requirements | [Section 3.2](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#32-functional-requirements) |
| UC-06 Browse Menu, UC-09 Place Order, UC-10 Track Order, UC-12 Update Order Status | SRS use cases | [Section 3.3](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#33-use-case-specifications) |
| NFR-R1, NFR-R4, NFR-R5: health, no lost orders, no duplicate orders | SRS non-functional requirements | [Section 3.4](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#34-non-functional-requirements-quantifiable) |
| NFR-S8: order rate limit (5 per minute per table) | SRS non-functional requirements | [Section 3.4](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY#34-non-functional-requirements-quantifiable) |
| Customer screens (menu, cart, order status) | Week 4 wireframes | [Screen 1](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#44-screen-1-customer-menu) · [Screen 2](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#45-screen-2-cart--place-order) · [Screen 3](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#46-screen-3-order-status) |
| Order status rules | Week 4 API contract | [Section 3.6](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#36-order-status-state-machine) |

### 3. Next Week Objectives
- Apply the supervisor's feedback from the live demonstration: [[FILL: list the feedback items]]
- Publish the prototype on public URLs (Render blueprint for the API, Vercel for the web app) and keep a stable demo link for the supervisor and the pilot restaurant
- Run the pilot with a campus cafe: real menu, real tables, and a short usability survey with customers and staff
- Close the deferred security work: resolve the `npm audit` findings (22 advisories: 10 moderate, 7 high, 5 critical) and re-run the load test against the deployed stack
- Add database backup and restore; the current `db:local` setup ships no `pg_dump`, so there is no export path today
- Keep lint, typecheck, the 213 unit tests, the 5 Playwright tests and the 16-step smoke test green in CI after every change
