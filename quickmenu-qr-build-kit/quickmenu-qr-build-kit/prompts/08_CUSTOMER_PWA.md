# PHASE 08 – Customer mobile PWA

**Read:** `docs/03_DATABASE_API_WIREFRAMES.md` section 4 (wireframes 1 to 3 and element tables), view `docs/diagrams/QuickMenuQR_Wireframe_1_CustomerMenu.png`, `..._2_CartOrder.png`, `..._3_OrderStatus.png`; `docs/01_SRS.md` UC-06..UC-10, FR-17..FR-29, NFR-P1, NFR-U1, NFR-U3..U5, NFR-C1..C3.

## Goal
The customer experience at `/m/{qrToken}`: no login, fast, mobile-first.

## Tasks
1. Route `/m/[qrToken]`: server-render the menu (Next.js server components or `generateMetadata` + fetch with revalidate 5 s) so the first paint is fast; hydrate for interaction.
2. **Screen 1 – Menu:** header with restaurant name, table badge, language selector; search; dietary and allergen filter chips; sticky category tabs with scroll-spy; item cards with lazy-loaded optimized images, tags, price (range when variants), **+ Add** (variant picker sheet when needed); out-of-stock cards greyed with no Add button; sticky cart bar. Language choice persisted in `sessionStorage` (wrap in try/catch). RTL layout for Urdu and Arabic (`dir="rtl"`, logical CSS properties). Show a small non-blocking notice when `warnings` includes `TRANSLATION_UNAVAILABLE`.
3. **Screen 2 – Cart:** cart state persisted per table token in `sessionStorage`; quantity stepper, remove, special instructions, totals computed for display only (server recalculates); **Place Order** sends `Idempotency-Key` (generate once per attempt, reuse on retry); handle `ITEM_UNAVAILABLE` by showing which items changed and asking to confirm; handle offline/failure with a retry that never creates duplicates.
4. **Screen 3 – Order status:** show order number, live progress tracker (Received, Preparing, Ready, Served; Cancelled state), items, total; connect via Socket.IO with `orderId` and `trackingToken`; fall back to polling every 5 s if the socket fails; store the tracking token in `sessionStorage`. "Back to menu" returns to Screen 1.
5. Live availability: subscribe to `menu:updated` and update cards without reload.
6. PWA: manifest, icons, service worker caching static assets and the last menu response (stale-while-revalidate); installable but not required.
7. Performance budget: LCP at most 2.5 s on simulated 4G mid-range mobile; JS for the menu route under 150 KB gzipped if achievable; images through Cloudinary transformations.

## Tests
Component tests for cart logic and filters; Playwright (mobile viewport 360 x 740): scan route -> filter -> add 2 items -> place order -> see status update when the kitchen advances it (API-driven in the test); a duplicate-tap test proving only one order is created; RTL snapshot test.

## Acceptance criteria
A first-time user can place an order in 6 taps or fewer; Lighthouse mobile performance at least 90 and accessibility at least 90 on the menu page; works on Chrome, Safari (iOS 14+), Firefox, and Samsung Internet.
