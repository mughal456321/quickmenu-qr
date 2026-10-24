# Week 4 Progress Report: QuickMenu QR

**Project:** #031 QuickMenu QR – Dynamic Multi-Language Restaurant Menu & Ordering
**Student:** Muhammad Haroon
**Faculty Advisor:** Dr. Zaigham Mushtaq
**Milestone:** Week 4 of 12 – Database Modeling & UI Wireframes

### 1. Work Completed
- Designed the **database model** in PostgreSQL and produced the **Entity-Relationship Diagram (ERD)** with 12 entities: restaurants, users, password_reset_tokens, categories, menu_items, item_variants, item_images, restaurant_tables, orders, order_items, order_status_history, and translations. The entities map to the data stores (D1 to D5) from the Week 3 DFD.
- Wrote the **data dictionary** (columns, types, constraints, descriptions), 4 enumerations, a relationship and cardinality table with delete rules, and the complete **PostgreSQL DDL** script.
- Defined **25 indexes** (beyond primary keys), each tied to a real query or rule:
  - composite B-tree for the customer menu query
  - partial index for active kitchen orders
  - GIN indexes for dietary and allergen filters and for fuzzy name search
  - unique indexes for QR tokens, emails, and duplicate-order prevention
- Documented database rules for data quality: price and quantity checks, a 3-image limit trigger, order price snapshots, idempotency key, tenant isolation, and hashed tokens.
- Specified the complete **REST API contract** with 43 endpoints across authentication, menu management, tables and QR, customer ordering, and kitchen operations. It includes conventions (versioning, JWT, pagination, idempotency, rate limits), a standard error format with 15 error codes, detailed request and response examples for key endpoints, the order status state machine, and the finalized WebSocket event contract.
- Compared REST and GraphQL and recorded the decision to use REST plus WebSockets.
- Designed **6 annotated UI wireframes** for the primary screens:
  1. Customer Menu (mobile)
  2. Cart and Place Order (mobile)
  3. Order Status (mobile)
  4. Owner Menu Builder (desktop)
  5. Tables and QR Codes (desktop)
  6. Kitchen Order Ticket Display (tablet or wall monitor)
- Added a navigation flow, numbered element tables mapped to requirements, and responsive and accessibility notes.
- Built a traceability table linking screens, use cases, API endpoints, and database tables to the SRS requirements.

### 2. Verified Deliverables
All Week 4 documents can be viewed online (one page, with the diagrams and wireframes shown in full):

**Full document:** [https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx)

| Deliverable | Link |
|---|---|
| Full Week 4 document (database, API, wireframes) | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx) |
| Database design and data dictionary | [Section 2](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#2-database-design) |
| Entity-Relationship Diagram (ERD) | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#22-entity-relationship-diagram) |
| Indexing definitions | [Section 2.7](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#27-indexing-definitions) |
| PostgreSQL DDL script | [Section 2.10](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#210-postgresql-ddl) |
| REST API contract (43 endpoints) | [Section 3](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#3-api-contract-rest) |
| Endpoint catalogue | [Section 3.4](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#34-endpoint-catalogue) |
| Order status state machine | [Section 3.6](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#36-order-status-state-machine) |
| UI wireframes (all 6 screens) | [Section 4](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#4-ui-wireframes) |
| Screen 1: Customer Menu | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#44-screen-1-customer-menu) |
| Screen 2: Cart and Place Order | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#45-screen-2-cart--place-order) |
| Screen 3: Order Status | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#46-screen-3-order-status) |
| Screen 4: Owner Menu Builder | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#47-screen-4-owner-menu-builder) |
| Screen 5: Tables and QR Codes | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#48-screen-5-tables--qr-codes) |
| Screen 6: Kitchen Order Ticket Display | [Open](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#49-screen-6-kitchen-order-ticket-display) |
| Traceability to SRS requirements | [Section 5](https://claude.ai/artifact/K5bggkXJ8Aw1YjC45bdchx#5-traceability) |

Files submitted with this report:
- `QuickMenuQR_Database_API_Wireframes.docx` / `.md`: full Week 4 document (v1.0)
- `QuickMenuQR_ERD.png`: Entity-Relationship Diagram
- `QuickMenuQR_Wireframe_1_CustomerMenu.png`
- `QuickMenuQR_Wireframe_2_CartOrder.png`
- `QuickMenuQR_Wireframe_3_OrderStatus.png`
- `QuickMenuQR_Wireframe_4_MenuBuilder.png`
- `QuickMenuQR_Wireframe_5_TablesQR.png`
- `QuickMenuQR_Wireframe_6_KitchenDisplay.png`
- Every SRS functional requirement (FR-01 to FR-35) is covered by at least one API endpoint, WebSocket event, or screen element, and every screen element is mapped to a requirement or use case

### 3. Next Week Objectives
- Set up the **GitHub repository**, Next.js and Node.js project skeletons, linting, and the CI pipeline
- Create the **database migration files** from the DDL and a seed script with demo data
- Implement **authentication**: register, login, token refresh, and account lockout
- Start the owner dashboard (category and item management) and export the API contract as an **OpenAPI 3** file
- Review the ERD, API contract, and wireframes with the faculty advisor and apply feedback
