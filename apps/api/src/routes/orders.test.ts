import { randomUUID } from "crypto";
import type { Application } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server";
import { getPool } from "../db";
import { signAccessToken } from "../lib/tokens";
import { truncateAll } from "../repositories/testing";
import * as categories from "../repositories/categories";
import * as menuItems from "../repositories/menuItems";
import * as ordersRepo from "../repositories/orders";
import * as restaurants from "../repositories/restaurants";
import * as tables from "../repositories/tables";
import * as users from "../repositories/users";

const API = "/api/v1";

interface Fixture {
  restaurantId: string;
  tableId: string;
  qrToken: string;
  ownerToken: string;
  kitchenToken: string;
  biryaniId: string;
  biryaniRegularId: string;
  biryaniLargeId: string;
  lemonadeId: string;
  soldOutId: string;
}

let app: Application;

async function createRestaurantFixture(
  slug = `cafe-${randomUUID().slice(0, 8)}`,
  options: { tableActive?: boolean; soldOut?: boolean } = {}
): Promise<Fixture> {
  const restaurant = await restaurants.create({ name: "Cafe Aroma", slug });
  const category = await categories.create(restaurant.id, { name: "Mains" });
  const biryani = await menuItems.create(restaurant.id, {
    categoryId: category.id,
    name: "Chicken Biryani",
    basePrice: 500,
  });
  const regular = await menuItems.addVariant(restaurant.id, biryani.id, {
    name: "Regular",
    price: 550,
  });
  const large = await menuItems.addVariant(restaurant.id, biryani.id, {
    name: "Large",
    price: 650,
  });
  const lemonade = await menuItems.create(restaurant.id, {
    categoryId: category.id,
    name: "Mint Lemonade",
    basePrice: 150,
  });
  const soldOut = await menuItems.create(restaurant.id, {
    categoryId: category.id,
    name: "Daal Makhni",
    basePrice: 450,
  });
  if (options.soldOut !== false) {
    await menuItems.setAvailability(restaurant.id, soldOut.id, false);
  }

  const table = await tables.create(restaurant.id, {
    tableNumber: "5",
    qrToken: `qr-${randomUUID().replace(/-/g, "")}`,
    isActive: options.tableActive ?? true,
  });

  const owner = await users.create(restaurant.id, {
    email: `owner-${restaurant.id}@example.com`,
    name: "Owner",
    passwordHash: "x".repeat(60),
    role: "owner",
  });
  const kitchen = await users.create(restaurant.id, {
    email: `kitchen-${restaurant.id}@example.com`,
    name: "Kitchen",
    passwordHash: "x".repeat(60),
    role: "kitchen",
  });

  return {
    restaurantId: restaurant.id,
    tableId: table.id,
    qrToken: table.qrToken,
    ownerToken: signAccessToken({
      id: owner.id,
      restaurantId: restaurant.id,
      role: "owner",
    }),
    kitchenToken: signAccessToken({
      id: kitchen.id,
      restaurantId: restaurant.id,
      role: "kitchen",
    }),
    biryaniId: biryani.id,
    biryaniRegularId: regular!.id,
    biryaniLargeId: large!.id,
    lemonadeId: lemonade.id,
    soldOutId: soldOut.id,
  };
}

function orderBody(
  fixture: Fixture,
  items: Array<Record<string, unknown>>,
  notes?: string
) {
  return {
    qrToken: fixture.qrToken,
    items,
    ...(notes ? { notes } : {}),
  };
}

