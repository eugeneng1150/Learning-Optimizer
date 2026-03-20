import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { seedStore } from "@/lib/seed";
import { loadStoreFromPostgres, saveStoreToPostgres } from "@/lib/postgres-store";
import { cloneStore, normalizeStore } from "@/lib/store-utils";
import { AppStore } from "@/lib/types";

let inMemoryStore: AppStore | null = null;

function shouldUsePostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getDataPaths() {
  const baseDir = process.env.LEARNING_OPTIMIZER_DATA_DIR ?? path.join(process.cwd(), ".data");
  return {
    dataDir: baseDir,
    dataFile: path.join(baseDir, "store.json")
  };
}

async function ensureStoreFile(): Promise<void> {
  const { dataDir, dataFile } = getDataPaths();
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dataFile, "utf8");
  } catch {
    const initialStore = seedStore();
    await writeFile(dataFile, JSON.stringify(initialStore, null, 2), "utf8");
  }
}

export async function getStore(): Promise<AppStore> {
  if (shouldUsePostgres()) {
    return loadStoreFromPostgres();
  }

  if (inMemoryStore) {
    return cloneStore(inMemoryStore);
  }

  await ensureStoreFile();
  const { dataFile } = getDataPaths();
  const raw = await readFile(dataFile, "utf8");
  const parsed = normalizeStore(JSON.parse(raw) as Partial<AppStore>);
  inMemoryStore = parsed;
  return cloneStore(parsed);
}

export async function saveStore(store: AppStore): Promise<AppStore> {
  if (shouldUsePostgres()) {
    return saveStoreToPostgres(store);
  }

  inMemoryStore = cloneStore(store);
  await ensureStoreFile();
  const { dataFile } = getDataPaths();
  await writeFile(dataFile, JSON.stringify(inMemoryStore, null, 2), "utf8");
  return cloneStore(inMemoryStore);
}

export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function resetStoreCache(): void {
  inMemoryStore = null;
}
