import { Pool, PoolClient } from "pg";
import { env } from "./config";

type PoolEntry = { pool: Pool; url: string };

let active: PoolEntry | null = null;

export function getPoolUrl(): string {
  return (process.env.DATABASE_URL as string) || env.DATABASE_URL;
}

export function getPool(): Pool {
  const url = getPoolUrl();
  if (active && active.url === url) return active.pool;
  if (active) {
    active.pool.end().catch(() => {});
  }
  active = {
    url,
    pool: new Pool({
      connectionString: url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }),
  };
  return active.pool;
}

/** Backwards-compatible export used by the server. */
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const p = getPool();
    const value = (p as unknown as Record<string, unknown>)[prop as string];
    return typeof value === "function" ? value.bind(p) : value;
  },
});

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await getPool().query("SELECT 1");
    return res.rowCount === 1;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (active) {
    await active.pool.end();
    active = null;
  }
}

// Re-exported so callers can import everything from "./db".
export { runMigrations, resetDatabase } from "./db/migrate";