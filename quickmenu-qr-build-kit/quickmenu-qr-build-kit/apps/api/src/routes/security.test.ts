import { randomUUID } from "crypto";
import type { Application } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server";
import { signAccessToken } from "../lib/tokens";
import { truncateAll } from "../repositories/testing";
import * as categories from "../repositories/categories";
import * as menuItems from "../repositories/menuItems";
import * as restaurants from "../repositories/restaurants";
import * as tables from "../repositories/tables";
import * as users from "../repositories/users";

/**
 * Phase 10 hardening: security headers, safe errors, rate limiting and the
 * cross-tenant access matrix (NFR-S5, NFR-S6, NFR-S8).
 */
const API = "/api/v1";

let app: Application;
let ownerToken: string;
let otherKitchenId: string;
let otherCategoryId: string;
let otherItemId: string;
let otherTableId: string;
let otherOrderId: string;

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function newTenant(name: string) {
  const restaurant = await restaurants.create({
    name,
    slug: `tenant-${randomUUID().slice(0, 8)}`,
  });
  const owner = await users.create(restaurant.id, {
    email: `owner-${restaurant.id}@example.com`,
    name: "Owner",
    passwordHash: "x".repeat(60),
    role: "owner",
  });
  return {
    restaurant,
    owner,
    token: signAccessToken({
      id: owner.id,
      restaurantId: restaurant.id,
      role: "owner",
    }),
  };
}

beforeEach(async () => {
  await truncateAll();
  app = createApp();

  const main = await newTenant("Cafe Aroma");
  ownerToken = main.token;
  const other = await newTenant("Other Cafe");

  const category = await categories.create(other.restaurant.id, {
    name: "Other Starters",
  });
  otherCategoryId = category.id;
  const item = await menuItems.create(other.restaurant.id, {
    categoryId: category.id,
    name: "Other Secret Dish",
    basePrice: 999,
  });
  otherItemId = item.id;
  const table = await tables.create(other.restaurant.id, {
    tableNumber: "99",
    qrToken: randomUUID().replace(/-/g, "").slice(0, 22),
  });
  otherTableId = table.id;

  const kitchen = await users.create(other.restaurant.id, {
    email: `kitchen-${other.restaurant.id}@example.com`,
    name: "Other Kitchen",
    passwordHash: "x".repeat(60),
    role: "kitchen",
  });
  otherKitchenId = kitchen.id;

  const order = await request(app)
    .post(`${API}/public/orders`)
    .set("Idempotency-Key", randomUUID())
    .send({
      qrToken: table.qrToken,
      items: [{ itemId: item.id, variantId: null, quantity: 1 }],
    });
  expect(order.status).toBe(201);
  otherOrderId = order.body.data.id as string;
});

describe("security headers and safe errors (NFR-S5)", () => {
  it("sets HSTS, nosniff, a deny-all CSP and hides the stack", async () => {
    const response = await request(app).get(`${API}/health`);
    expect(response.status).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toContain(
      "default-src 'none'"
    );
    expect(response.headers["strict-transport-security"]).toContain("max-age=");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("returns the documented envelope without stack traces", async () => {
    const response = await request(app).get(`${API}/does-not-exist`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
    expect(JSON.stringify(response.body)).not.toMatch(/at .*\.ts/);
  });
});

describe("tenant isolation matrix (NFR-S6)", () => {
  it("cannot read or mutate another restaurant's menu", async () => {
    const cases = [
      request(app).get(`${API}/items/${otherItemId}`).set(bearer(ownerToken)),
      request(app)
        .patch(`${API}/items/${otherItemId}`)
        .set(bearer(ownerToken))
        .send({ name: "Hijacked" }),
      request(app)
        .patch(`${API}/items/${otherItemId}/availability`)
        .set(bearer(ownerToken))
        .send({ isAvailable: false }),
      request(app).delete(`${API}/items/${otherItemId}`).set(bearer(ownerToken)),
      request(app)
        .patch(`${API}/categories/${otherCategoryId}`)
        .set(bearer(ownerToken))
        .send({ name: "Hijacked" }),
      request(app)
        .delete(`${API}/categories/${otherCategoryId}`)
        .set(bearer(ownerToken)),
      request(app)
        .post(`${API}/items`)
        .set(bearer(ownerToken))
        .send({
          categoryId: otherCategoryId,
          name: "Injected",
          basePrice: 100,
        }),
    ];

    for (const response of await Promise.all(cases)) {
      expect([400, 404]).toContain(response.status);
    }
  });

  it("cannot read another restaurant's tables or QR codes", async () => {
    const list = await request(app)
      .get(`${API}/tables/${otherTableId}/qr?format=png`)
      .set(bearer(ownerToken));
    expect(list.status).toBe(404);

    const update = await request(app)
      .patch(`${API}/tables/${otherTableId}`)
      .set(bearer(ownerToken))
      .send({ isActive: false });
    expect(update.status).toBe(404);

    const remove = await request(app)
      .delete(`${API}/tables/${otherTableId}`)
      .set(bearer(ownerToken));
    expect(remove.status).toBe(404);
  });

  it("cannot read another restaurant's orders or staff", async () => {
    const detail = await request(app)
      .get(`${API}/orders/${otherOrderId}`)
      .set(bearer(ownerToken));
    expect(detail.status).toBe(404);

    const status = await request(app)
      .patch(`${API}/orders/${otherOrderId}/status`)
      .set(bearer(ownerToken))
      .send({ status: "preparing" });
    expect(status.status).toBe(404);

    const staff = await request(app)
      .patch(`${API}/staff/${otherKitchenId}`)
      .set(bearer(ownerToken))
      .send({ name: "Hijacked" });
    expect(staff.status).toBe(404);

    const publicStatus = await request(app).get(
      `${API}/public/orders/${otherOrderId}`
    );
    expect(publicStatus.status).toBe(404);
  });

  it("rejects requests without a bearer token", async () => {
    const response = await request(app).get(`${API}/items`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("rate limiting (NFR-S8)", () => {
  it("returns RATE_LIMITED after 100 requests in a minute", async () => {
    let lastStatus = 0;
    let lastBody: unknown = null;
    for (let index = 0; index < 101; index += 1) {
      const response = await request(app).get(`${API}/health`);
      lastStatus = response.status;
      lastBody = response.body;
    }
    expect(lastStatus).toBe(429);
    expect((lastBody as { error?: { code?: string } }).error?.code).toBe(
      "RATE_LIMITED"
    );
  });
});
