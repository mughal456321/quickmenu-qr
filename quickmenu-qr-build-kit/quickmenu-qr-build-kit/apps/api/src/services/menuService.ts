import type {
  CategoryWithCount,
  ItemCreateInput,
  ItemImage,
  ItemImageInput,
  ItemListQuery,
  ItemUpdateInput,
  ItemVariant,
  MenuItemAvailability,
  MenuItemPage,
  MenuItemWithDetails,
  UploadSignature,
  VariantCreateInput,
  VariantUpdateInput,
} from "@quickmenu/shared";
import { withTransaction } from "../db";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { menuCache } from "../lib/menuCache";
import { emitMenuChanged } from "../lib/menuEvents";
import {
  belongsToRestaurant,
  deleteImageQuietly,
  getMediaStorage,
} from "../lib/mediaStorage";
import * as categoriesRepo from "../repositories/categories";
import * as menuItemsRepo from "../repositories/menuItems";

function invalidate(restaurantId: string): void {
  menuCache.invalidate(restaurantId);
}

function changed(restaurantId: string, itemId: string, isAvailable: boolean): void {
  invalidate(restaurantId);
  emitMenuChanged({ restaurantId, itemId, isAvailable });
}

async function requireCategory(
  restaurantId: string,
  categoryId: string
): Promise<void> {
  const category = await categoriesRepo.getById(restaurantId, categoryId);
  if (!category) throw new NotFoundError("Category not found.");
}

async function requireItem(
  restaurantId: string,
  itemId: string
): Promise<MenuItemWithDetails> {
  const item = await menuItemsRepo.getById(restaurantId, itemId);
  if (!item) throw new NotFoundError("Menu item not found.");
  return item;
}

/* ------------------------------------------------------------------ */
/* Categories (FR-06, FR-13)                                          */
/* ------------------------------------------------------------------ */

export async function listCategories(restaurantId: string): Promise<CategoryWithCount[]> {
  const [categories, counts] = await Promise.all([
    categoriesRepo.listByRestaurant(restaurantId),
    categoriesRepo.itemCounts(restaurantId),
  ]);
  return categories.map((category) => ({
    ...category,
    itemCount: counts.get(category.id) ?? 0,
  }));
}

export async function createCategory(
  restaurantId: string,
  input: { name: string; isActive?: boolean; displayOrder?: number }
): Promise<CategoryWithCount> {
  const category = await categoriesRepo.create(restaurantId, input);
  invalidate(restaurantId);
  return { ...category, itemCount: 0 };
}

export async function updateCategory(
  restaurantId: string,
  id: string,
  patch: { name?: string; isActive?: boolean; displayOrder?: number }
) {
  const updated = await categoriesRepo.update(restaurantId, id, patch);
  if (!updated) throw new NotFoundError("Category not found.");
  invalidate(restaurantId);
  return updated;
}

export async function reorderCategories(restaurantId: string, ids: string[]): Promise<void> {
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError("One or more fields are invalid.", [
      { field: "ids", issue: "Category ids must be unique." },
    ]);
  }
  const total = await categoriesRepo.countByRestaurant(restaurantId);
  if (total !== ids.length) {
    throw new ValidationError("One or more fields are invalid.", [
      {
        field: "ids",
        issue: "The list must contain exactly every category of this restaurant.",
      },
    ]);
  }
  const updated = await categoriesRepo.reorder(restaurantId, ids);
  if (updated !== ids.length) {
    throw new ValidationError("One or more fields are invalid.", [
      { field: "ids", issue: "One or more categories do not belong to this restaurant." },
    ]);
  }
  invalidate(restaurantId);
}

