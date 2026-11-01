# Week 6 demo – order engine, validation and vertical slice

This document shows how to reproduce the customer → API → PostgreSQL → staff flow
and the checks that support the Week 6 acceptance criteria.

## 0. Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL 16)
- Dependencies installed: `npm install`

```bash
docker compose up -d
npm run db:reset
npm run db:seed
```

The seed creates the demo restaurant **Cafe Aroma** with seven tables, twelve
menu items and a few historical orders.

Demo accounts (printed by `db:seed`):

| Role | Email | Password |
|---|---|---|
| Owner | `owner@cafearoma.pk` | `CafeAroma2026!` |
| Kitchen | `kitchen@cafearoma.pk` | `KitchenCafe2026!` |

## 1. Start the app

```bash
npm run dev
```

- API: http://localhost:4000/api/v1
- Web: http://localhost:3000

Get a live QR token for table 5:

```bash
docker compose exec db psql -U quickmenu -d quickmenu -c \
  "SELECT t.table_number, t.qr_token
     FROM restaurant_tables t
     JOIN restaurants r ON r.id = t.restaurant_id
    WHERE r.slug = 'cafe-aroma' AND t.table_number = '5';"
```

Open `http://localhost:3000/m/<qr_token>` on a phone-sized viewport
(360 × 740 is what the Playwright test uses).

## 2. Demo flow (screenshots to capture)

1. **Customer menu** (`/m/{qr_token}`) – categories, prices, dietary tags,
   greyed-out out-of-stock items, variant picker.
   *Screenshot: menu with the cart bar.*
2. Add **Chicken Biryani → Full** and **Mint Lemonade**, open the cart, change a
   quantity, add a special instruction, place the order.
   *Screenshot: cart with total.*
3. **Order status** (`/order/{id}`) – order number, Received → Preparing →
   Ready → Served progress, items and total. The page polls every 5 seconds.
   *Screenshot: status page directly after ordering.*
4. **Staff orders** (`/dashboard/orders`) – log in as the owner or kitchen
   account, find the order by its number and press **Start preparing**.
   *Screenshot: staff card before/after.*
5. Return to the customer tab within 5 seconds – the badge changes to
   `preparing`.
   *Screenshot: updated status page.*
6. Double-tap **Place order** once (or run the Playwright double-tap test);
   only one order appears for that table.
   *Screenshot: staff page with a single new order.*

## 3. Verify the database rows

Replace `<order-id>` with the id shown in the customer URL.

```bash
docker compose exec db psql -U quickmenu -d quickmenu -c \
  "SELECT id, order_number, status, total, table_id
     FROM orders WHERE id = '<order-id>';"

docker compose exec db psql -U quickmenu -d quickmenu -c \
  "SELECT item_name, variant_name, quantity, unit_price
     FROM order_items WHERE order_id = '<order-id>'
    ORDER BY item_name;"

docker compose exec db psql -U quickmenu -d quickmenu -c \
  "SELECT status, changed_at
     FROM order_status_history WHERE order_id = '<order-id>'
    ORDER BY changed_at;"

docker compose exec db psql -U quickmenu -d quickmenu -c \
  "SELECT order_counter FROM restaurants WHERE slug = 'cafe-aroma';"
```

Expected after creating an order and moving it to preparing:

- exactly one `orders` row for the new order, status `preparing`;
- one `order_items` row per cart line, with **snapshot** `item_name`,
  `variant_name` and `unit_price` (the client never supplies these);
- **two** `order_status_history` rows (`new`, then `preparing`);
- `restaurants.order_counter` increased by one.

## 4. API checks without the UI

```bash
# Get the QR token first (see section 1)
TOKEN=<qr_token>
KEY=$(uuidgen)

# Place an order (201 first time, 200 on replay with the same key)
curl -i -X POST http://localhost:4000/api/v1/public/orders \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d "{\"qrToken\":\"$TOKEN\",\"items\":[{\"itemId\":\"<lemonade-id>\",\"quantity\":2}]}"

# Replay: same body and key -> 200, same order, still one row
curl -i -X POST http://localhost:4000/api/v1/public/orders \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d "{\"qrToken\":\"$TOKEN\",\"items\":[{\"itemId\":\"<lemonade-id>\",\"quantity\":2}]}"

# Track the order
curl http://localhost:4000/api/v1/public/orders/<order-id> \
  -H "X-Tracking-Token: <tracking-token>"

# Wrong token -> 404, no existence leak
curl -i http://localhost:4000/api/v1/public/orders/<order-id> \
  -H "X-Tracking-Token: wrong"
```

## 5. Automated checks

```bash
npm run lint
npm run typecheck
npm test                 # 147 API + 4 shared tests
npm run test:coverage    # domain 100% lines/branches; services 97.2% lines / 88.0% branches
npx playwright install chromium
npm run test:e2e         # mobile 360 x 740, seeds Cafe Aroma first
```

If the Playwright browser download is blocked on your machine, run the same
suite through an installed browser instead:

```powershell
$env:PLAYWRIGHT_CHANNEL="msedge"; npm run test:e2e
```

Latest local results (2026-11-01):

| Check | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | 151 tests pass (147 API, 4 shared) |
| `npm run test:coverage` | domain 100% stmts/branches; business logic 97.18% lines, 87.98% branches |
| `npm run test:e2e` | 2 tests: full slice + double-tap single order |

## 6. Error cases to show

| Case | Expected |
|---|---|
| Invalid QR token in `/public/menu/...` | `404 NOT_FOUND` |
| Inactive table | `422 TABLE_INACTIVE` |
| Empty cart / quantity 0 or 51 / bad UUID | `400 VALIDATION_ERROR` with `details` |
| Unavailable item | `409 ITEM_UNAVAILABLE` with every item listed, nothing stored |
| Wrong or missing tracking token | `404 NOT_FOUND` |
| Forbidden status change | `409 INVALID_STATUS_TRANSITION` |
| More than 5 orders/minute from one table+IP | `429 RATE_LIMITED` |
| Injected database failure | `500 INTERNAL_ERROR`, no SQL or stack trace |
| Body over 100 KB | `413 PAYLOAD_TOO_LARGE` |
