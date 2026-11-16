import { randomUUID } from "crypto";
import type { OrderStatus } from "@quickmenu/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getPool, withTransaction } from "../db";
import { truncateAll } from "./testing";
import * as restaurants from "./restaurants";
import * as users from "./users";
import * as categories from "./categories";
import * as menuItems from "./menuItems";
import * as tables from "./tables";
import * as orders from "./orders";
import * as translations from "./translations";

const HASH_64 = "a".repeat(64);

async function expectPgError(fn: () => Promise<unknown>, code: string): Promise<void> {
  await expect(fn()).rejects.toMatchObject({ code });
}

async function makeRestaurant(slug: string) {
  return restaurants.create({ name: slug, slug });
}

async function makeItem(
  restaurantId: string,
  categoryId: string,
  name: string,
  overrides: Partial<menuItems.CreateMenuItemInput> = {}
) {
  return menuItems.create(
    restaurantId,
    { categoryId, name, basePrice: 100, ...overrides }
  );
}

async function makeTable(restaurantId: string, number: string) {
  return tables.create(restaurantId, {
    tableNumber: number,
    qrToken: `qr-${restaurantId.slice(0, 8)}-${number}`,
  });
}

async function makeOrder(
  restaurantId: string,
  tableId: string,
  clientRequestId: string = randomUUID(),
  status: OrderStatus = "new"
) {
  const orderNumber = await restaurants.incrementOrderCounter(restaurantId);
  const order = await orders.insertOrder({
    restaurantId,
    tableId,
    orderNumber,
    total: 100,
    status,
    clientRequestId,
    trackingTokenHash: HASH_64,
  });
  return order!;
}

