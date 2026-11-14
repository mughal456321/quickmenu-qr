import type {
  MenuCategory,
  TranslationEntity,
  TranslationField,
} from "@quickmenu/shared";
import { hashToken } from "../lib/tokens";
import { getTranslationProvider } from "../lib/translation";
import { logger } from "../logger";
import * as translationsRepo from "../repositories/translations";

export interface TranslateMenuResult {
  categories: MenuCategory[];
  warnings: string[];
}

interface TranslatableText {
  entityType: TranslationEntity;
  entityId: string;
  field: TranslationField;
  text: string;
}

function collectTexts(categories: MenuCategory[]): TranslatableText[] {
  const texts: TranslatableText[] = [];
  for (const category of categories) {
    if (category.name) {
      texts.push({
        entityType: "category",
        entityId: category.id,
        field: "name",
        text: category.name,
      });
    }
    for (const item of category.items) {
      texts.push({ entityType: "item", entityId: item.id, field: "name", text: item.name });
      if (item.description) {
        texts.push({
          entityType: "item",
          entityId: item.id,
          field: "description",
          text: item.description,
        });
      }
      for (const variant of item.variants) {
        texts.push({
          entityType: "variant",
          entityId: variant.id,
          field: "name",
          text: variant.name,
        });
      }
    }
  }
  return texts.filter((entry) => entry.text.trim().length > 0);
}

function clone(categories: MenuCategory[]): MenuCategory[] {
  return categories.map((category) => ({
    ...category,
    items: category.items.map((item) => ({
      ...item,
      variants: item.variants.map((variant) => ({ ...variant })),
      images: item.images.map((image) => ({ ...image })),
    })),
  }));
}

/**
 * Translate a menu page using the `translations` cache first (Q5).
 *
 * Only cache misses reach the provider, and they are sent as one batch. If the
 * provider fails or times out, the original text is returned and the caller
 * exposes `warnings: ["TRANSLATION_UNAVAILABLE"]`; the menu never blocks.
 */
export async function translateMenu(
  restaurantId: string,
  sourceLanguage: string,
  targetLanguage: string,
  categories: MenuCategory[]
): Promise<TranslateMenuResult> {
  if (targetLanguage === sourceLanguage) {
    return { categories, warnings: [] };
  }

  const entries = collectTexts(categories);
  if (entries.length === 0) return { categories, warnings: [] };

  const keys = entries.map((entry) => ({
    entityType: entry.entityType,
    entityId: entry.entityId,
    field: entry.field,
    language: targetLanguage,
    sourceHash: hashToken(entry.text),
  }));

  const cached = await translationsRepo.lookupMany(keys);
  const translations = new Map(cached);

  // Deduplicate identical source strings across entities.
  const missingByText = new Map<string, { sourceHash: string }>();
  entries.forEach((entry, index) => {
    const key = translationsRepo.translationCacheKey(keys[index]!);
    if (!translations.has(key) && !missingByText.has(entry.text)) {
      missingByText.set(entry.text, { sourceHash: keys[index]!.sourceHash });
    }
  });

  const warnings: string[] = [];
  if (missingByText.size > 0) {
    const uniqueTexts = [...missingByText.keys()];
    try {
      const translated = await getTranslationProvider().translate(
        uniqueTexts,
        sourceLanguage,
        targetLanguage
      );
      if (translated.length !== uniqueTexts.length) {
        throw new Error("translation provider returned a different number of strings");
      }

      const byText = new Map(uniqueTexts.map((text, index) => [text, translated[index]!]));
      const upserts = entries
        .map((entry, index) => {
          if (translations.has(translationsRepo.translationCacheKey(keys[index]!))) return null;
          const text = byText.get(entry.text);
          if (text === undefined) return null;
          return {
            restaurantId,
            entityType: entry.entityType,
            entityId: entry.entityId,
            field: entry.field,
            language: targetLanguage,
            sourceHash: keys[index]!.sourceHash,
            translatedText: text,
          };
        })
        .filter((value): value is NonNullable<typeof value> => value !== null);

      await translationsRepo.upsertMany(upserts);
      for (const upsert of upserts) {
        translations.set(translationsRepo.translationCacheKey(upsert), upsert.translatedText);
      }
    } catch (error) {
      logger.warn({ err: error, language: targetLanguage }, "translation unavailable");
      warnings.push("TRANSLATION_UNAVAILABLE");
    }
  }

  if (warnings.length > 0) {
    return { categories, warnings };
  }

  const translatedMenu = clone(categories);
  let index = 0;
  const lookup = (entry: TranslatableText): string => {
    const key = translationsRepo.translationCacheKey(keys[index++]!);
    return translations.get(key) ?? entry.text;
  };

  // Walk in exactly the same order as collectTexts().
  for (const category of translatedMenu) {
    category.name = lookup({
      entityType: "category",
      entityId: category.id,
      field: "name",
      text: category.name,
    });
    for (const item of category.items) {
      item.name = lookup({ entityType: "item", entityId: item.id, field: "name", text: item.name });
      if (item.description) {
        item.description = lookup({
          entityType: "item",
          entityId: item.id,
          field: "description",
          text: item.description,
        });
      }
      for (const variant of item.variants) {
        variant.name = lookup({
          entityType: "variant",
          entityId: variant.id,
          field: "name",
          text: variant.name,
        });
      }
    }
  }

  return { categories: translatedMenu, warnings };
}
