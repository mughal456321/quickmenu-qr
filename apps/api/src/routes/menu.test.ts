import { randomUUID } from "crypto";
import type { Application } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server";
import { getPool } from "../db";
import { signAccessToken } from "../lib/tokens";
import { removeAllMenuListeners } from "../lib/menuEvents";
import { setMediaStorage, type MediaStorage } from "../lib/mediaStorage";
import { menuCache } from "../lib/menuCache";
import { truncateAll } from "../repositories/testing";
import * as restaurants from "../repositories/restaurants";
import * as users from "../repositories/users";

const API = "/api/v1";

let app: Application;
let ownerToken: string;
let restaurantId: string;
let otherOwnerToken: string;
let otherRestaurantId: string;

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

async function createCategory(token: string, name = "Mains") {
  const response = await request(app)
    .post(`${API}/categories`)
    .set(bearer(token))
    .send({ name });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; name: string; itemCount: number };
}

async function createItem(
  token: string,
  categoryId: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request(app)
    .post(`${API}/items`)
    .set(bearer(token))
    .send({
      categoryId,
      name: "Chicken Biryani",
      description: "Basmati rice, spiced chicken",
      basePrice: 450,
      dietaryTags: ["halal"],
      allergens: ["dairy"],
      variants: [
        { name: "Small", price: 450 },
        { name: "Large", price: 650 },
      ],
      ...overrides,
    });
  expect(response.status).toBe(201);
  return response.body.data as {
    id: string;
    variants: Array<{ id: string; name: string }>;
  };
}

beforeEach(async () => {
  await truncateAll();
  menuCache.clear();
  removeAllMenuListeners();
  app = createApp();

  const main = await newTenant("Cafe Aroma");
  ownerToken = main.token;
  restaurantId = main.restaurant.id;
  const other = await newTenant("Other Cafe");
  otherOwnerToken = other.token;
  otherRestaurantId = other.restaurant.id;
});

afterEach(() => {
  setMediaStorage(null);
});

