import type { Pool, PoolClient } from "pg";
import { getPool } from "../db";

/** Anything that can run a parameterized query: the pool or a transaction client. */
export type Queryable = Pool | PoolClient;

/** Use the caller's transaction client when given, otherwise the shared pool. */
export function db(client?: Queryable): Queryable {
  return client ?? getPool();
}

/** Convert a pg timestamp (Date) or string to an ISO 8601 string. */
export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Convert a nullable pg timestamp to an ISO 8601 string or null. */
export function toIsoOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

/** numeric() columns arrive as strings from pg; expose them as numbers. */
export function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}
