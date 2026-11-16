# Architecture as built

A short note for the evaluation: what was actually built, and where it deviates
from `docs/02_ARCHITECTURE.md` (Week 3) and `docs/03_DATABASE_API_WIREFRAMES.md`
(Week 4). Every deviation is recorded with its decision id in `DECISIONS.md`.

## 1. Shape

```
Browser (customer / owner / kitchen)
        │  HTTPS + JSON                 │ WebSocket (Socket.IO, /ws)
        ▼                               ▼
Next.js 14 App Router (Vercel)   Express API (Render)
  server-rendered menu             routes → controllers → services → repositories
  client cart, filters, RTL               │                    │
  service worker + manifest               ▼                    ▼
                                   PostgreSQL 16        Cloudinary (signed uploads)
```

- **One API process** serves REST and Socket.IO on the same HTTP server. The API
  is stateless; the only in-memory state is a 5-second public-menu cache per
  instance.
- **The web app never talks to PostgreSQL.** It only calls `/api/v1`.
- **Tenant id** comes from the JWT or from the QR token, never from the body.
  Every repository query filters by `restaurant_id`.
- **Money** is integer paisa in services, `numeric(10,2)` in the database, and
  a number with two decimals plus `currency` in JSON.

## 2. API modules

| Layer | Location | Responsibility |
|---|---|---|
| Routes | `apps/api/src/routes/` | URL + method, auth/role guard, zod validation |
| Controllers | `apps/api/src/controllers/` | Envelope, HTTP status, header parsing |
| Services | `apps/api/src/services/` | Business rules, transactions, cache invalidation, events |
| Repositories | `apps/api/src/repositories/` | All SQL, snake_case ↔ camelCase |
| Domain | `apps/api/src/domain/` | Pure pricing, status machine, tracking tokens |
| Realtime | `apps/api/src/realtime/socket.ts` | Auth, rooms, `kot:sync`, status ack |
| Events | `apps/api/src/events/orderEvents.ts` | Interface between order service and sockets |
| Media | `apps/api/src/lib/mediaStorage.ts` | Cloudinary signing or deterministic fake |
| Translation | `apps/api/src/lib/translation.ts` | Fake / LibreTranslate / Google behind one interface |

The 43 documented endpoints are all implemented. `docs/openapi.yaml` is a
hand-written OpenAPI 3.0.3 description of the actual behaviour (D-73).

## 3. Order path (NFR-R4, NFR-R5)

1. `POST /public/orders` validates the body and `Idempotency-Key`.
2. The service resolves the QR token to an active table and restaurant.
3. One transaction: insert order, insert lines with the price at order time,
   insert status history, increment `restaurants.order_counter`.
4. Commit, then respond `201` with the order and tracking token.
5. After commit, emit `order:new` to `restaurant:{id}` (full KOT payload, D-64).
6. A repeated key returns `200` with the original order and does not emit again.

The customer is never told "confirmed" before the commit. A failed transaction
leaves no order and no counter increment.

## 4. Realtime

| Event | Direction | Room | Purpose |
|---|---|---|---|
| `order:new` | server → staff | `restaurant:{id}` | New ticket with items, variants, notes |
| `order:status` | server → staff/customer | `restaurant:{id}`, `order:{id}` | Status moved |
| `kot:sync` | server → staff | socket | Full active snapshot on every connect/reconnect |
| `order:update_status` | staff → server (ack) | — | One-tap status change |
| `menu:updated` | server → customers | `menu:{restaurantId}` | Item availability changed |
| `menu:join` | customer → server | — | Join the menu room with `{ qrToken }` |

Authentication (D-63): staff send `auth.token` (access JWT); customers send
`{ orderId, trackingToken }`; the menu joins with `{ qrToken }`. A socket can
only join a room it can prove access to. The kitchen board falls back to REST
polling every 5 seconds while disconnected, and `kot:sync` removes duplicates on
reconnect (NFR-R3).

## 5. Caching and invalidation

- Public menu responses are cached for **5 seconds** per
  `restaurantId:tableId|lang|dietary|exclude|q` (D-57). Owner writes invalidate
  the whole restaurant namespace.
- `Cache-Control: public, max-age=5` tells browsers and Cloudflare the same
  thing.
