import { loadLocalStoreSnapshot, summarizeStore } from "../src/lib/bootstrap-store";
import { bootstrapPostgresStore, closePostgresPool, saveStoreToPostgres } from "../src/lib/postgres-store";

interface ImportArgs {
  fromFile?: string;
  showHelp?: boolean;
}

function parseArgs(argv: string[]): ImportArgs {
  const args: ImportArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--from") {
      const next = argv[index + 1];

      if (!next) {
        throw new Error("--from requires a file path.");
      }

      args.fromFile = next;
      index += 1;
      continue;
    }

    if (current === "--help" || current === "-h") {
      args.showHelp = true;
      return args;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.showHelp) {
    console.log("Usage: npm run db:import-local -- [--from /path/to/store.json]");
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to import local data into Postgres.");
  }

  const { filePath, store } = await loadLocalStoreSnapshot({ fromFile: args.fromFile });

  await bootstrapPostgresStore();
  await saveStoreToPostgres(store);

  const counts = summarizeStore(store);
  console.log(`Imported local store from ${filePath} into normalized Postgres tables.`);
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to import local store: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });
