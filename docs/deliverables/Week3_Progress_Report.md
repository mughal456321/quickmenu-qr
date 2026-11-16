# Week 3 Progress Report: QuickMenu QR

**Project:** #031 QuickMenu QR – Dynamic Multi-Language Restaurant Menu & Ordering
**Student:** Muhammad Haroon
**Faculty Advisor:** Dr. Zaigham Mushtaq
**Milestone:** Week 3 of 12 – High-Level Architecture & Cloud Topology

### 1. Work Completed
- Designed the **3-Tier Architecture** and produced the architecture diagram:
  - **Tier 1, Presentation:** Next.js PWA containing the Customer Menu, Owner Dashboard, and Kitchen Display (KOT)
  - **Tier 2, Application:** Node.js API server with REST endpoints, WebSocket server, authentication and role-based access, and business services
  - **Tier 3, Data:** managed PostgreSQL plus Cloudinary for media
- Created the **Data Flow Diagram Level 0 (context diagram)** showing the system and its 5 external entities (Customer, Restaurant Owner, Kitchen Staff, Translation API, Cloudinary).
- Created the **Data Flow Diagram Level 1**, decomposing the system into 6 processes (Authentication, Menu Management, Table & QR Management, Menu Browsing & Translation, Order Processing, Kitchen Order Management) and 5 data stores (Users & Restaurants, Menu Data, Tables, Orders, Translation Cache). Level 0 and Level 1 are balanced.
- **Defined system boundaries:** components inside the boundary, external parties, out-of-scope items, and four trust boundaries (Internet to Edge, Edge to API, API to Database, API to third parties).
- **Designed the real-time order path:** order saved to the database first, then pushed to the kitchen over WebSocket (target ≤ 2 s), with auto-reconnect and missed-order recovery.
- **Selected and justified the cloud infrastructure stack:**
  - Vercel for Next.js hosting (CDN, SSR)
  - Render for the Node.js API (persistent WebSocket support)
  - Managed PostgreSQL (automated backups)
  - Cloudinary (image optimization)
  - Cloudflare (DNS and WAF)
  - GitHub Actions (CI/CD)
  - UptimeRobot and Sentry (monitoring)
- Compared alternatives (AWS/Azure/GCP, fully serverless, single VPS, Firebase, polling) and recorded why each was not chosen.
- Documented the security architecture, scalability and reliability plan, environments (local, staging, production), 8 architecture decisions, and a risk table.
- Built a traceability table linking architecture elements to SRS requirements (FR and NFR).

### 2. Verified Deliverables
- `QuickMenuQR_Architecture_Document.md`: complete architecture and cloud topology document (v1.0)
- `QuickMenuQR_3Tier_Architecture.png`: 3-tier architecture diagram
- `QuickMenuQR_DFD_Level0.png`: DFD Level 0
- `QuickMenuQR_DFD_Level1.png`: DFD Level 1
- Cloud stack justification table (Section 7 of the document)
- Every Week 2 non-functional target (performance, uptime, security) is mapped to an architectural mechanism

### 3. Next Week Objectives
- Design the **Entity-Relationship Diagram (ERD)** and the PostgreSQL schema from the Level 1 data stores
- Define the **REST API contract** (endpoints, request and response formats) and the final WebSocket event contract
- Produce **UI wireframes** for the customer menu, owner dashboard, and KOT screen
- Choose the translation provider and confirm the supported languages
- Initialize the GitHub repository, project skeletons (Next.js and Node.js), and the CI pipeline
