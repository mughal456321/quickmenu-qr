import type {
  PublicMenu,
  PublicMenuCategory,
  PublicMenuItem,
  PublicMenuVariant,
} from "@quickmenu/shared";
import { NotFoundError, TableInactiveError } from "../errors";
import * as menuItems from "../repositories/menuItems";
import * as restaurants from "../repositories/restaurants";
import * as tables from "../repositories/tables";

/**
 * Minimal public menu for the scanned table (FR-17, FR-18). Translation,
 * filtering and search are deliberately out of scope for phase 06.
 */
export async function getMenu(qrToken: string): Promise<PublicMenu> {
  const table = await tables.findByQrToken(qrToken);
  if (!table) {
    // Never reveal whether the token ever existed.
    throw new NotFoundError("Menu not found.");
  }
  if (!table.isActive) {
    throw new TableInactiveError();
  }

  const restaurant = await restaurants.getById(table.restaurantId);
  if (!restaurant) {
    throw new NotFoundError("Menu not found.");
  }

  const categories = await menuItems.getMenu(restaurant.id);

  return {
    restaurant: {
      name: restaurant.name,
      currency: restaurant.currency,
      defaultLanguage: restaurant.defaultLanguage,
    },
    table: { id: table.id, number: table.tableNumber },
    language: restaurant.defaultLanguage,
    categories: categories.map(mapCategory),
  };
}

function mapCategory(
  category: Awaited<ReturnType<typeof menuItems.getMenu>>[number]
): PublicMenuCategory {
  return {
    id: category.id,
    name: category.name,
    items: category.items.map(mapItem),
  };
}

function mapItem(
  item: Awaited<ReturnType<typeof menuItems.getMenu>>[number]["items"][number]
): PublicMenuItem {
  const variants: PublicMenuVariant[] = item.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    price: variant.price,
  }));
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.basePrice,
    variants,
    images: item.images.map((image) => ({ url: image.url })),
    dietaryTags: item.dietaryTags,
    allergens: item.allergens,
    isAvailable: item.isAvailable,
  };
}
