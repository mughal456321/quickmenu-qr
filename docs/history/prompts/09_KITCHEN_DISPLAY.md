# PHASE 09 – Kitchen Order Ticket display

**Read:** `docs/03_DATABASE_API_WIREFRAMES.md` section 4 (wireframe 6 and element table), view `docs/diagrams/QuickMenuQR_Wireframe_6_KitchenDisplay.png`; `docs/02_ARCHITECTURE.md` section 6; `docs/01_SRS.md` UC-11, UC-12, FR-30..FR-34, NFR-P3, NFR-R3.

## Goal
`/kitchen` for kitchen and owner accounts, built for a tablet or wall monitor.

## Tasks
1. Login for kitchen users (reuse auth), redirect to `/kitchen`; kitchen role cannot open the owner dashboard.
2. Three-column board (New, Preparing, Ready) with counts, filter tabs (All, New, Preparing, Ready), cards showing `#orderNumber`, table, minutes since order (updates every 30 s), items with variants and quantities, highlighted customer notes and per-line instructions, one-tap primary action (Start Preparing, Mark Ready, Mark Served) and a Cancel button with confirmation.
3. Real time: connect Socket.IO with the access token; on connect load `kot:sync`; handle `order:new` (add card, play an audible alert and flash the card, with a Sound ON/OFF toggle; browsers need a user gesture, so show a one-time "Enable sound" prompt), `order:status` (move or remove cards). Status changes sent via the socket event `order:update_status` with a REST fallback.
4. Connection state: "Live" indicator; on disconnect show a red banner "Reconnecting...", retry with backoff, and after reconnect run `kot:sync` so no order is missed; keep a polling fallback every 5 s while disconnected.
5. Keep the screen awake where supported (Screen Wake Lock API), large text, high-contrast status colors with text labels, works in landscape and portrait.
6. Served and cancelled orders leave the board after 10 seconds (still available through `GET /orders` history).

## Tests
Component tests for the board and transitions; Playwright with two pages: customer places an order -> appears on the kitchen page within 2 seconds -> kitchen advances status -> customer page updates; simulate offline for 15 s and verify recovery with no lost order.

## Acceptance criteria
New orders appear in under 2 seconds on a local network (measure and record); reconnect recovers within 10 seconds; no duplicate cards after reconnect.
