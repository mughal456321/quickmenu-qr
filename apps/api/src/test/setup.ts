import { beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { closePool } from "../db";

const DEFAULT_DATABASE_URL =
  (process.env.DATABASE_URL as string) || "postgres://quickmenu:quickmenu@localhost:5432/quickmenu";
const TEST_DATABASE_URL =
  (process.env.TEST_DATABASE_URL as string) ||
  DEFAULT_DATABASE_URL.replace(/\/[^/]+$/, "/quickmenu_test");

// Set the env var at module top-level: vitest runs setupFiles before any test
// file imports config, so the lazy config parser sees the test database URL.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;

export const testPool = new Pool({
  connectionString: TEST_DATABASE_URL,
  max: 5,
});

async function ensureTestDatabase(): Promise<void> {
  const adminUrl = DEFAULT_DATABASE_URL.replace(/\/[^/]+$/, "/postgres");
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    const db = TEST_DATABASE_URL.split("/").pop()!;
    // FORCE terminates other sessions (e.g. a pool left open by a previous
    // test file in the same fork) so the database can be recreated cleanly.
    await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${db}"`);
  } finally {
    await admin.end();
  }
}

beforeAll(async () => {
  await ensureTestDatabase();
  const { runMigrations } = await import("../db/migrate");
  await runMigrations();
});

afterAll(async () => {
  // Release the application pool so the next test file can recreate the test
  // database without force-terminating this file's idle connections.
  await closePool();
  await testPool.end();
});