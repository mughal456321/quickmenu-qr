import { randomUUID } from "crypto";
import type { Application } from "express";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server";
import { getPool } from "../db";
import { signAccessToken } from "../lib/tokens";
import { menuCache } from "../lib/menuCache";
import {
  setTranslationProvider,
  type TranslationProvider,
} from "../lib/translation";
import { truncateAll } from "../repositories/testing";
import * as categories from "../repositories/categories";
import * as menuItems from "../repositories/menuItems";
import * as ordersRepo from "../repositories/orders";
import * as restaurants from "../repositories/restaurants";
import * as tables from "../repositories/tables";
import * as users from "../repositories/users";

const API = "/api/v1";

let app: Application;
let ownerToken: string;
let restaurantId: string;
let otherOwnerToken: string;
let tableId: string;
let qrToken: string;
let tableNumber: string;
let vegId: string;
let nutFreeId: string;
let unavailableId: string;

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
    token: signAccessToken({
      id: owner.id,
      restaurantId: restaurant.id,
      role: "owner",
    }),
  };
}

beforeEach(async () => {
  await truncateAll();
  menuCache.clear();
  app = createApp();

  const main = await newTenant("Cafe Aroma");
  restaurantId = main.restaurant.id;
  ownerToken = main.token;
  const other = await newTenant("Other Cafe");
  otherOwnerToken = other.token;

  const starters = await categories.create(restaurantId, { name: "Starters" });
  const mains = await categories.create(restaurantId, { name: "Mains" });
  void mains;

  const veg = await menuItems.create(restaurantId, {
    categoryId: starters.id,
    name: "Paneer Tikka",
    description: "Grilled cottage cheese",
    basePrice: 480,
    dietaryTags: ["vegetarian"],
    allergens: ["dairy"],
  });
  await menuItems.addImage(restaurantId, veg.id, {
    publicId: `quickmenu/${restaurantId}/paneer`,
    url: "https://res.cloudinary.com/demo/image/upload/v1/quickmenu/paneer.jpg",
  });
  const nutFree = await menuItems.create(restaurantId, {
    categoryId: starters.id,
    name: "Garden Salad",
    description: "Fresh greens",
    basePrice: 280,
    dietaryTags: ["vegetarian", "vegan"],
    allergens: [],
  });
  const unavailable = await menuItems.create(restaurantId, {
    categoryId: starters.id,
    name: "Daal Makhni",
    basePrice: 450,
    dietaryTags: ["vegetarian"],
    allergens: [],
  });
  await menuItems.setAvailability(restaurantId, unavailable.id, false);

  vegId = veg.id;
  nutFreeId = nutFree.id;
  unavailableId = unavailable.id;

  const table = await tables.create(restaurantId, {
    tableNumber: "5",
    qrToken: `qr-${randomUUID().replace(/-/g, "")}`,
  });
  tableId = table.id;
  qrToken = table.qrToken;
  tableNumber = table.tableNumber;
});

afterEach(() => {
  setTranslationProvider(null);
});

