import { bootstrapPostgresStore, closePostgresPool } from "../src/lib/postgres-store";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to bootstrap Postgres.");
  }

  await bootstrapPostgresStore();
  console.log("Bootstrapped normalized Postgres schema from db/postgres.sql.");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to bootstrap Postgres store: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });
