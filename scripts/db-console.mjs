/*
 * Run SQL against the local database and print the result as a table.
 *
 *   npm run db:console -- "select * from restaurant_tables order by table_number"
 *   npm run db:console -- "select order_number, status, total from orders limit 5"
 *
 * Without SQL it prints the table names and a few example queries.
 * Read-only intent, but any statement the connection is allowed to run works;
 * prefer SELECT while the app is running.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));
const { Client } = require("pg");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_URL = "postgres://quickmenu:quickmenu@localhost:5432/quickmenu";

function loadEnv() {
  for (const file of [path.join(ROOT, "apps/api/.env"), path.join(ROOT, "apps/api/.env.local"), path.join(ROOT, ".env")]) {
    let contents;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const raw of contents.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

function cell(value) {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function printRows(rows) {
  if (rows.length === 0) {
    console.log("(0 rows)");
    return;
  }
  const columns = Object.keys(rows[0]);
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => cell(row[column]).length))
  );
  const line = widths.map((width) => "-".repeat(width)).join("-+-");
  console.log(columns.map((column, index) => column.padEnd(widths[index])).join(" | "));
  console.log(line);
  for (const row of rows) {
    console.log(columns.map((column, index) => cell(row[column]).padEnd(widths[index])).join(" | "));
  }
  console.log(`(${rows.length} row${rows.length === 1 ? "" : "s"})`);
}

loadEnv();

const sql = process.argv.slice(2).join(" ").trim();
const client = new Client({ connectionString: process.env.DATABASE_URL || DEFAULT_URL });

try {
  await client.connect();
} catch (error) {
  console.error(`db:console cannot connect: ${error.message}`);
  console.error("Is the database running? Start `npm run db:local` in another terminal.");
  process.exit(1);
}

if (!sql) {
  const tables = await client.query(
    `select table_name
       from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`
  );
  console.log("Tables:");
  for (const row of tables.rows) console.log(`  ${row.table_name}`);
  console.log('\nExample: npm run db:console -- "select * from menu_items limit 5"');
  await client.end();
  process.exit(0);
}

try {
  const result = await client.query(sql);
  const sets = Array.isArray(result) ? result : [result];
  for (const set of sets) {
    if (!set.rows || set.rows.length === 0) {
      console.log(`OK (${set.rowCount ?? 0} rows affected)`);
      continue;
    }
    printRows(set.rows);
  }
} catch (error) {
  console.error(`SQL error: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
