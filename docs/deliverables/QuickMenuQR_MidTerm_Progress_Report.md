# Mid-Term Progress Report
## QuickMenu QR – Dynamic Multi-Language Restaurant Menu & Ordering

| Field | Detail |
|---|---|
| **Project No.** | #031 |
| **Course** | Project 1 (Lab), Department of Software Engineering Technology |
| **University** | Punjab Tianjin University of Technology |
| **Faculty Supervisor** | Dr. Zaigham Mushtaq |
| **Student** | Muhammad Haroon |
| **Reporting period** | Weeks 1 to 7 of 12 |
| **Repository** | [[FILL: GitHub repository URL]] |
| **Live prototype** | [[FILL: deployed URL, or "runs locally; demonstrated live"]] |

> Before submitting: replace every `[[FILL: ...]]` with your real value, set each status honestly, and delete anything that is not true for your project.

---

## 1. Executive Summary
QuickMenu QR lets a restaurant replace its printed menu with a QR code on each table. Customers scan the code, browse the menu on their phone without installing an app, and send their order straight to the kitchen. The owner updates prices and availability instantly, with no reprinting.

Over the first seven weeks the project completed its planning and design phase (problem analysis, requirements, architecture, database, API, and wireframes) and moved into implementation (repository, authentication, core order logic, and the first end-to-end user journey). This report summarizes the progress, the current state of the prototype, the test evidence, the challenges met, and the plan for the remaining five weeks.

## 2. Problem and Objectives

**Problem.** Cafes and restaurants spend thousands reprinting paper menus when prices change, and they struggle with multilingual customers and items that are out of stock.

**Objectives**
1. Digital menu opened by QR code, with photos, prices, and variants
2. Multi-language menu and dietary and allergen filtering
3. Direct ordering from the customer's phone to a live kitchen screen
4. Simple owner dashboard to manage the menu, tables, and QR codes
5. Pilot with 5 local campus cafes and restaurants (Month 4)

## 3. Progress Summary, Weeks 1 to 7