describe("categories (FR-06, FR-13)", () => {
  it("creates, lists with item counts, renames and hides a category", async () => {
    const created = await createCategory(ownerToken, "Starters");
    await createItem(ownerToken, created.id, {
      name: "Paneer Tikka",
      basePrice: 480,
      variants: [],
    });

    const list = await request(app).get(`${API}/categories`).set(bearer(ownerToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ name: "Starters", itemCount: 1 });

    const patch = await request(app)
      .patch(`${API}/categories/${created.id}`)
      .set(bearer(ownerToken))
      .send({ name: "Starter Plates", isActive: false });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ name: "Starter Plates", isActive: false });
  });

  it("rewrites display order only for the full category set", async () => {
    const first = await createCategory(ownerToken, "Mains");
    const second = await createCategory(ownerToken, "Drinks");

    const response = await request(app)
      .put(`${API}/categories/order`)
      .set(bearer(ownerToken))
      .send({ ids: [second.id, first.id] });
    expect(response.status).toBe(200);
    expect(response.body.data.map((c: { id: string }) => c.id)).toEqual([
      second.id,
      first.id,
    ]);

    const missing = await request(app)
      .put(`${API}/categories/order`)
      .set(bearer(ownerToken))
      .send({ ids: [first.id] });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("blocks deleting a non-empty category unless force=true", async () => {
    const category = await createCategory(ownerToken, "Mains");
    await createItem(ownerToken, category.id, { variants: [] });

    const blocked = await request(app)
      .delete(`${API}/categories/${category.id}`)
      .set(bearer(ownerToken));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("CATEGORY_NOT_EMPTY");

    const forced = await request(app)
      .delete(`${API}/categories/${category.id}?force=true`)
      .set(bearer(ownerToken));
    expect(forced.status).toBe(204);

    const { rows } = await getPool().query("SELECT count(*)::int AS n FROM menu_items");
    expect(rows[0].n).toBe(0);
  });

  it("returns 404 for another restaurant's category", async () => {
    const foreign = await createCategory(otherOwnerToken, "Foreign");
    const response = await request(app)
      .patch(`${API}/categories/${foreign.id}`)
      .set(bearer(ownerToken))
      .send({ name: "Hijacked" });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});

describe("items and variants (FR-07, FR-08, FR-10, FR-12)", () => {
  it("creates an item with variants and returns snapshot-ready detail", async () => {
    const category = await createCategory(ownerToken);
    const item = await createItem(ownerToken, category.id);

    const detail = await request(app)
      .get(`${API}/items/${item.id}`)
      .set(bearer(ownerToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      name: "Chicken Biryani",
      basePrice: 450,
      dietaryTags: ["halal"],
      allergens: ["dairy"],
      isAvailable: true,
    });
    expect(detail.body.data.variants).toHaveLength(2);
    expect(detail.body.data.currency).toBeUndefined();
  });

  it("validates names, prices and duplicate variant names", async () => {
    const category = await createCategory(ownerToken);

    const emptyName = await request(app)
      .post(`${API}/items`)
      .set(bearer(ownerToken))
      .send({ categoryId: category.id, name: "", basePrice: 10 });
    expect(emptyName.status).toBe(400);
    expect(emptyName.body.error.details[0].field).toBe("name");

    const badPrice = await request(app)
      .post(`${API}/items`)
      .set(bearer(ownerToken))
      .send({ categoryId: category.id, name: "Tea", basePrice: -1 });
    expect(badPrice.status).toBe(400);

    const duplicateVariants = await request(app)
      .post(`${API}/items`)
      .set(bearer(ownerToken))
      .send({
        categoryId: category.id,
        name: "Tea",
        basePrice: 100,
        variants: [
          { name: "Large", price: 120 },
          { name: "large", price: 140 },
        ],
      });
    expect(duplicateVariants.status).toBe(400);
    expect(duplicateVariants.body.error.code).toBe("VALIDATION_ERROR");

    const tooManyVariants = await request(app)
      .post(`${API}/items`)
      .set(bearer(ownerToken))
      .send({
        categoryId: category.id,
        name: "Tea",
        basePrice: 100,
        variants: Array.from({ length: 11 }, (_, index) => ({
          name: `V${index}`,
          price: 100 + index,
        })),
      });
    expect(tooManyVariants.status).toBe(400);
  });

  it("lists items with pagination, category filter and search", async () => {
    const mains = await createCategory(ownerToken, "Mains");
    const drinks = await createCategory(ownerToken, "Drinks");
    await createItem(ownerToken, mains.id, { name: "Chicken Biryani", variants: [] });
    await createItem(ownerToken, mains.id, { name: "Daal Makhni", variants: [] });
    await createItem(ownerToken, drinks.id, { name: "Mint Lemonade", variants: [] });

    const page = await request(app)
      .get(`${API}/items?page=1&pageSize=2`)
      .set(bearer(ownerToken));
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3 });

    const filtered = await request(app)
      .get(`${API}/items?categoryId=${drinks.id}`)
      .set(bearer(ownerToken));
    expect(filtered.body.data.map((i: { name: string }) => i.name)).toEqual([
      "Mint Lemonade",
    ]);

    const searched = await request(app)
      .get(`${API}/items?q=biryani`)
      .set(bearer(ownerToken));
    expect(searched.body.data).toHaveLength(1);
  });

  it("updates, toggles availability, and deletes an item", async () => {
    const category = await createCategory(ownerToken);
    const item = await createItem(ownerToken, category.id);

    const updated = await request(app)
      .patch(`${API}/items/${item.id}`)
      .set(bearer(ownerToken))
      .send({ basePrice: 500, isAvailable: false, dietaryTags: ["halal", "gluten_free"] });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      basePrice: 500,
      isAvailable: false,
      dietaryTags: ["halal", "gluten_free"],
    });

    const toggle = await request(app)
      .patch(`${API}/items/${item.id}/availability`)
      .set(bearer(ownerToken))
      .send({ isAvailable: true });
    expect(toggle.status).toBe(200);
    expect(toggle.body.data).toEqual({ id: item.id, isAvailable: true });

    const removed = await request(app)
      .delete(`${API}/items/${item.id}`)
      .set(bearer(ownerToken));
    expect(removed.status).toBe(204);
  });

  it("rejects an item from another tenant with 404", async () => {
    const foreignCategory = await createCategory(otherOwnerToken, "Foreign");
    const foreignItem = await createItem(otherOwnerToken, foreignCategory.id, {
      variants: [],
    });

    const read = await request(app)
      .get(`${API}/items/${foreignItem.id}`)
      .set(bearer(ownerToken));
    expect(read.status).toBe(404);

    const write = await request(app)
      .patch(`${API}/items/${foreignItem.id}`)
      .set(bearer(ownerToken))
      .send({ basePrice: 1 });
    expect(write.status).toBe(404);
  });

  it("adds, updates and deletes variants; enforces the limit", async () => {
    const category = await createCategory(ownerToken);
    const item = await createItem(ownerToken, category.id, { variants: [] });

    const added = await request(app)
      .post(`${API}/items/${item.id}/variants`)
      .set(bearer(ownerToken))
      .send({ name: "Family", price: 1200 });
    expect(added.status).toBe(201);

    const updated = await request(app)
      .patch(`${API}/variants/${added.body.data.id}`)
      .set(bearer(ownerToken))
      .send({ price: 1300 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.price).toBe(1300);

    for (let index = 1; index < 10; index += 1) {
      const response = await request(app)
        .post(`${API}/items/${item.id}/variants`)
        .set(bearer(ownerToken))
        .send({ name: `Size ${index}`, price: 100 + index });
      expect(response.status).toBe(201);
    }
    const eleventh = await request(app)
      .post(`${API}/items/${item.id}/variants`)
      .set(bearer(ownerToken))
      .send({ name: "Too many", price: 100 });
    expect(eleventh.status).toBe(409);
    expect(eleventh.body.error.code).toBe("VARIANT_LIMIT_REACHED");

    const deleted = await request(app)
      .delete(`${API}/variants/${added.body.data.id}`)
      .set(bearer(ownerToken));
    expect(deleted.status).toBe(204);
  });

  it("emits menu.changed when availability changes", async () => {
    const category = await createCategory(ownerToken);
    const item = await createItem(ownerToken, category.id);
    const events: Array<{ itemId: string; isAvailable: boolean }> = [];
    const { onMenuChanged } = await import("../lib/menuEvents");
    const stop = onMenuChanged((event) => events.push(event));

    await request(app)
      .patch(`${API}/items/${item.id}/availability`)
      .set(bearer(ownerToken))
      .send({ isAvailable: false });

    stop();
    expect(events).toContainEqual(
      expect.objectContaining({ itemId: item.id, isAvailable: false })
    );
  });
});