describe("tables and QR codes (FR-14..FR-16)", () => {
  it("creates a table with a secure token and download links", async () => {
    const response = await request(app)
      .post(`${API}/tables`)
      .set(bearer(ownerToken))
      .send({ tableNumber: "8" });

    expect(response.status).toBe(201);
    expect(response.body.data.tableNumber).toBe("8");
    expect(response.body.data.qrToken.length).toBeGreaterThanOrEqual(16);
    expect(response.body.data.menuUrl).toContain(response.body.data.qrToken);
    expect(response.body.data.qrDownload).toEqual({
      png: `/tables/${response.body.data.id}/qr?format=png`,
      pdf: `/tables/${response.body.data.id}/qr?format=pdf`,
    });

    const list = await request(app).get(`${API}/tables`).set(bearer(ownerToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
  });

  it("deactivates a table and serves 422 for its public menu", async () => {
    const patch = await request(app)
      .patch(`${API}/tables/${tableId}`)
      .set(bearer(ownerToken))
      .send({ isActive: false });
    expect(patch.status).toBe(200);

    const menu = await request(app).get(`${API}/public/menu/${qrToken}`);
    expect(menu.status).toBe(422);
    expect(menu.body.error.code).toBe("TABLE_INACTIVE");
  });

  it("blocks deleting a table that has orders", async () => {
    await ordersRepo.insertOrder({
      id: randomUUID(),
      restaurantId,
      tableId,
      orderNumber: 1,
      total: 100,
      notes: null,
      clientRequestId: randomUUID(),
      trackingTokenHash: "a".repeat(64),
    });

    const response = await request(app)
      .delete(`${API}/tables/${tableId}`)
      .set(bearer(ownerToken));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONFLICT");
  });

  it("deletes an empty table and hides it from other tenants", async () => {
    const foreign = await request(app)
      .delete(`${API}/tables/${tableId}`)
      .set(bearer(otherOwnerToken));
    expect(foreign.status).toBe(404);

    const response = await request(app)
      .delete(`${API}/tables/${tableId}`)
      .set(bearer(ownerToken));
    expect(response.status).toBe(204);
  });

  it("renders a PNG that decodes back to the public menu URL", async () => {
    const response = await request(app)
      .get(`${API}/tables/${tableId}/qr?format=png`)
      .set(bearer(ownerToken))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
    const png = PNG.sync.read(response.body as Buffer);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toContain(qrToken);
    expect(decoded?.data).toBe(`http://localhost:3000/m/${qrToken}`);
  });

  it("renders a printable A6 PDF", async () => {
    const response = await request(app)
      .get(`${API}/tables/${tableId}/qr?format=pdf`)
      .set(bearer(ownerToken))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect((response.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("public menu (FR-17..FR-22)", () => {
  it("returns the documented envelope with unavailable items greyed out", async () => {
    const response = await request(app).get(`${API}/public/menu/${qrToken}`);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=5");
    expect(response.body.data).toMatchObject({
      restaurant: { name: "Cafe Aroma", currency: "PKR", defaultLanguage: "en" },
      table: { id: tableId, number: tableNumber },
      language: "en",
    });
    expect(response.body.warnings).toEqual([]);

    const items = response.body.data.categories.flatMap(
      (category: { items: Array<{ id: string; isAvailable: boolean; name: string }> }) =>
        category.items
    );
    expect(items.find((item: { id: string }) => item.id === unavailableId).isAvailable).toBe(
      false
    );
    expect(items.find((item: { id: string }) => item.id === vegId).isAvailable).toBe(true);
  });

  it("applies dietary, allergen and search filters", async () => {
    const dietary = await request(app).get(
      `${API}/public/menu/${qrToken}?dietary=vegetarian&exclude=nuts`
    );
    expect(dietary.status).toBe(200);
    const ids = dietary.body.data.categories.flatMap(
      (category: { items: Array<{ id: string }> }) =>
        category.items.map((item) => item.id)
    );
    expect(ids).toContain(vegId);
    expect(ids).toContain(nutFreeId);

    const search = await request(app).get(`${API}/public/menu/${qrToken}?q=paneer`);
    const searchIds = search.body.data.categories.flatMap(
      (category: { items: Array<{ id: string; name: string }> }) =>
        category.items.map((item) => item.name)
    );
    expect(searchIds).toEqual(["Paneer Tikka"]);

    const invalid = await request(app).get(
      `${API}/public/menu/${qrToken}?dietary=not-a-tag`
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for an unknown QR token", async () => {
    const response = await request(app).get(`${API}/public/menu/does-not-exist`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("lists supported languages with RTL flags", async () => {
    const response = await request(app).get(`${API}/public/languages`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ur", rtl: true }),
        expect.objectContaining({ code: "ar", rtl: true }),
        expect.objectContaining({ code: "en", rtl: false }),
      ])
    );
  });

  it("translates on a cache miss and reuses the cached strings", async () => {
    let calls = 0;
    const provider: TranslationProvider = {
      name: "counting",
      async translate(texts, _source, target) {
        calls += 1;
        return texts.map((text) => `${target}:${text}`);
      },
    };
    setTranslationProvider(provider);

    const first = await request(app).get(`${API}/public/menu/${qrToken}?lang=ur`);
    expect(first.status).toBe(200);
    expect(first.body.warnings).toEqual([]);
    expect(first.body.data.language).toBe("ur");
    expect(first.body.data.categories[0].name).toContain("ur:");
    expect(calls).toBe(1);

    const { rows } = await getPool().query("SELECT count(*)::int AS n FROM translations");
    expect(rows[0].n).toBeGreaterThan(0);

    // Clear only the menu cache: the translations table must serve the second page.
    menuCache.clear();
    const second = await request(app).get(`${API}/public/menu/${qrToken}?lang=ur`);
    expect(second.status).toBe(200);
    expect(second.body.data.categories[0].name).toBe(first.body.data.categories[0].name);
    expect(calls).toBe(1);
  });

  it("falls back to the source language when the provider fails", async () => {
    setTranslationProvider({
      name: "down",
      async translate() {
        throw new Error("provider down");
      },
    });

    const response = await request(app).get(`${API}/public/menu/${qrToken}?lang=fr`);
    expect(response.status).toBe(200);
    expect(response.body.warnings).toEqual(["TRANSLATION_UNAVAILABLE"]);
    const names = response.body.data.categories.flatMap(
      (category: { name: string; items: Array<{ name: string }> }) => [
        category.name,
        ...category.items.map((item) => item.name),
      ]
    );
    expect(names).toContain("Starters");
  });

  it("invalidates the menu cache after an owner availability change", async () => {
    const before = await request(app).get(`${API}/public/menu/${qrToken}`);
    expect(
      before.body.data.categories
        .flatMap((category: { items: Array<{ id: string; isAvailable: boolean }> }) => category.items)
        .find((item: { id: string }) => item.id === nutFreeId).isAvailable
    ).toBe(true);

    await request(app)
      .patch(`${API}/items/${nutFreeId}/availability`)
      .set(bearer(ownerToken))
      .send({ isAvailable: false });

    const after = await request(app).get(`${API}/public/menu/${qrToken}`);
    expect(
      after.body.data.categories
        .flatMap((category: { items: Array<{ id: string; isAvailable: boolean }> }) => category.items)
        .find((item: { id: string }) => item.id === nutFreeId).isAvailable
    ).toBe(false);
  });

  it("serves Cloudinary images with delivery transformations", async () => {
    const response = await request(app).get(`${API}/public/menu/${qrToken}`);
    const item = response.body.data.categories
      .flatMap((category: { items: Array<{ id: string; images: Array<{ url: string }> }> }) => category.items)
      .find((candidate: { id: string }) => candidate.id === vegId);
    expect(item.images[0].url).toContain("/upload/w_400,q_auto,f_auto/");
  });
});