- Translations are cached in `translations` and reused across menu requests;
  a provider failure returns the original text with a `TRANSLATIONS_UNAVAILABLE`
  warning instead of failing the menu.

## 6. Deviations from the design documents

| # | Document says | Built | Why |
|---|---|---|---|
| 1 | Public menu response is `{ data }`; `warnings` is an open question | `{ data, warnings }`; `PublicMenu` has no `warnings` field | D-56 keeps the documented envelope while keeping the warning out of the menu object |
| 2 | Cache key not specified | `restaurantId:tableId|lang|dietary|exclude|q` | D-57, stable and cheap to invalidate |
| 3 | `POST/PATCH /items` variant handling not specified | Optional `variants`; PATCH replaces the whole set | D-58, one write path for the drawer |
| 4 | Limits and duplicate errors not specified | 11th variant → `409 VARIANT_LIMIT_REACHED`; 4th image → `409 IMAGE_LIMIT_REACHED`; duplicate variant → `409 CONFLICT`; foreign `publicId` → `400 VALIDATION_ERROR` | D-59 |
| 5 | Category delete "warns if it has items" | `force=true` deletes category + items in one transaction; otherwise `409 CATEGORY_NOT_EMPTY` | D-60, D-19 |
| 6 | Media storage is Cloudinary | Real Cloudinary when credentials exist and `NODE_ENV != test`; deterministic fake otherwise | D-61 keeps local dev and CI offline |
| 7 | Translation provider is Google | `TRANSLATION_PROVIDER` selects `fake` (default), `libretranslate`, or `google` | D-62 avoids charges during evaluation |
| 8 | Socket auth is not fully specified | Handshake `auth.token` (staff), `{ orderId, trackingToken }` (customer), `menu:join { qrToken }` (menu) | D-63 |
| 9 | `order:new` payload not fully specified | Full KOT payload so the board can render without a fetch | D-64 |
| 10 | `GET /orders/{id}` source not specified | `orderService.getOrderDetail` with tenant scoping and timeline | D-65 |
| 11 | Helmet/CSP not detailed | API sends a deny-all CSP; Next.js sends a strict CSP with `'unsafe-inline'` for framework bootstrap | D-66, needed by App Router without a nonce runtime |
| 12 | Client IP for rate limits | `trust proxy = 1`, so the edge-provided `X-Forwarded-For` is used | D-67, otherwise every user shares the proxy IP |
| 13 | Kitchen status updates | Socket event with acknowledgement, REST fallback after 3 s; served/cancelled cards stay 10 s | D-68, faster than a round trip and still safe |
| 14 | Customer menu rendering | Server-renders the initial menu, then hydrates for search/filters/cart | Keeps LCP low and the page usable without JavaScript (D-69) |
| 15 | Database pool size | `DB_POOL_MAX` environment variable (default 20; 50 for the pilot) | D-70, cloud plans differ |
| 16 | PWA icons | SVG icons rather than PNG | D-71; smaller and crisp, accepted by all target browsers |
| 17 | Load test | `load/node-load.mjs` (local) and `load/k6.js` (staging); both set `X-Forwarded-For` | D-72, the 100 req/min/IP limit would otherwise throttle the probe |
| 18 | API documentation | Hand-written `docs/openapi.yaml` | D-73, there is no code-first generator in the stack |
| 19 | Redis for caching | Not used for the menu cache; the 5 s cache is per instance | D-74, safe to duplicate and removes a service from the pilot |

There are no schema changes beyond `db/migrations/001_init.sql`. There are no
extra REST endpoints beyond the 43 documented ones.

## 7. Known limitations

- No per-restaurant theming or custom domain.
- No bulk menu import (CSV) in the MVP.
- Real email delivery is opt-in (`MAIL_TRANSPORT=smtp`); the default is a console
  mailer.
- Translation quality depends on the provider; `fake` is for tests only.
- The kitchen board keeps at most 100 active orders (`pageSize=100`); the pilot
  has 1–3 tables per restaurant.
- A single API instance is assumed for the pilot. Horizontal scaling works for
  REST; Socket.IO rooms need a Redis adapter if more than one instance is
  deployed.
