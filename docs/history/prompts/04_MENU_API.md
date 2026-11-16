# PHASE 04 – Menu management API

**Read:** `docs/03_DATABASE_API_WIREFRAMES.md` sections 3.4.2, 3.5 (`POST /items`, `PATCH /items/{id}/availability`); `docs/01_SRS.md` FR-06..FR-13, UC-02..UC-04; wireframe 4.

## Goal
Process 2.0: categories, items, variants, availability, and image handling. Owner-only endpoints.

## Endpoints
`/categories` (GET, POST), `/categories/{id}` (PATCH, DELETE with `?force=true`), `PUT /categories/order`; `/items` (GET with `categoryId`, `q`, `page`; POST), `/items/{id}` (GET, PATCH, DELETE), `PATCH /items/{id}/availability`; `/items/{id}/variants` (POST), `/variants/{id}` (PATCH, DELETE); `POST /media/upload-signature`, `POST /items/{id}/images`, `DELETE /images/{id}`.

## Rules
- Validation exactly as documented (name lengths, price range 0 to 1,000,000, allowed `dietaryTags` and `allergens`, at most 10 variants with unique names, at most 3 images).
- Deleting a category that has items without `force=true` -> `409 CATEGORY_NOT_EMPTY`. With `force=true`, the category and all its items are deleted (record this choice in `DECISIONS.md`).
- `PUT /categories/order` takes `{ "ids": [...] }` and rewrites `display_order` in one transaction; it must contain exactly the restaurant's categories.
- Availability toggle emits an internal domain event `menu.changed` (the WebSocket layer in phase 06 will subscribe). For now implement an in-process event emitter and a unit test that it fires.
- Cloudinary: `upload-signature` returns a short-lived signature (timestamp, folder `quickmenu/{restaurantId}`, signature, apiKey, cloudName). `POST /items/{id}/images` validates that the `publicId` starts with the restaurant's folder. Deleting an image also deletes it from Cloudinary (wrap the SDK behind a `MediaStorage` interface with an in-memory fake for tests).
- Public menu cache invalidation hook: every write calls `menuCache.invalidate(restaurantId)` (implement the cache in phase 05; stub now).

## Tests
Full CRUD for each resource; validation errors with the documented `details`; tenant isolation (404 across restaurants); 4th image rejected; reorder; availability toggle fires the event; `CATEGORY_NOT_EMPTY`.

## Acceptance criteria
Every endpoint in 3.4.2 works as documented; list endpoints are paginated; no N+1 queries on the items list (variants and images loaded with one extra query each, not per item).