/** FR-13: deleting a non-empty category requires `?force=true`. */
export async function deleteCategory(
  restaurantId: string,
  id: string,
  force: boolean
): Promise<void> {
  const category = await categoriesRepo.getById(restaurantId, id);
  if (!category) throw new NotFoundError("Category not found.");

  const itemCount = await categoriesRepo.countItems(restaurantId, id);
  if (itemCount > 0 && !force) {
    throw new AppError(
      "CATEGORY_NOT_EMPTY",
      409,
      "This category still contains items. Move or delete them, or retry with force=true."
    );
  }

  await withTransaction(async (client) => {
    if (force) {
      await menuItemsRepo.deleteByCategory(restaurantId, id, client);
    }
    await categoriesRepo.deleteCategory(restaurantId, id, client);
  });
  invalidate(restaurantId);
}

/* ------------------------------------------------------------------ */
/* Items (FR-07, FR-08, FR-10, FR-11, FR-12)                          */
/* ------------------------------------------------------------------ */

export async function listItems(
  restaurantId: string,
  query: ItemListQuery
): Promise<MenuItemPage> {
  const page = await menuItemsRepo.listPage(
    restaurantId,
    { categoryId: query.categoryId, search: query.q },
    query.page,
    query.pageSize
  );
  return { items: page.items, total: page.total };
}

export async function getItem(
  restaurantId: string,
  id: string
): Promise<MenuItemWithDetails> {
  return requireItem(restaurantId, id);
}

export async function createItem(
  restaurantId: string,
  input: ItemCreateInput
): Promise<MenuItemWithDetails> {
  await requireCategory(restaurantId, input.categoryId);

  const itemId = await withTransaction(async (client) => {
    const item = await menuItemsRepo.create(
      restaurantId,
      {
        categoryId: input.categoryId,
        name: input.name,
        description: input.description ?? null,
        basePrice: input.basePrice,
        isAvailable: input.isAvailable,
        dietaryTags: input.dietaryTags,
        allergens: input.allergens,
        displayOrder: input.displayOrder,
      },
      client
    );
    for (const [index, variant] of (input.variants ?? []).entries()) {
      await menuItemsRepo.addVariant(
        restaurantId,
        item.id,
        { ...variant, displayOrder: variant.displayOrder ?? index },
        client
      );
    }
    return item.id;
  });

  changed(restaurantId, itemId, input.isAvailable ?? true);
  return requireItem(restaurantId, itemId);
}

export async function updateItem(
  restaurantId: string,
  id: string,
  patch: ItemUpdateInput
): Promise<MenuItemWithDetails> {
  await requireItem(restaurantId, id);
  if (patch.categoryId) await requireCategory(restaurantId, patch.categoryId);

  await withTransaction(async (client) => {
    const updated = await menuItemsRepo.update(
      restaurantId,
      id,
      {
        categoryId: patch.categoryId,
        name: patch.name,
        description: patch.description,
        basePrice: patch.basePrice,
        isAvailable: patch.isAvailable,
        dietaryTags: patch.dietaryTags,
        allergens: patch.allergens,
        displayOrder: patch.displayOrder,
      },
      client
    );
    if (!updated) throw new NotFoundError("Menu item not found.");

    // A full variants array replaces the previous set; omitted means "leave as is".
    if (patch.variants !== undefined) {
      await menuItemsRepo.deleteVariantsForItem(restaurantId, id, client);
      for (const [index, variant] of patch.variants.entries()) {
        await menuItemsRepo.addVariant(
          restaurantId,
          id,
          { ...variant, displayOrder: variant.displayOrder ?? index },
          client
        );
      }
    }
  });

  const item = await requireItem(restaurantId, id);
  changed(restaurantId, id, item.isAvailable);
  return item;
}

export async function deleteItem(restaurantId: string, id: string): Promise<void> {
  await requireItem(restaurantId, id);
  await menuItemsRepo.deleteItem(restaurantId, id);
  changed(restaurantId, id, false);
}

