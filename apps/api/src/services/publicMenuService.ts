import type {
  LanguageOption,
  PublicMenu,
  PublicMenuCategory,
  PublicMenuItem,
  PublicMenuQuery,
  PublicMenuVariant,
} from "@quickmenu/shared";
import { SUPPORTED_LANGUAGES } from "@quickmenu/shared";
import { NotFoundError, TableInactiveError } from "../errors";
import { menuCache } from "../lib/menuCache";
import * as menuItems from "../repositories/menuItems";
import * as restaurants from "../repositories/restaurants";
import * as tables from "../repositories/tables";
import { translateMenu } from "./translationService";

export interface PublicMenuResult {
  menu: PublicMenu;
  warnings: string[];
}

/** Cloudinary delivery transformation (FR-22): small, auto format/quality. */
function transformedImageUrl(url: string): string {
  if (!url.includes("/upload/")) return url;
  return url.replace("/upload/", "/upload/w_400,q_auto,f_auto/");
}

function cacheKey(
  restaurantId: string,
  tableId: string,
  language: string,
  query: PublicMenuQuery
): string {
  const dietary = [...(query.dietary ?? [])].sort().join(",");
  const exclude = [...(query.exclude ?? [])].sort().join(",");
  return `${restaurantId}:${tableId}|${language}|${dietary}|${exclude}|${query.q ?? ""}`;
}

/**
 * Public menu for the scanned table (FR-17..FR-22).
 *
 * Filters and search are applied in SQL; translation uses the cache first and
 * never blocks the response. The result is cached for five seconds (D-8) and
 * the whole restaurant namespace is invalidated by owner writes.
 */
export async function getMenu(
  qrToken: string,
  query: PublicMenuQuery = {}
): Promise<PublicMenuResult> {
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

  const language = query.lang ?? restaurant.defaultLanguage;
  const key = cacheKey(restaurant.id, table.id, language, query);
  const cached = menuCache.get<PublicMenuResult>(key);
  if (cached) return cached;

  const categories = await menuItems.getMenu(restaurant.id, {
    onlyAvailable: false,
    dietaryTags: query.dietary?.length ? query.dietary : null,
    excludeAllergens: query.exclude?.length ? query.exclude : null,
    search: query.q?.trim() || null,
  });

  const translated = await translateMenu(
    restaurant.id,
    restaurant.defaultLanguage,
    language,
    categories
  );

  const menu: PublicMenu = {
    restaurant: {
      name: restaurant.name,
      currency: restaurant.currency,
      defaultLanguage: restaurant.defaultLanguage,
    },
    table: { id: table.id, number: table.tableNumber },
    language,
    categories: translated.categories.map(mapCategory),
  };

  const result = { menu, warnings: translated.warnings };
  menuCache.set(key, result);
  return result;
}

/** FR-20: the supported language list with native names and RTL flags. */
export function getLanguages(): LanguageOption[] {
  return SUPPORTED_LANGUAGES.map((language) => ({ ...language }));
}

function mapCategory(category: Awaited<ReturnType<typeof menuItems.getMenu>>[number]): PublicMenuCategory {
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
    images: item.images.map((image) => ({ url: transformedImageUrl(image.url) })),
    dietaryTags: item.dietaryTags,
    allergens: item.allergens,
    isAvailable: item.isAvailable,
  };
}
