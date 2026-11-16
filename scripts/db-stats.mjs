/*
 * Show what is stored in the local database.
 *
 *   npm run db:stats
 *
 * Prints every table in the public schema with its row count, then the five
 * most recent orders. Connects with DATABASE_URL from the environment, then
 * apps/api/.env, then the local `db:local` default.
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

function pad(value, width, alignRight = false) {
  const text = value === null || value === undefined ? "-" : String(value);
  return alignRight ? text.padStart(width) : text.padEnd(width);
}

loadEnv();

const client = new Client({ connectionString: process.env.DATABASE_URL || DEFAULT_URL });

try {
  await client.connect();
} catch (error) {
  console.error(`db:stats cannot connect: ${error.message}`);
  console.error("Is the database running? Start `npm run db:local` in another terminal.");
  process.exit(1);
}

const meta = await client.query(
  "select current_database() as database, current_setting('server_version') as version"
);
console.log(`database: ${meta.rows[0].database} (PostgreSQL ${meta.rows[0].version})\n`);

const tables = await client.query(
  `select table_name
     from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name`
);

let total = 0;
console.log(`${pad("table", 28)} ${pad("rows", 8, true)}`);
console.log(`${"-".repeat(28)} ${"-".repeat(8)}`);
for (const { table_name: table } of tables.rows) {
  const { rows } = await client.query(`select count(*)::int as n from "${table}"`);
  total += rows[0].n;
  console.log(`${pad(table, 28)} ${pad(rows[0].n, 8, true)}`);
}
console.log(`${"-".repeat(28)} ${"-".repeat(8)}`);
console.log(`${pad(`${tables.rowCount} tables`, 28)} ${pad(total, 8, true)}`);

if (tables.rows.some((row) => row.table_name === "orders")) {
  const orders = await client.query(
    `select o.order_number, o.status, o.total, r.name as restaurant, o.created_at
       from orders o
       join restaurants r on r.id = o.restaurant_id
      order by o.created_at desc
      limit 5`
  );
  if (orders.rows.length > 0) {
    console.log("\nlatest orders:");
    for (const row of orders.rows) {
      console.log(
        `  #${row.order_number}  ${pad(row.status, 10)}  ${pad(row.total, 8, true)}  ${row.restaurant}  ${row.created_at.toISOString()}`
      );
    }
  }
}

await client.end();