async function placeOrder(
  fixture: Fixture,
  items: Array<Record<string, unknown>> = [
    { itemId: fixture.biryaniId, variantId: fixture.biryaniRegularId, quantity: 2 },
    { itemId: fixture.lemonadeId, quantity: 1 },
  ],
  key: string = randomUUID()
) {
  return request(app)
    .post(`${API}/public/orders`)
    .set("Idempotency-Key", key)
    .send(orderBody(fixture, items));
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function count(table: string): Promise<number> {
  const { rows } = await getPool().query<{ total: string }>(
    `SELECT count(*)::text AS total FROM ${table}`
  );
  return Number.parseInt(rows[0]!.total, 10);
}

beforeEach(async () => {
  await truncateAll();
  app = createApp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /public/menu/{qrToken} (FR-17, FR-18)", () => {
  it("returns the restaurant, table and grouped menu with variants", async () => {
    const fixture = await createRestaurantFixture();

    const res = await request(app).get(`${API}/public/menu/${fixture.qrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.restaurant).toMatchObject({
      name: "Cafe Aroma",
      currency: "PKR",
      defaultLanguage: "en",
    });
    expect(res.body.data.table).toEqual({ id: fixture.tableId, number: "5" });
    expect(res.body.data.categories).toHaveLength(1);
    const items = res.body.data.categories[0].items;
    const biryani = items.find((item: { name: string }) => item.name === "Chicken Biryani");
    expect(biryani.price).toBe(500);
    expect(biryani.variants).toHaveLength(2);
    expect(biryani.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Regular", price: 550 }),
        expect.objectContaining({ name: "Large", price: 650 }),
      ])
    );
    const soldOut = items.find((item: { name: string }) => item.name === "Daal Makhni");
    expect(soldOut.isAvailable).toBe(false);
  });

  it("returns 404 NOT_FOUND for an invalid QR token", async () => {
    const res = await request(app).get(`${API}/public/menu/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.requestId).toEqual(expect.any(String));
  });

  it("returns 422 TABLE_INACTIVE for a disabled table", async () => {
    const fixture = await createRestaurantFixture(undefined, { tableActive: false });
    const res = await request(app).get(`${API}/public/menu/${fixture.qrToken}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("TABLE_INACTIVE");
  });
});

describe("POST /public/orders (FR-23..FR-28, NFR-R4, NFR-R5)", () => {
  it("creates the order with schema prices, snapshots and exactly one transaction", async () => {
    const fixture = await createRestaurantFixture();

    const res = await placeOrder(fixture);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      orderNumber: 1,
      status: "new",
      table: { number: "5" },
      total: 1250,
      currency: "PKR",
      trackingToken: expect.any(String),
    });
    expect(res.body.data.items).toEqual([
      {
        name: "Chicken Biryani",
        variant: "Regular",
        quantity: 2,
        unitPrice: 550,
        specialInstructions: null,
      },
      {
        name: "Mint Lemonade",
        variant: null,
        quantity: 1,
        unitPrice: 150,
        specialInstructions: null,
      },
    ]);

    const orderRows = await getPool().query(
      "SELECT total, status FROM orders WHERE id = $1",
      [res.body.data.id]
    );
    expect(orderRows.rows[0]).toMatchObject({ status: "new", total: "1250.00" });

    const itemRows = await getPool().query(
      "SELECT item_name, variant_name, quantity, unit_price::text FROM order_items WHERE order_id = $1 ORDER BY item_name",
      [res.body.data.id]
    );
    expect(itemRows.rows).toEqual([
      { item_name: "Chicken Biryani", variant_name: "Regular", quantity: 2, unit_price: "550.00" },
      { item_name: "Mint Lemonade", variant_name: null, quantity: 1, unit_price: "150.00" },
    ]);

    expect(await count("orders")).toBe(1);
    expect(await count("order_items")).toBe(2);
    expect(await count("order_status_history")).toBe(1);
    const restaurant = await restaurants.getById(fixture.restaurantId);
    expect(restaurant?.orderCounter).toBe(1);
  });

  it("ignores prices and unknown fields sent by the client", async () => {
    const fixture = await createRestaurantFixture();

    const res = await request(app)
      .post(`${API}/public/orders`)
      .set("Idempotency-Key", randomUUID())
      .send({
        qrToken: fixture.qrToken,
        hacker: "should be stripped",
        items: [
          {
            itemId: fixture.lemonadeId,
            quantity: 2,
            price: 1,
            unitPrice: 1,
            lineTotal: 1,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.items[0]).toMatchObject({ name: "Mint Lemonade", unitPrice: 150 });
    expect(res.body.data.total).toBe(300);
  });

  it("returns the original order for a repeated Idempotency-Key and creates nothing new", async () => {
    const fixture = await createRestaurantFixture();
    const key = randomUUID();

    const first = await placeOrder(fixture, undefined, key);
    const second = await placeOrder(fixture, undefined, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.data.orderNumber).toBe(first.body.data.orderNumber);
    expect(second.body.data.trackingToken).toBe(first.body.data.trackingToken);
    expect(await count("orders")).toBe(1);
    const restaurant = await restaurants.getById(fixture.restaurantId);
    expect(restaurant?.orderCounter).toBe(1);
  });

  it("returns 409 ITEM_UNAVAILABLE listing every unavailable item and stores nothing", async () => {
    const fixture = await createRestaurantFixture();

    const res = await request(app)
      .post(`${API}/public/orders`)
      .set("Idempotency-Key", randomUUID())
      .send(
        orderBody(fixture, [
          { itemId: fixture.soldOutId, quantity: 1 },
          { itemId: fixture.lemonadeId, quantity: 1 },
        ])
      );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ITEM_UNAVAILABLE");
    expect(res.body.error.details).toEqual([
      { itemId: fixture.soldOutId, name: "Daal Makhni" },
    ]);
    expect(await count("orders")).toBe(0);
    expect(await count("order_items")).toBe(0);
    expect(await count("order_status_history")).toBe(0);
    const restaurant = await restaurants.getById(fixture.restaurantId);
    expect(restaurant?.orderCounter).toBe(0);
  });

  it("returns 422 TABLE_INACTIVE and stores nothing", async () => {
    const fixture = await createRestaurantFixture(undefined, { tableActive: false });
    const res = await placeOrder(fixture);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("TABLE_INACTIVE");
    expect(await count("orders")).toBe(0);
  });

  it.each([
    ["empty cart", { items: [] }],
    ["quantity 0", { quantity: 0 }],
    ["quantity 51", { quantity: 51 }],
    ["quantity 1.5", { quantity: 1.5 }],
    ["missing itemId", { itemId: undefined }],
    ["invalid itemId", { itemId: "not-a-uuid" }],
  ])("returns 400 VALIDATION_ERROR for %s", async (_label, patch) => {
    const fixture = await createRestaurantFixture();
    const line =
      "items" in patch
        ? undefined
        : { itemId: fixture.lemonadeId, quantity: 1, ...patch };
    const body = line ? orderBody(fixture, [line]) : { qrToken: fixture.qrToken, ...patch };

    const res = await request(app)
      .post(`${API}/public/orders`)
      .set("Idempotency-Key", randomUUID())
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.length).toBeGreaterThan(0);
    expect(res.body.error.details[0]).toEqual(
      expect.objectContaining({ field: expect.any(String), issue: expect.any(String) })
    );
    expect(await count("orders")).toBe(0);
  });

  it("returns 400 when the Idempotency-Key is missing or not a UUID", async () => {
    const fixture = await createRestaurantFixture();
    const missing = await request(app)
      .post(`${API}/public/orders`)
      .send(orderBody(fixture, [{ itemId: fixture.lemonadeId, quantity: 1 }]));
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");

    const bad = await request(app)
      .post(`${API}/public/orders`)
      .set("Idempotency-Key", "nope")
      .send(orderBody(fixture, [{ itemId: fixture.lemonadeId, quantity: 1 }]));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].field).toBe("idempotency-key");
  });

  it("returns 404 for an item that belongs to another restaurant", async () => {
    const a = await createRestaurantFixture();
    const b = await createRestaurantFixture();
    const res = await placeOrder(a, [{ itemId: b.lemonadeId, quantity: 1 }]);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(await count("orders")).toBe(0);
  });

  it("returns 413 PAYLOAD_TOO_LARGE for oversized bodies", async () => {
    const fixture = await createRestaurantFixture();
    const res = await request(app)
      .post(`${API}/public/orders`)
      .set("Idempotency-Key", randomUUID())
      .send(
        orderBody(fixture, [{ itemId: fixture.lemonadeId, quantity: 1 }], "x".repeat(120_000))
      );
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns 400 VALIDATION_ERROR for malformed JSON", async () => {
    const res = await request(app)
      .post(`${API}/public/orders`)
      .set("Content-Type", "application/json")
      .set("Idempotency-Key", randomUUID())
      .send('{"qrToken": "broken"');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rolls the whole transaction back when line insertion fails", async () => {
    const fixture = await createRestaurantFixture();
    vi.spyOn(ordersRepo, "insertOrderItems").mockRejectedValueOnce(
      new Error("secret internal SQL detail")
    );

    const res = await placeOrder(fixture);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("secret internal SQL detail");
    expect(await count("orders")).toBe(0);
    expect(await count("order_items")).toBe(0);
    expect(await count("order_status_history")).toBe(0);
    const restaurant = await restaurants.getById(fixture.restaurantId);
    expect(restaurant?.orderCounter).toBe(0);
  });

  it("never leaks internals when the database throws", async () => {
    const fixture = await createRestaurantFixture();
    vi.spyOn(menuItems, "getManyByIds").mockRejectedValueOnce(
      new Error("relation secret_table does not exist")
    );

    const res = await placeOrder(fixture);

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "Internal server error.",
      requestId: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toContain("secret_table");
  });

  it("assigns unique, consecutive order numbers under 20 parallel requests", async () => {
    const fixture = await createRestaurantFixture();
    const extraTables = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        tables.create(fixture.restaurantId, {
          tableNumber: String(index + 100),
          qrToken: `parallel-${randomUUID()}`,
        })
      )
    );

    const responses = await Promise.all(
      extraTables.map((table) =>
        request(app)
          .post(`${API}/public/orders`)
          .set("Idempotency-Key", randomUUID())
          .send({
            qrToken: table.qrToken,
            items: [{ itemId: fixture.lemonadeId, quantity: 1 }],
          })
      )
    );

    expect(responses.every((res) => res.status === 201)).toBe(true);
    const numbers = responses
      .map((res) => res.body.data.orderNumber as number)
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    const distinctIds = new Set(responses.map((res) => res.body.data.id));
    expect(distinctIds.size).toBe(20);
    expect(await count("orders")).toBe(20);
    const restaurant = await restaurants.getById(fixture.restaurantId);
    expect(restaurant?.orderCounter).toBe(20);
  });

  it("returns 429 RATE_LIMITED after 5 attempts for one table and IP", async () => {
    const fixture = await createRestaurantFixture();
    const statuses: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const res = await placeOrder(
        fixture,
        [{ itemId: fixture.lemonadeId, quantity: 1 }],
        randomUUID()
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
  });
});

describe("GET /public/orders/{id} (FR-29)", () => {
  it("returns the status timeline with a valid tracking token", async () => {
    const fixture = await createRestaurantFixture();
    const created = await placeOrder(fixture);
    const { id, trackingToken } = created.body.data;

    await request(app)
      .patch(`${API}/orders/${id}/status`)
      .set(bearer(fixture.kitchenToken))
      .send({ status: "preparing" })
      .expect(200);

    const res = await request(app)
      .get(`${API}/public/orders/${id}`)
      .set("X-Tracking-Token", trackingToken);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("preparing");
    expect(res.body.data.timeline.map((entry: { status: string }) => entry.status)).toEqual([
      "new",
      "preparing",
    ]);
    expect(res.body.data.total).toBe(1250);
    expect(res.body.data.table.number).toBe("5");
  });

  it("returns 404 for a wrong tracking token", async () => {
    const fixture = await createRestaurantFixture();
    const created = await placeOrder(fixture);
    const res = await request(app)
      .get(`${API}/public/orders/${created.body.data.id}`)
      .set("X-Tracking-Token", "wrong-token");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 when the tracking token is missing", async () => {
    const fixture = await createRestaurantFixture();
    const created = await placeOrder(fixture);
    const res = await request(app).get(`${API}/public/orders/${created.body.data.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 VALIDATION_ERROR for a malformed order id", async () => {
    const res = await request(app).get(`${API}/public/orders/not-a-uuid`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /orders and PATCH /orders/{id}/status (FR-30..FR-35)", () => {
  it("requires authentication", async () => {
    const res = await request(app).get(`${API}/orders`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("lists active orders for kitchen and owner with the documented shape", async () => {
    const fixture = await createRestaurantFixture();
    await placeOrder(fixture);

    for (const token of [fixture.kitchenToken, fixture.ownerToken]) {
      const res = await request(app).get(`${API}/orders`).set(bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(res.body.data[0]).toMatchObject({
        orderNumber: 1,
        table: { number: "5" },
        status: "new",
        items: [
          { name: "Chicken Biryani", variant: "Regular", quantity: 2 },
          { name: "Mint Lemonade", variant: null, quantity: 1 },
        ],
      });
    }
  });

  it("filters by status and never leaks another tenant's orders", async () => {
    const a = await createRestaurantFixture();
    const b = await createRestaurantFixture();
    const created = await placeOrder(a);

    const filtered = await request(app)
      .get(`${API}/orders?status=preparing`)
      .set(bearer(a.ownerToken));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(0);

    const otherTenant = await request(app)
      .get(`${API}/orders`)
      .set(bearer(b.ownerToken));
    expect(otherTenant.status).toBe(200);
    expect(otherTenant.body.data).toHaveLength(0);

    const patch = await request(app)
      .patch(`${API}/orders/${created.body.data.id}/status`)
      .set(bearer(b.ownerToken))
      .send({ status: "preparing" });
    expect(patch.status).toBe(404);
    expect(patch.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects an invalid status value", async () => {
    const fixture = await createRestaurantFixture();
    const created = await placeOrder(fixture);
    const res = await request(app)
      .patch(`${API}/orders/${created.body.data.id}/status`)
      .set(bearer(fixture.ownerToken))
      .send({ status: "flying" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("walks every allowed transition and writes history rows", async () => {
    const fixture = await createRestaurantFixture();
    const created = await placeOrder(fixture);
    const id = created.body.data.id;

    for (const status of ["preparing", "ready", "served"]) {
      const res = await request(app)
        .patch(`${API}/orders/${id}/status`)
        .set(bearer(fixture.kitchenToken))
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id,
        status,
        updatedAt: expect.any(String),
      });
    }

    expect(await count("order_status_history")).toBe(4);
    const publicRes = await request(app)
      .get(`${API}/public/orders/${id}`)
      .set("X-Tracking-Token", created.body.data.trackingToken);
    expect(publicRes.body.data.status).toBe("served");
  });

  it.each([
    ["new", "ready"],
    ["new", "served"],
    ["new", "new"],
    ["served", "cancelled"],
    ["served", "preparing"],
    ["cancelled", "preparing"],
  ])("rejects the forbidden transition %s -> %s", async (from, to) => {
    const fixture = await createRestaurantFixture();
    const created = await placeOrder(fixture);
    const id = created.body.data.id;

    // Reach `from` through the allowed path, if it is not `new`.
    if (from === "served") {
      for (const status of ["preparing", "ready", "served"]) {
        await request(app)
          .patch(`${API}/orders/${id}/status`)
          .set(bearer(fixture.ownerToken))
          .send({ status })
          .expect(200);
      }
    } else if (from === "cancelled") {
      await request(app)
        .patch(`${API}/orders/${id}/status`)
        .set(bearer(fixture.ownerToken))
        .send({ status: "cancelled" })
        .expect(200);
    }

    const res = await request(app)
      .patch(`${API}/orders/${id}/status`)
      .set(bearer(fixture.ownerToken))
      .send({ status: to });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("allows cancelling from new, preparing and ready", async () => {
    for (const steps of [[], ["preparing"], ["preparing", "ready"]]) {
      await truncateAll();
      app = createApp();
      const fixture = await createRestaurantFixture();
      const created = await placeOrder(fixture);
      const id = created.body.data.id;
      for (const status of steps) {
        await request(app)
          .patch(`${API}/orders/${id}/status`)
          .set(bearer(fixture.ownerToken))
          .send({ status })
          .expect(200);
      }
      const res = await request(app)
        .patch(`${API}/orders/${id}/status`)
        .set(bearer(fixture.ownerToken))
        .send({ status: "cancelled" });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("cancelled");
      expect(await count("order_status_history")).toBe(steps.length + 2);
    }
  });
});