| Week | Milestone | Key deliverables | Document |
|---|---|---|---|
| 1 | Problem discovery and personas | User interviews, 2 personas, problem statement, 5 MVP features | Week 1 report |
| 2 | Software Requirements Specification | IEEE 830 SRS, 35 functional requirements, 12 use cases, quantified non-functional requirements, use case diagram | [SRS](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY) |
| 3 | High-level architecture and cloud topology | 3-tier architecture, DFD Level 0 and 1, system boundaries, cloud stack justification | [Architecture](https://claude.ai/artifact/Xi5fi2Gg9PGBu6Wn28qDuT) |
| 4 | Database modeling and UI wireframes | ERD (12 tables, 25 indexes), PostgreSQL schema, 43 REST endpoints, 6 wireframes | [Database, API, Wireframes](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx) |
| 5 | Scaffolding and core authentication | Git repository with branch protection, monorepo structure, database connection, multi-tenant register and login with bcrypt and JWT | Week 5 report |
| 6 | Core business logic and vertical slice | Order and pricing engine, server-side validation and error handling, first end-to-end slice | [Implementation prompt 06A](https://claude.ai/artifact/YDe17joZKx5cW2WzBJdQwA) |
| 7 | Working prototype milestone | End-to-end smoke test, mid-term report, slide deck, live demonstration | This report |

## 4. System Overview

**Architecture.** A 3-tier design: a Next.js progressive web app (presentation), a Node.js and Express API with WebSocket support (application), and PostgreSQL with Cloudinary for images (data). The API is stateless and every record belongs to one restaurant, so one deployment can serve many restaurants safely (multi-tenancy). See the [architecture document](https://claude.ai/artifact/Xi5fi2Gg9PGBu6Wn28qDuT#4-3-tier-architecture).

**Data model.** 12 tables (restaurants, users, categories, menu items, variants, images, tables, orders, order items, status history, translations, password-reset tokens) with 25 purpose-chosen indexes. Orders store a snapshot of item names and prices so past orders never change when the menu changes. See the [ERD](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#22-entity-relationship-diagram).

**API.** 43 REST endpoints with a documented error format and an order state machine (new, preparing, ready, served, cancelled). Implemented so far: [[FILL: number]] of 43. See the [API contract](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#3-api-contract-rest).

**Key technical rules**
- Order prices are always recalculated on the server from the database; client prices are ignored
- Order, order lines, and status history are saved in one database transaction, so no partial or lost orders
- A repeated submission with the same idempotency key returns the original order, so a double tap creates only one order
- Money is handled in whole paisa to avoid rounding errors
- Passwords are hashed with bcrypt, sessions use short-lived JWTs, and one restaurant can never read another restaurant's data

## 5. Implementation Status (Prototype)

Set each status to **Done**, **Partial**, or **Planned**.

| Feature | Status | Notes |
|---|---|---|
| Repository, CI, branch protection | [[FILL]] | |
| Owner registration and login (multi-tenant) | [[FILL]] | |
| Order and pricing engine | [[FILL]] | |
| Server-side validation and error handling | [[FILL]] | |
| Customer menu page opened from QR link | [[FILL]] | |
| Cart and place order | [[FILL]] | |
| Order status page for the customer | [[FILL]] | |
| Staff orders page (change order status) | [[FILL]] | |
| Menu builder (categories, items, variants, availability) | [[FILL]] | |
| Tables and QR code generation | [[FILL]] | |
| Image upload (Cloudinary) | [[FILL]] | |
| Search, dietary and allergen filters | [[FILL]] | |
| Multi-language translation | [[FILL]] | |
| Real-time kitchen display (WebSocket) | [[FILL]] | |
| Deployment to the cloud | [[FILL]] | |

## 6. Testing and Quality

**Automated tests**
- Unit and integration tests passing: [[FILL: number]]
- Coverage of backend business logic: [[FILL: percentage]] (target 70% or higher); order engine: [[FILL: percentage]] (target 90%)
- Tests cover correct totals, ignored client prices, duplicate-order protection, unavailable items, order status rules, authentication lockout, and cross-restaurant access blocked

**End-to-end smoke test (Week 7 milestone gate)**
- Full user journey executed: [[FILL: date and result, for example 14 of 14 steps passed]]
- Smoke test checklist and results: [Smoke Test and Live Demo Guide](https://claude.ai/artifact/Ruhgfu1eL1waKdL98Rhm6P)
- Evidence: [[FILL: screenshots or a short screen recording; test run output]]

**Performance and accessibility (if measured)**
- Menu page load: [[FILL: measured value or "not yet measured"]] (target: LCP 2.5 s or less on 4G)
- Order appears on the staff screen in: [[FILL: measured value]] (target: 2 s or less)

## 7. Challenges and How They Were Solved

| Challenge | Solution |
|---|---|
| A repeated order submission must return the same tracking token, but only a hash of the token was stored | The token is derived from the order ID with a secret key, so a retry produces the same token without storing it in plain form |
| Customers on slow networks can tap "Place Order" twice | Idempotency key per attempt plus a database unique constraint, so only one order is created |
| Translation service not yet chosen | Built behind an interface with a cached fake provider, so the real provider can be added without changing the rest of the code |
| Free hosting tiers can put a service to sleep, which would break a live kitchen screen | Plan for an always-on API plan during the pilot, with a polling fallback |
| [[FILL: a real implementation problem you faced]] | [[FILL: how you solved it]] |
| [[FILL: another real problem]] | [[FILL: solution]] |

## 8. Risks

| Risk | Impact | Mitigation | Status |
|---|---|---|---|
| Schedule: real-time kitchen display and deployment still remain | High | Order flow built first; polling fallback if WebSockets slip | [[FILL]] |
| Restaurant Wi-Fi drops during service | High | Automatic reconnect and missed-order recovery | Planned |
| Translation quality and cost | Medium | Cache translations; fall back to the original language | Planned |
| Few pilot restaurants agree to take part | Medium | Early contact with campus cafes; Week 1 interviewees as first candidates | [[FILL]] |

## 9. Plan for Weeks 8 to 12

Final weekly deliverables are set by the course portal; this plan follows the 4-month roadmap and will be adjusted.

| Week | Planned focus |
|---|---|
| 8 | Complete the owner dashboard (menu builder, tables, QR download); search, dietary and allergen filters; multi-language menu; UI polish |
| 9 | Real-time layer: WebSocket order alerts, live status updates, reconnect recovery |
| 10 | Kitchen display screen; automated end-to-end tests |
| 11 | Security review, performance and load testing, cloud deployment (staging and production), monitoring and backups |
| 12 | Pilot with campus cafes and restaurants, user feedback (usability survey), final report and demonstration |

## 10. Documents and Links

| Document | Link |
|---|---|
| Software Requirements Specification (Week 2) | [Open](https://claude.ai/artifact/M1eNnUTWyVoFcBg3g2ySwY) |
| Architecture and Cloud Topology (Week 3) | [Open](https://claude.ai/artifact/Xi5fi2Gg9PGBu6Wn28qDuT) |
| Database, API Contract and Wireframes (Week 4) | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx) |
| Implementation specification 06A, order engine and vertical slice (Week 6) | [Open](https://claude.ai/artifact/YDe17joZKx5cW2WzBJdQwA) |
| Engineering rules used for the build (AGENTS.md) | [Open](https://claude.ai/artifact/73EFcoBj83tDQbHXHYzJft) |
| Smoke test checklist and live demo guide (Week 7) | [Open](https://claude.ai/artifact/Ruhgfu1eL1waKdL98Rhm6P) |
| Source code repository | [[FILL: GitHub URL]] |

---

*End of Report*
