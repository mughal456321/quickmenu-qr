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
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const PORT = Number(process.env.LOCAL_PG_PORT ?? 5432);
const USER = "quickmenu";
const PASSWORD = "quickmenu";
const DATABASES = ["quickmenu", "quickmenu_test"];
const DATABASE_DIR = path.resolve(".pgdata");
const PG_CTL = path.join(
  "node_modules",
  "@embedded-postgres",
  "windows-x64",
  "native",
  "bin",
  "pg_ctl.exe",
);

/** True when something already accepts TCP connections on the port. */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** True when the port answers with this project's database and credentials. */
async function databaseAnswers() {
  const client = new Client({
    connectionString: `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/quickmenu`,
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  // A second `db:local` used to crash with a raw postmaster.pid error because
  // the first instance already owns the port. Say what is happening instead,
  // and check whether the listener is really this project's database.
  if (await portInUse(PORT)) {
    if (await databaseAnswers()) {
      console.log(`db:local: this project's PostgreSQL is already running on 127.0.0.1:${PORT}.`);
      console.log("Use it as is - do not start a second one.");
      console.log("To stop it, press Ctrl+C in the terminal that started it.");
    } else {
      console.log(`db:local: port ${PORT} is used by something that is not this project's database.`);
      console.log("Stop that program, or start on another port:");
      console.log("  $env:LOCAL_PG_PORT=5433; npm run db:local");
      console.log("If a previous run of this script left a lock behind, clear it with:");
      console.log(`  ${PG_CTL} -D .pgdata stop -m fast`);
    }
    return;
  }

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

  try {
    if (!existsSync(path.join(DATABASE_DIR, "PG_VERSION"))) {
      console.log(`db:local initialising cluster in ${DATABASE_DIR}`);
      await postgres.initialise();
    }

    await postgres.start();
  } catch (error) {
    console.error(`db:local could not start PostgreSQL: ${error?.message ?? error}`);
    console.error("If a previous run left a lock behind, stop it and retry:");
    console.error(`  ${PG_CTL} -D .pgdata stop -m fast`);
    process.exitCode = 1;
    return;
  }

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
}

await main();
