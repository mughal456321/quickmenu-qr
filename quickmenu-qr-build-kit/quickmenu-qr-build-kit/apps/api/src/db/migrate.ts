import { PoolClient } from "pg";
import { env } from "../config";
import { getPool } from "../db";
import { promises as fs, existsSync } from "fs";
import path from "path";

/**
 * Resolve the migrations directory for both dev (`tsx src/...`) and bundled
 * builds (`dist/`). The compiled bundle lives one level higher than the source,
 * so the relative depth differs; probe known locations and pick the first that
 * exists.
 */
function resolveMigrationsDir(): string {
  if (env.MIGRATIONS_DIR) return env.MIGRATIONS_DIR;
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "..", "db", "migrations"), // src/db (dev)
    path.resolve(__dirname, "..", "..", "..", "db", "migrations"), // dist (bundled)
    path.resolve(process.cwd(), "..", "..", "db", "migrations"), // cwd = apps/api
    path.resolve(process.cwd(), "db", "migrations"), // cwd = repo root
  ];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0];
}

const MIGRATIONS_DIR = resolveMigrationsDir();

export async function ensureSchemaMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function listMigrationFiles(): Promise<string[]> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files.filter((f) => f.endsWith(".sql")).sort();
}

export async function runMigrations(): Promise<string[]> {
  const client = await getPool().connect();
  try {
    await ensureSchemaMigrationsTable(client);
    const files = await listMigrationFiles();
    const applied: string[] = [];
    for (const file of files) {
      const { rows } = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file]
      );
      if (rows.length > 0) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    return applied;
  } finally {
    client.release();
  }
}

export async function resetDatabase(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // 1. Drop every table (cascades to triggers, indexes, constraints).
    const { rows: tables } = await client.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE 'pg_%'
    `);
    for (const row of tables) {
      await client.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
    }

    // 2. Drop the project's enum types so migrations can recreate them.
    const { rows: types } = await client.query<{ typname: string }>(`
      SELECT t.typname
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e'
    `);
    for (const row of types) {
      await client.query(`DROP TYPE IF EXISTS "${row.typname}" CASCADE`);
    }

    // 3. Drop project functions that are not owned by an extension.
    const { rows: functions } = await client.query<{ signature: string }>(`
      SELECT p.oid::regprocedure::text AS signature
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND NOT EXISTS (
           SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
         )
    `);
    for (const row of functions) {
      await client.query(`DROP FUNCTION IF EXISTS ${row.signature} CASCADE`);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  await runMigrations();
}