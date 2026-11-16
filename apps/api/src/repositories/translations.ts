import type { Translation, TranslationEntity, TranslationField } from "@quickmenu/shared";
import { db, type Queryable } from "./base";

type TranslationRow = {
  id: string;
  restaurant_id: string;
  entity_type: TranslationEntity;
  entity_id: string;
  field: TranslationField;
  language: string;
  source_hash: string;
  translated_text: string;
};

const COLUMNS =
  "id, restaurant_id, entity_type, entity_id, field, language, source_hash, translated_text";

export function mapTranslation(row: TranslationRow): Translation {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    field: row.field,
    language: row.language,
    sourceHash: row.source_hash,
    translatedText: row.translated_text,
  };
}

export interface TranslationKey {
  entityType: TranslationEntity;
  entityId: string;
  field: TranslationField;
  language: string;
  sourceHash: string;
}

/**
 * Q5: cached translation lookup. Returns null on a miss or when the cached text
 * is stale (source_hash differs). Uses `ux_translations_key`.
 */
export async function lookup(
  key: TranslationKey,
  client?: Queryable
): Promise<string | null> {
  const { rows } = await db(client).query<{ translated_text: string }>(
    `SELECT translated_text
       FROM translations
      WHERE entity_type = $1 AND entity_id = $2 AND field = $3
        AND language = $4 AND source_hash = $5`,
    [key.entityType, key.entityId, key.field, key.language, key.sourceHash]
  );
  return rows[0]?.translated_text ?? null;
}

export interface UpsertTranslationInput extends TranslationKey {
  restaurantId: string;
  translatedText: string;
}

export async function upsert(
  input: UpsertTranslationInput,
  client?: Queryable
): Promise<Translation> {
  const { rows } = await db(client).query<TranslationRow>(
    `INSERT INTO translations
       (restaurant_id, entity_type, entity_id, field, language, source_hash, translated_text)
     VALUES ($1, $2::translation_entity, $3, $4::translation_field, $5, $6, $7)
     ON CONFLICT (entity_type, entity_id, field, language)
     DO UPDATE SET source_hash = EXCLUDED.source_hash,
                   translated_text = EXCLUDED.translated_text
     RETURNING ${COLUMNS}`,
    [
      input.restaurantId,
      input.entityType,
      input.entityId,
      input.field,
      input.language,
      input.sourceHash,
      input.translatedText,
    ]
  );
  return mapTranslation(rows[0]!);
}

export async function listByEntity(
  restaurantId: string,
  entityType: TranslationEntity,
  entityId: string,
  client?: Queryable
): Promise<Translation[]> {
  const { rows } = await db(client).query<TranslationRow>(
    `SELECT ${COLUMNS}
       FROM translations
      WHERE restaurant_id = $1 AND entity_type = $2 AND entity_id = $3
      ORDER BY field, language`,
    [restaurantId, entityType, entityId]
  );
  return rows.map(mapTranslation);
}

export async function deleteByEntity(
  restaurantId: string,
  entityType: TranslationEntity,
  entityId: string,
  client?: Queryable
): Promise<number> {
  const { rowCount } = await db(client).query(
    `DELETE FROM translations
      WHERE restaurant_id = $1 AND entity_type = $2 AND entity_id = $3`,
    [restaurantId, entityType, entityId]
  );
  return rowCount ?? 0;
}

export async function purgeByRestaurant(
  restaurantId: string,
  client?: Queryable
): Promise<number> {
  const { rowCount } = await db(client).query(
    "DELETE FROM translations WHERE restaurant_id = $1",
    [restaurantId]
  );
  return rowCount ?? 0;
}

/** Stable in-memory key for a cache hit. */
export function translationCacheKey(key: TranslationKey): string {
  return [key.entityType, key.entityId, key.field, key.language, key.sourceHash].join("|");
}

/** Q5 at menu scale: one query for every cached string on the page. */
export async function lookupMany(
  keys: TranslationKey[],
  client?: Queryable
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (keys.length === 0) return result;

  const { rows } = await db(client).query<{
    entity_type: TranslationEntity;
    entity_id: string;
    field: TranslationField;
    language: string;
    source_hash: string;
    translated_text: string;
  }>(
    `SELECT t.entity_type, t.entity_id, t.field, t.language, t.source_hash, t.translated_text
       FROM translations t
       JOIN unnest(
              $1::translation_entity[],
              $2::uuid[],
              $3::translation_field[],
              $4::text[],
              $5::text[]
            ) AS k(entity_type, entity_id, field, language, source_hash)
         ON t.entity_type = k.entity_type
        AND t.entity_id = k.entity_id
        AND t.field = k.field
        AND t.language = k.language
        AND t.source_hash = k.source_hash`,
    [
      keys.map((key) => key.entityType),
      keys.map((key) => key.entityId),
      keys.map((key) => key.field),
      keys.map((key) => key.language),
      keys.map((key) => key.sourceHash),
    ]
  );

  for (const row of rows) {
    result.set(
      translationCacheKey({
        entityType: row.entity_type,
        entityId: row.entity_id,
        field: row.field,
        language: row.language,
        sourceHash: row.source_hash,
      }),
      row.translated_text
    );
  }
  return result;
}

/** Upsert all provider results in one statement. */
export async function upsertMany(
  inputs: UpsertTranslationInput[],
  client?: Queryable
): Promise<void> {
  if (inputs.length === 0) return;
  await db(client).query(
    `INSERT INTO translations
       (restaurant_id, entity_type, entity_id, field, language, source_hash, translated_text)
     SELECT * FROM unnest(
       $1::uuid[],
       $2::translation_entity[],
       $3::uuid[],
       $4::translation_field[],
       $5::text[],
       $6::text[],
       $7::text[]
     )
     ON CONFLICT (entity_type, entity_id, field, language)
     DO UPDATE SET source_hash = EXCLUDED.source_hash,
                   translated_text = EXCLUDED.translated_text`,
    [
      inputs.map((input) => input.restaurantId),
      inputs.map((input) => input.entityType),
      inputs.map((input) => input.entityId),
      inputs.map((input) => input.field),
      inputs.map((input) => input.language),
      inputs.map((input) => input.sourceHash),
      inputs.map((input) => input.translatedText),
    ]
  );
}
