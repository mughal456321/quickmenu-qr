/*
 * Local PostgreSQL without Docker.
 *
 * Docker Desktop reserves several gigabytes of RAM; on a small laptop it can be
 * killed while the dev servers are running, taking the database with it. This
 * script starts the same PostgreSQL version that Compose uses, straight from
 * node_modules, in a data directory that persists between runs.
 *
 *   npm run db:local
 *
 * Then, in other terminals: npm run db:migrate, npm run db:seed, npm run dev.
 * Docker Compose remains the default documented path; this is the fallback.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.LOCAL_PG_PORT ?? 5432);
const USER = "quickmenu";
const PASSWORD = "quickmenu";
const DATABASES = ["quickmenu", "quickmenu_test"];
const DATABASE_DIR = path.resolve(".pgdata");

const postgres = new EmbeddedPostgres({
  databaseDir: DATABASE_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  autoRehydrateSymlinks: true,
  // Windows defaults a new cluster to the system code page (WIN1252), which
  // cannot store the Arabic/Urdu menu text. Match the Compose image instead.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

if (!existsSync(path.join(DATABASE_DIR, "PG_VERSION"))) {
  console.log(`db:local initialising cluster in ${DATABASE_DIR}`);
  await postgres.initialise();
}

await postgres.start();

const client = postgres.getPgClient();
await client.connect();
const { rows } = await client.query("select datname from pg_database");
await client.end();

for (const name of DATABASES) {
  if (rows.some((row) => row.datname === name)) continue;
  await postgres.createDatabase(name);
  console.log(`db:local created database ${name}`);
}

console.log(
  `db:local ready on postgres://${USER}:${PASSWORD}@localhost:${PORT}/quickmenu (Ctrl+C to stop)`,
);

async function shutdown(signal) {
  console.log(`\ndb:local stopping (${signal})`);
  await postgres.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