export async function setAvailability(
  restaurantId: string,
  id: string,
  isAvailable: boolean
): Promise<MenuItemAvailability> {
  const updated = await menuItemsRepo.setAvailability(restaurantId, id, isAvailable);
  if (!updated) throw new NotFoundError("Menu item not found.");
  changed(restaurantId, id, updated.isAvailable);
  return { id: updated.id, isAvailable: updated.isAvailable };
}

/* ------------------------------------------------------------------ */
/* Variants (FR-08)                                                   */
/* ------------------------------------------------------------------ */

export async function addVariant(
  restaurantId: string,
  itemId: string,
  input: VariantCreateInput
): Promise<ItemVariant> {
  await requireItem(restaurantId, itemId);
  const current = await menuItemsRepo.listVariants(restaurantId, itemId);
  if (current.length >= 10) {
    throw new AppError("VARIANT_LIMIT_REACHED", 409, "An item can have at most 10 variants.");
  }
  if (current.some((variant) => variant.name.toLowerCase() === input.name.toLowerCase())) {
    throw new ConflictError("Variant names must be unique within an item.");
  }
  const variant = await menuItemsRepo.addVariant(restaurantId, itemId, {
    ...input,
    displayOrder: input.displayOrder ?? current.length,
  });
  if (!variant) throw new NotFoundError("Menu item not found.");
  changed(restaurantId, itemId, true);
  return variant;
}

export async function updateVariant(
  restaurantId: string,
  variantId: string,
  patch: VariantUpdateInput
): Promise<ItemVariant> {
  const existing = await menuItemsRepo.getVariant(restaurantId, variantId);
  if (!existing) throw new NotFoundError("Variant not found.");

  if (patch.name) {
    const siblings = await menuItemsRepo.listVariants(restaurantId, existing.itemId);
    if (
      siblings.some(
        (variant) =>
          variant.id !== variantId &&
          variant.name.toLowerCase() === patch.name!.toLowerCase()
      )
    ) {
      throw new ConflictError("Variant names must be unique within an item.");
    }
  }

  const updated = await menuItemsRepo.updateVariantById(restaurantId, variantId, patch);
  if (!updated) throw new NotFoundError("Variant not found.");
  changed(restaurantId, existing.itemId, true);
  return updated;
}

export async function deleteVariant(restaurantId: string, variantId: string): Promise<void> {
  const existing = await menuItemsRepo.getVariant(restaurantId, variantId);
  if (!existing) throw new NotFoundError("Variant not found.");
  await menuItemsRepo.deleteVariantById(restaurantId, variantId);
  changed(restaurantId, existing.itemId, true);
}

/* ------------------------------------------------------------------ */
/* Images (FR-09)                                                     */
/* ------------------------------------------------------------------ */

export function uploadSignature(restaurantId: string): UploadSignature {
  return getMediaStorage().createSignature(restaurantId);
}

export async function addImage(
  restaurantId: string,
  itemId: string,
  input: ItemImageInput
): Promise<ItemImage> {
  await requireItem(restaurantId, itemId);
  if (!belongsToRestaurant(restaurantId, input.publicId)) {
    throw new ValidationError("One or more fields are invalid.", [
      { field: "publicId", issue: "The image does not belong to this restaurant." },
    ]);
  }
  const count = await menuItemsRepo.countImages(restaurantId, itemId);
  if (count >= 3) {
    throw new AppError("IMAGE_LIMIT_REACHED", 409, "An item can have at most 3 images.");
  }
  const image = await menuItemsRepo.addImage(restaurantId, itemId, {
    ...input,
    displayOrder: input.displayOrder ?? count,
  });
  if (!image) throw new NotFoundError("Menu item not found.");
  invalidate(restaurantId);
  return image;
}

export async function deleteImage(restaurantId: string, imageId: string): Promise<void> {
  const image = await menuItemsRepo.getImage(restaurantId, imageId);
  if (!image) throw new NotFoundError("Image not found.");
  await menuItemsRepo.deleteImageById(restaurantId, imageId);
  await deleteImageQuietly(image.publicId);
  invalidate(restaurantId);
}
