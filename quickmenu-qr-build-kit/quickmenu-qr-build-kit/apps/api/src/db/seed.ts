import { createHash, randomBytes, randomUUID } from "crypto";
import bcrypt from "bcrypt";
import type { MenuItem } from "@quickmenu/shared";
import { closePool, withTransaction } from "../db";
import * as restaurants from "../repositories/restaurants";
import * as users from "../repositories/users";
import * as categories from "../repositories/categories";
import * as menuItems from "../repositories/menuItems";
import * as tables from "../repositories/tables";
import * as orders from "../repositories/orders";

/**
 * Seed the demo restaurant "Cafe Aroma" (docs/03 2.11 and DECISIONS D-26).
 * Idempotent: an existing "cafe-aroma" tenant is removed (cascade) and rebuilt.
 */

const SLUG = "cafe-aroma";
const BCRYPT_ROUNDS = 10;

const OWNER_EMAIL = "owner@cafearoma.pk";
const OWNER_PASSWORD = "CafeAroma2026!";
const KITCHEN_EMAIL = "kitchen@cafearoma.pk";
const KITCHEN_PASSWORD = "KitchenCafe2026!";

function qrToken(): string {
  return randomBytes(16).toString("base64url");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function placeholderUrl(restaurantId: string, slug: string): { publicId: string; url: string } {
  const publicId = `quickmenu/${restaurantId}/${slug}`;
  return {
    publicId,
    url: `https://res.cloudinary.com/quickmenu-demo/image/upload/v1/${publicId}.jpg`,
  };
}

interface CategorySpec {
  name: string;
  items: ItemSpec[];
}

interface VariantSpec {
  name: string;
  price: number;
}

interface ItemSpec {
  name: string;
  description: string;
  basePrice: number;
  dietaryTags: string[];
  allergens: string[];
  variants?: VariantSpec[];
  images?: number;
}

const MENU: CategorySpec[] = [
  {
    name: "Starters",
    items: [
      {
        name: "Spring Rolls",
        description: "Crispy vegetable rolls served with a sweet chilli dip.",
        basePrice: 350,
        dietaryTags: ["vegetarian", "halal"],
        allergens: ["gluten", "soy"],
        images: 1,
      },
      {
        name: "Chicken Wings",
        description: "Spicy grilled wings with a smoky glaze.",
        basePrice: 550,
        dietaryTags: ["halal"],
        allergens: [],
        images: 1,
      },
      {
        name: "Loaded Fries",
        description: "Fries topped with cheese sauce and jalapenos.",
        basePrice: 450,
        dietaryTags: ["vegetarian", "halal"],
        allergens: ["dairy"],
      },
    ],
  },
  {
    name: "Mains",
    items: [
      {
        name: "Chicken Biryani",
        description: "Fragrant basmati rice layered with spiced chicken.",
        basePrice: 700,
        dietaryTags: ["halal"],
        allergens: [],
        variants: [
          { name: "Half", price: 700 },
          { name: "Full", price: 1200 },
        ],
        images: 2,
      },
      {
        name: "Beef Karahi",
        description: "Slow-cooked beef in a rich tomato and ginger gravy.",
        basePrice: 1100,
        dietaryTags: ["halal"],
        allergens: ["dairy"],
        images: 1,
      },
      {
        name: "Margherita Pizza",
        description: "Wood-fired base with tomato, mozzarella and basil.",
        basePrice: 900,
        dietaryTags: ["vegetarian", "halal"],
        allergens: ["gluten", "dairy"],
        variants: [
          { name: "Small", price: 900 },
          { name: "Large", price: 1400 },
        ],
        images: 1,
      },
      {
        name: "Chicken Burger",
        description: "Grilled chicken fillet with lettuce and mayo.",
        basePrice: 650,
        dietaryTags: ["halal"],
        allergens: ["gluten", "dairy", "eggs"],
      },
    ],
  },
  {
    name: "Drinks",
    items: [
      {
        name: "Mint Lemonade",
        description: "Fresh lemon, mint and crushed ice.",
        basePrice: 250,
        dietaryTags: ["vegan", "vegetarian", "halal"],
        allergens: [],
        images: 1,
      },
      {
        name: "Cappuccino",
        description: "Double espresso with steamed milk foam.",
        basePrice: 400,
        dietaryTags: ["vegetarian", "halal"],
        allergens: ["dairy"],
        variants: [
          { name: "Regular", price: 400 },
          { name: "Large", price: 500 },
        ],
      },
      {
        name: "Mango Lassi",
        description: "Chilled yoghurt blended with sweet mango.",
        basePrice: 300,
        dietaryTags: ["vegetarian", "halal"],
        allergens: ["dairy"],
      },
    ],
  },
  {
    name: "Desserts",
    items: [
      {
        name: "Chocolate Brownie",
        description: "Warm fudgy brownie with a scoop of vanilla.",
        basePrice: 350,
        dietaryTags: ["vegetarian", "halal"],
        allergens: ["gluten", "dairy", "eggs"],
        images: 1,
      },
      {
        name: "Kulfi",
        description: "Traditional saffron and pistachio ice cream.",
        basePrice: 300,
        dietaryTags: ["vegetarian", "halal"],
        allergens: ["dairy", "nuts"],
      },
    ],
  },
];

interface OrderSpec {
  status: "new" | "preparing" | "ready" | "served";
  tableNumber: string;
  notes: string | null;
  lines: { item: string; quantity: number; variant?: string }[];
}

const DEMO_ORDERS: OrderSpec[] = [
  {
    status: "new",
    tableNumber: "1",
    notes: null,
    lines: [
      { item: "Chicken Biryani", quantity: 2, variant: "Full" },
      { item: "Mint Lemonade", quantity: 2 },
    ],
  },
  {
    status: "preparing",
    tableNumber: "3",
    notes: "No onions, please.",
    lines: [
      { item: "Margherita Pizza", quantity: 1, variant: "Large" },
      { item: "Chocolate Brownie", quantity: 1 },
    ],
  },
  {
    status: "ready",
    tableNumber: "5",
    notes: null,
    lines: [
      { item: "Beef Karahi", quantity: 1 },
      { item: "Cappuccino", quantity: 2, variant: "Regular" },
    ],
  },
  {
    status: "served",
    tableNumber: "2",
    notes: null,
    lines: [
      { item: "Spring Rolls", quantity: 1 },
      { item: "Kulfi", quantity: 2 },
    ],
  },
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function seed(): Promise<void> {
  const result = await withTransaction(async (client) => {
    await restaurants.deleteBySlug(SLUG, client);

    const restaurant = await restaurants.create(
      { name: "Cafe Aroma", slug: SLUG, defaultLanguage: "en", currency: "PKR" },
      client
    );

    const owner = await users.create(
      restaurant.id,
      {
        email: OWNER_EMAIL,
        name: "Ayesha Khan",
        passwordHash: await bcrypt.hash(OWNER_PASSWORD, BCRYPT_ROUNDS),
        role: "owner",
      },
      client
    );
    await users.create(
      restaurant.id,
      {
        email: KITCHEN_EMAIL,
        name: "Bilal Ahmed",
        passwordHash: await bcrypt.hash(KITCHEN_PASSWORD, BCRYPT_ROUNDS),
        role: "kitchen",
      },
      client
    );

    const itemByName = new Map<string, MenuItem>();
    let categoryOrder = 0;
    for (const spec of MENU) {
      categoryOrder += 1;
      const category = await categories.create(
        restaurant.id,
        { name: spec.name, displayOrder: categoryOrder },
        client
      );

      let itemOrder = 0;
      for (const itemSpec of spec.items) {
        itemOrder += 1;
        const item = await menuItems.create(
          restaurant.id,
          {
            categoryId: category.id,
            name: itemSpec.name,
            description: itemSpec.description,
            basePrice: itemSpec.basePrice,
            dietaryTags: itemSpec.dietaryTags,
            allergens: itemSpec.allergens,
            displayOrder: itemOrder,
          },
          client
        );

        if (itemSpec.variants) {
          let variantOrder = 0;
          for (const variant of itemSpec.variants) {
            variantOrder += 1;
            await menuItems.addVariant(
              restaurant.id,
              item.id,
              { name: variant.name, price: variant.price, displayOrder: variantOrder },
              client
            );
          }
        }

        for (let index = 0; index < (itemSpec.images ?? 0); index += 1) {
          const { publicId, url } = placeholderUrl(
            restaurant.id,
            `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`
          );
          await menuItems.addImage(
            restaurant.id,
            item.id,
            { publicId, url, displayOrder: index },
            client
          );
        }

        itemByName.set(item.name, item);
      }
    }

    for (let number = 1; number <= 7; number += 1) {
      await tables.create(
        restaurant.id,
        { tableNumber: String(number), qrToken: qrToken() },
        client
      );
    }

    const tableList = await tables.listByRestaurant(restaurant.id, client);
    const tableByNumber = new Map(tableList.map((t) => [t.tableNumber, t]));

    for (const orderSpec of DEMO_ORDERS) {
      const table = tableByNumber.get(orderSpec.tableNumber)!;
      const lines = orderSpec.lines.map((line) => ({ line, item: itemByName.get(line.item)! }));

      const variantsByItem = new Map<string, { id: string; name: string; price: number }[]>();
      for (const { item } of lines) {
        if (!variantsByItem.has(item.id)) {
          const variants = await menuItems.listVariants(restaurant.id, item.id, client);
          variantsByItem.set(
            item.id,
            variants.map((v) => ({ id: v.id, name: v.name, price: v.price }))
          );
        }
      }

      const orderLines = lines.map(({ line, item }) => {
        const variants = variantsByItem.get(item.id) ?? [];
        const chosen = line.variant
          ? variants.find((v) => v.name === line.variant)
          : undefined;
        const unitPrice = chosen ? chosen.price : item.basePrice;
        return {
          itemId: item.id,
          variantId: chosen ? chosen.id : null,
          itemName: item.name,
          variantName: chosen ? chosen.name : null,
          quantity: line.quantity,
          unitPrice,
          specialInstructions: null,
        };
      });

      const total = round2(
        orderLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
      );

      const orderNumber = await restaurants.incrementOrderCounter(restaurant.id, client);
      const created = await orders.insertOrder(
        {
          restaurantId: restaurant.id,
          tableId: table.id,
          orderNumber,
          total,
          notes: orderSpec.notes,
          clientRequestId: randomUUID(),
          trackingTokenHash: sha256(randomBytes(24).toString("base64url")),
        },
        client
      );
      if (!created) continue;

      await orders.insertOrderItems(created.id, orderLines, client);
      await orders.insertStatusHistory(created.id, "new", null, client);
      if (orderSpec.status !== "new") {
        await orders.changeStatus(restaurant.id, created.id, orderSpec.status, owner.id, client);
      }
    }

    return { restaurant, itemCount: itemByName.size };
  });

  console.info(
    `seed: Cafe Aroma ready (restaurant ${result.restaurant.id}, ${result.itemCount} items, 7 tables, ${DEMO_ORDERS.length} orders)`
  );
  console.info(`seed: owner ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.info(`seed: kitchen ${KITCHEN_EMAIL} / ${KITCHEN_PASSWORD}`);
}

async function main(): Promise<void> {
  try {
    await seed();
  } finally {
    await closePool();
  }
}

main();