describe("Phase 02 repositories", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe("tenant isolation (NFR-S6)", () => {
    it("never returns another restaurant's rows and returns null on cross-tenant reads", async () => {
      const a = await makeRestaurant("tenant-a");
      const b = await makeRestaurant("tenant-b");

      const catA = await categories.create(a.id, { name: "Starters" });
      const catB = await categories.create(b.id, { name: "Starters" });

      const itemA = await makeItem(a.id, catA.id, "Item A");
      const itemB = await makeItem(b.id, catB.id, "Item B");

      const tableA = await makeTable(a.id, "1");
      const tableB = await makeTable(b.id, "1");

      const userA = await users.create(a.id, {
        email: "a@example.com",
        name: "A",
        passwordHash: "x",
        role: "owner",
      });
      const userB = await users.create(b.id, {
        email: "b@example.com",
        name: "B",
        passwordHash: "x",
        role: "owner",
      });

      const orderA = await makeOrder(a.id, tableA.id);
      const orderB = await makeOrder(b.id, tableB.id);

      // List functions only see their own tenant.
      const aCategories = await categories.listByRestaurant(a.id);
      expect(aCategories.map((c) => c.id)).toEqual([catA.id]);
      expect(aCategories.some((c) => c.id === catB.id)).toBe(false);

      // Reads scoped to the wrong tenant return null.
      expect(await menuItems.getById(a.id, itemB.id)).toBeNull();
      expect(await menuItems.getById(b.id, itemA.id)).toBeNull();
      expect((await menuItems.getById(a.id, itemA.id))?.name).toBe("Item A");
      expect(await categories.getById(a.id, catB.id)).toBeNull();
      expect(await tables.getById(a.id, tableB.id)).toBeNull();
      expect(await users.getById(a.id, userB.id)).toBeNull();
      expect(await orders.getById(a.id, orderB.id)).toBeNull();
      expect(await orders.getById(a.id, orderA.id)).not.toBeNull();

      // Writes and deletes scoped to the wrong tenant affect nothing.
      expect(await menuItems.deleteItem(a.id, itemB.id)).toBe(false);
      expect(await menuItems.setAvailability(a.id, itemB.id, false)).toBeNull();
      expect(await menuItems.addVariant(a.id, itemB.id, { name: "S", price: 10 })).toBeNull();
      expect(await menuItems.addImage(a.id, itemB.id, { publicId: "p", url: "u" })).toBeNull();
      expect(await categories.update(a.id, catB.id, { name: "Hacked" })).toBeNull();
      expect(await tables.deleteTable(a.id, tableB.id)).toBe(false);

      // B's item is untouched.
      expect((await menuItems.getById(b.id, itemB.id))?.name).toBe("Item B");
      expect((await users.getById(b.id, userB.id))?.email).toBe("b@example.com");
      expect(await categories.getById(b.id, catB.id)).not.toBeNull();
      expect(userA.restaurantId).toBe(a.id);
    });
  });

  describe("unique constraints", () => {
    it("rejects a duplicate user email (citext, global)", async () => {
      const a = await makeRestaurant("dup-email");
      await users.create(a.id, {
        email: "owner@example.com",
        name: "One",
        passwordHash: "x",
        role: "owner",
      });
      await expectPgError(
        () =>
          users.create(a.id, {
            email: "OWNER@example.com",
            name: "Two",
            passwordHash: "x",
            role: "kitchen",
          }),
        "23505"
      );
    });

    it("rejects a duplicate category name inside one restaurant", async () => {
      const a = await makeRestaurant("dup-category");
      await categories.create(a.id, { name: "Drinks" });
      await expectPgError(() => categories.create(a.id, { name: "Drinks" }), "23505");
    });

    it("rejects a duplicate table number inside one restaurant", async () => {
      const a = await makeRestaurant("dup-table");
      await makeTable(a.id, "5");
      await expectPgError(() => makeTable(a.id, "5"), "23505");
    });

    it("allows the same table number in different restaurants", async () => {
      const a = await makeRestaurant("table-a");
      const b = await makeRestaurant("table-b");
      await makeTable(a.id, "5");
      await expect(makeTable(b.id, "5")).resolves.toBeTruthy();
    });

    it("makes order creation idempotent on client_request_id (NFR-R5)", async () => {
      const a = await makeRestaurant("idempotent");
      const table = await makeTable(a.id, "1");
      const key = randomUUID();

      const first = await makeOrder(a.id, table.id, key);
      const replay = await orders.insertOrder({
        restaurantId: a.id,
        tableId: table.id,
        orderNumber: 999,
        total: 100,
        clientRequestId: key,
        trackingTokenHash: HASH_64,
      });

      expect(replay).toBeNull();
      const found = await orders.findByClientRequestId(key);
      expect(found?.id).toBe(first.id);
      const { rows } = await getPool().query<{ count: string }>(
        "SELECT count(*)::text AS count FROM orders"
      );
      expect(rows[0]!.count).toBe("1");
    });
  });

  describe("check constraints", () => {
    it("rejects a negative base price", async () => {
      const a = await makeRestaurant("neg-price");
      const cat = await categories.create(a.id, { name: "Mains" });
      await expectPgError(
        () => makeItem(a.id, cat.id, "Bad", { basePrice: -1 }),
        "23514"
      );
    });

    it("rejects an invalid dietary tag", async () => {
      const a = await makeRestaurant("bad-tag");
      const cat = await categories.create(a.id, { name: "Mains" });
      await expectPgError(
        () => makeItem(a.id, cat.id, "Bad", { dietaryTags: ["bogus"] }),
        "23514"
      );
    });

    it("rejects an invalid allergen", async () => {
      const a = await makeRestaurant("bad-allergen");
      const cat = await categories.create(a.id, { name: "Mains" });
      await expectPgError(
        () => makeItem(a.id, cat.id, "Bad", { allergens: ["gluten-ish"] }),
        "23514"
      );
    });

    it("rejects quantity 0 and 51 (allowed 1..50)", async () => {
      const a = await makeRestaurant("bad-qty");
      const table = await makeTable(a.id, "1");
      const order = await makeOrder(a.id, table.id);

      for (const quantity of [0, 51]) {
        await expectPgError(
          () =>
            orders.insertOrderItems(order.id, [
              {
                itemId: null,
                variantId: null,
                itemName: "Thing",
                variantName: null,
                quantity,
                unitPrice: 10,
              },
            ]),
          "23514"
        );
      }
    });
  });

  it("enforces at most 3 images per item (trg_limit_item_images)", async () => {
    const a = await makeRestaurant("images");
    const cat = await categories.create(a.id, { name: "Mains" });
    const item = await makeItem(a.id, cat.id, "Photo item");

    for (let index = 0; index < 3; index += 1) {
      await expect(
        menuItems.addImage(a.id, item.id, { publicId: `p${index}`, url: `u${index}` })
      ).resolves.toBeTruthy();
    }
    await expect(
      menuItems.addImage(a.id, item.id, { publicId: "p3", url: "u3" })
    ).rejects.toThrow(/at most 3 images/i);

    expect(await menuItems.listImages(a.id, item.id)).toHaveLength(3);
  });

  describe("order transaction primitive (Q4)", () => {
    it("rolls back everything when the transaction fails", async () => {
      const a = await makeRestaurant("rollback");
      const table = await makeTable(a.id, "1");

      await expect(
        withTransaction(async (client) => {
          const orderNumber = await restaurants.incrementOrderCounter(a.id, client);
          await orders.insertOrder(
            {
              restaurantId: a.id,
              tableId: table.id,
              orderNumber,
              total: 100,
              clientRequestId: randomUUID(),
              trackingTokenHash: HASH_64,
            },
            client
          );
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");

      expect((await restaurants.getById(a.id))?.orderCounter).toBe(0);
      expect(await orders.listHistory(a.id)).toMatchObject({ total: 0 });
    });

    it("creates order + lines + history and reserves one order number", async () => {
      const a = await makeRestaurant("create-order");
      const cat = await categories.create(a.id, { name: "Mains" });
      const item = await makeItem(a.id, cat.id, "Biryani", { basePrice: 200 });
      const table = await makeTable(a.id, "1");

      const created = await withTransaction(async (client) => {
        const orderNumber = await restaurants.incrementOrderCounter(a.id, client);
        const order = await orders.insertOrder(
          {
            restaurantId: a.id,
            tableId: table.id,
            orderNumber,
            total: 400,
            clientRequestId: randomUUID(),
            trackingTokenHash: HASH_64,
          },
          client
        );
        await orders.insertOrderItems(
          order!.id,
          [
            {
              itemId: item.id,
              variantId: null,
              itemName: item.name,
              variantName: null,
              quantity: 2,
              unitPrice: item.basePrice,
              specialInstructions: "extra spicy",
            },
          ],
          client
        );
        await orders.insertStatusHistory(order!.id, "new", null, client);
        return order!;
      });

      const full = await orders.getById(a.id, created.id);
      expect(full?.orderNumber).toBe(1);
      expect(full?.items).toHaveLength(1);
      expect(full?.items[0]!.quantity).toBe(2);
      expect(await orders.listStatusHistory(a.id, created.id)).toHaveLength(1);
      expect((await restaurants.getById(a.id))?.orderCounter).toBe(1);
    });
  });

  describe("query patterns Q1-Q3, Q5", () => {
    it("Q1/Q2: assembles the menu and filters by tag, allergen and name", async () => {
      const a = await makeRestaurant("menu");
      const starters = await categories.create(a.id, { name: "Starters", displayOrder: 1 });
      const mains = await categories.create(a.id, { name: "Mains", displayOrder: 2 });

      const veg = await makeItem(a.id, starters.id, "Veg Spring Rolls", {
        basePrice: 350,
        dietaryTags: ["vegetarian"],
        allergens: ["gluten"],
      });
      await menuItems.addVariant(a.id, veg.id, { name: "Small", price: 350 });
      await menuItems.addImage(a.id, veg.id, { publicId: "veg-1", url: "https://img/veg" });
      await makeItem(a.id, mains.id, "Nut Brownie", {
        basePrice: 300,
        dietaryTags: ["vegetarian"],
        allergens: ["nuts"],
      });
      await makeItem(a.id, mains.id, "Beef Steak", { basePrice: 900, dietaryTags: [], allergens: [] });

      const menu = await menuItems.getMenu(a.id, { onlyAvailable: true });
      expect(menu.map((c) => c.name)).toEqual(["Starters", "Mains"]);
      expect(menu[0]!.items[0]!.variants).toHaveLength(1);
      expect(menu[0]!.items[0]!.images).toHaveLength(1);

      const filtered = await menuItems.getMenu(a.id, {
        dietaryTags: ["vegetarian"],
        excludeAllergens: ["nuts"],
      });
      const names = filtered.flatMap((c) => c.items.map((i) => i.name));
      expect(names).toEqual(["Veg Spring Rolls"]);

      const searched = await menuItems.getMenu(a.id, { search: "brown" });
      expect(searched.flatMap((c) => c.items.map((i) => i.name))).toEqual(["Nut Brownie"]);
    });

    it("Q3: lists only active orders", async () => {
      const a = await makeRestaurant("active-orders");
      const table = await makeTable(a.id, "1");
      await makeOrder(a.id, table.id, randomUUID(), "new");
      await makeOrder(a.id, table.id, randomUUID(), "preparing");
      await makeOrder(a.id, table.id, randomUUID(), "ready");
      await makeOrder(a.id, table.id, randomUUID(), "served");
      await makeOrder(a.id, table.id, randomUUID(), "cancelled");

      const active = await orders.listActive(a.id);
      expect(active).toHaveLength(3);
      expect(active.every((o) => o.status !== "served" && o.status !== "cancelled")).toBe(true);
    });

    it("Q5: returns null on miss and the cached text on hit", async () => {
      const a = await makeRestaurant("translations");
      const cat = await categories.create(a.id, { name: "Drinks" });
      const item = await makeItem(a.id, cat.id, "Cappuccino");
      const key = {
        entityType: "item" as const,
        entityId: item.id,
        field: "name" as const,
        language: "ur",
        sourceHash: "h1".padEnd(64, "0"),
      };

      expect(await translations.lookup(key)).toBeNull();
      await translations.upsert({ ...key, restaurantId: a.id, translatedText: "کیپوچینو" });
      expect(await translations.lookup(key)).toBe("کیپوچینو");

      // A changed source hash invalidates the cache entry.
      expect(await translations.lookup({ ...key, sourceHash: "h2".padEnd(64, "0") })).toBeNull();

      // Upsert on the same key overwrites the cached value.
      await translations.upsert({ ...key, restaurantId: a.id, translatedText: "نئی" });
      expect(await translations.lookup(key)).toBe("نئی");
    });
  });

  it("EXPLAIN: Q3 uses the ix_orders_active partial index", async () => {
    const a = await makeRestaurant("explain");
    const table = await makeTable(a.id, "1");

    // Many finished orders make the partial index clearly the cheapest choice.
    for (let index = 0; index < 100; index += 1) {
      await makeOrder(a.id, table.id, randomUUID(), "served");
    }
    for (let index = 0; index < 10; index += 1) {
      await makeOrder(a.id, table.id, randomUUID(), "new");
    }

    const client = await getPool().connect();
    try {
      await client.query("SET enable_seqscan = off");
      const { rows } = await client.query<{ "QUERY PLAN": unknown }>(
        `EXPLAIN (FORMAT JSON) ${orders.ACTIVE_ORDERS_SQL}`,
        [a.id]
      );
      await client.query("RESET enable_seqscan");
      const plan = JSON.stringify(rows[0]?.["QUERY PLAN"] ?? rows[0]);
      expect(plan).toContain("ix_orders_active");
    } finally {
      client.release();
    }
  });
});
