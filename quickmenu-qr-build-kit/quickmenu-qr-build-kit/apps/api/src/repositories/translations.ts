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
