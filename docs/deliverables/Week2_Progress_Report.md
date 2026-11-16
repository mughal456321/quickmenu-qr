# Week 2 Progress Report: QuickMenu QR

**Project:** #031 QuickMenu QR – Dynamic Multi-Language Restaurant Menu & Ordering
**Student:** Muhammad Haroon
**Faculty Advisor:** Dr. Zaigham Mushtaq
**Milestone:** Week 2 of 12 – Software Requirements Specification (SRS)

### 1. Work Completed
- Authored the formal **IEEE 830 Software Requirements Specification (SRS)** covering Introduction, Overall Description, Specific Requirements, and Appendices.
- Defined **35 functional requirements (FR-01 to FR-35)** across authentication, menu management, QR management, customer browsing, ordering, and the Kitchen Order Ticket (KOT) screen, each with a priority rating.
- Wrote **12 formal Use Case specifications (UC-01 to UC-12)** with actors, preconditions, postconditions, main flows, alternative flows, and exceptions.
- Produced the **System Use Case Diagram** showing 3 primary actors (Customer, Restaurant Owner, Kitchen Staff) and 2 external services (Translation API, Cloudinary).
- Specified **quantifiable Non-Functional Requirements** in six categories (performance, security, reliability, usability, compatibility, maintainability), each with a measurement method. Examples:
  - Menu page load: LCP ≤ 2.5 s on 4G
  - API response: p95 ≤ 300 ms
  - Order-to-kitchen latency: ≤ 2 s for 95% of orders
  - Uptime: ≥ 99.5% per month
  - Security: HTTPS TLS 1.2+, bcrypt hashing, 60-minute session expiry, account lockout after 5 failed logins
- Built a **Requirements Traceability Matrix** mapping each of the 5 Week 1 MVP features to use cases, functional requirements, and NFRs.
- Documented risks, mitigations, and open issues, and outlined the logical database entities.

### 2. Verified Deliverables
- `QuickMenuQR_SRS_IEEE830.md`: complete SRS document (v1.0)
- `QuickMenuQR_UseCase_Diagram.png`: system use case diagram
- Use case specifications (Section 3.3 of the SRS)
- Non-functional requirements with measurable targets (Section 3.4 of the SRS)
- Traceability matrix confirming every MVP feature is covered by at least one use case and requirement

### 3. Next Week Objectives
- Design the system architecture (client, API, WebSocket, database, Cloudinary) with a component diagram
- Create the Entity-Relationship Diagram (ERD) and PostgreSQL schema from the SRS entities
- Define REST API endpoints and the WebSocket event contract for orders
- Produce initial wireframes for the owner dashboard and customer menu
- Set up the GitHub repository and the Next.js and Node.js project skeletons
