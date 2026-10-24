# PHASE 05 – Tables, QR codes, public menu, translation

**Read:** `docs/03_DATABASE_API_WIREFRAMES.md` sections 3.4.3, 3.4.4, 3.5 (`GET /public/menu`, `POST /tables`); `docs/01_SRS.md` FR-14..FR-22, UC-05..UC-08; `DECISIONS.md` D-3, D-8.

## Goal
Processes 3.0 and 4.0.

## Tasks
1. **Tables API:** `GET/POST /tables`, `PATCH/DELETE /tables/{id}`. QR token = 16+ random URL-safe characters from `crypto.randomBytes`. Delete returns `409 CONFLICT` if the table has orders (suggest deactivating).
2. **QR download:** `GET /tables/{id}/qr?format=png|pdf` encoding `PUBLIC_MENU_BASE_URL/{qrToken}`. PNG with a quiet zone and error correction level M or higher; PDF is A6 with the restaurant name, "Table N", and the QR code, ready to print.
3. **Public menu:** `GET /public/menu/{qrToken}` with `lang`, `dietary` (comma list, must all match), `exclude` (comma list of allergens), `q` (name search). Response shape exactly as in section 3.5. Only active categories and the restaurant's items; unavailable items are returned with `isAvailable: false` so the UI can grey them out. Invalid token -> `404`; inactive table -> `422 TABLE_INACTIVE`. Images use Cloudinary transformation URLs (`w_400,q_auto,f_auto`).
4. **Translation:** implement `TranslationProvider` (interface, `FakeTranslationProvider`, and one real adapter chosen by `TRANSLATION_PROVIDER`). For each text, compute `source_hash`, look it up in `translations`; translate only cache misses in one batched call; upsert results. If the provider fails or times out (3 s), return the original text and `warnings: ["TRANSLATION_UNAVAILABLE"]`. Never block the menu on translation.
5. `GET /public/languages` returns the supported list (en, ur, ar, zh, fr at minimum) with native names and `rtl` flag.
6. **Menu cache** (5 seconds, invalidated on owner writes) per `DECISIONS.md` D-8; set `Cache-Control: public, max-age=5`.
7. Rate-limit public endpoints per `AGENTS.md`.

## Tests
QR token uniqueness; PNG decodes back to the right URL (use a QR decoder library in test); filters (vegetarian + exclude nuts); search; translation cache hit/miss counts; fallback on provider failure; inactive table; cross-tenant isolation; performance check: menu with 200 items responds in under 300 ms on the seeded database (log the measurement).

## Acceptance criteria
Endpoints in 3.4.3 and 3.4.4 (except orders) behave as documented; p95 target noted in the test output.