describe("images (FR-09)", () => {
  it("returns a signature, stores at most three images, and deletes with storage cleanup", async () => {
    const deleted: string[] = [];
    const storage: MediaStorage = {
      createSignature: () => ({
        timestamp: 1,
        folder: `quickmenu/${restaurantId}`,
        signature: "sig",
        apiKey: "key",
        cloudName: "cloud",
      }),
      delete: async (publicId) => {
        deleted.push(publicId);
      },
    };
    setMediaStorage(storage);

    const category = await createCategory(ownerToken);
    const item = await createItem(ownerToken, category.id, { variants: [] });

    const signature = await request(app)
      .post(`${API}/media/upload-signature`)
      .set(bearer(ownerToken));
    expect(signature.status).toBe(200);
    expect(signature.body.data.folder).toBe(`quickmenu/${restaurantId}`);

    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const image = await request(app)
        .post(`${API}/items/${item.id}/images`)
        .set(bearer(ownerToken))
        .send({
          publicId: `quickmenu/${restaurantId}/item-${index}`,
          url: `https://res.cloudinary.com/demo/image/upload/item-${index}.jpg`,
        });
      expect(image.status).toBe(201);
      ids.push(image.body.data.id);
    }

    const fourth = await request(app)
      .post(`${API}/items/${item.id}/images`)
      .set(bearer(ownerToken))
      .send({
        publicId: `quickmenu/${restaurantId}/item-4`,
        url: "https://res.cloudinary.com/demo/image/upload/item-4.jpg",
      });
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe("IMAGE_LIMIT_REACHED");

    const foreign = await request(app)
      .post(`${API}/items/${item.id}/images`)
      .set(bearer(ownerToken))
      .send({
        publicId: `quickmenu/${otherRestaurantId}/other.jpg`,
        url: "https://res.cloudinary.com/demo/image/upload/other.jpg",
      });
    expect(foreign.status).toBe(400);

    const removed = await request(app)
      .delete(`${API}/images/${ids[0]}`)
      .set(bearer(ownerToken));
    expect(removed.status).toBe(204);
    expect(deleted).toEqual([`quickmenu/${restaurantId}/item-0`]);
  });
});
