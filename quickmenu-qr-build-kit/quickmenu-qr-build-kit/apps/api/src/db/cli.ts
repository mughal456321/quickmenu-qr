import { runMigrations, resetDatabase } from "./migrate";
import { closePool } from "../db";

async function main(): Promise<void> {
  const cmd = process.argv[2];
  try {
    if (cmd === "migrate") {
      const applied = await runMigrations();
      console.info(`migrations applied: ${applied.length}`);
    } else if (cmd === "reset") {
      await resetDatabase();
      console.info("database reset and migrated");
    } else {
      console.error("unknown db command");
      process.exit(1);
    }
  } finally {
    await closePool();
  }
}

main();