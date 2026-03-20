import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { seedStore } from "@/lib/seed";
import { AppStore } from "@/lib/types";

let inMemoryStore: AppStore | null = null;

const cloneStore = (store: AppStore): AppStore =>
  JSON.parse(JSON.stringify(store)) as AppStore;

function normalizeStore(store: Partial<AppStore>): AppStore {
  const seeded = seedStore();

  return {
    users: store.users ?? seeded.users,
    modules: store.modules ?? seeded.modules,
    sources: store.sources ?? seeded.sources,
    chunks: store.chunks ?? seeded.chunks,
    concepts: store.concepts ?? seeded.concepts,
    edges: store.edges ?? seeded.edges,
    reviewStates: store.reviewStates ?? seeded.reviewStates,
    quizItems: store.quizItems ?? seeded.quizItems,
    quizAttempts: store.quizAttempts ?? seeded.quizAttempts,
    reminders: store.reminders ?? seeded.reminders,
    reminderSettings: store.reminderSettings ?? seeded.reminderSettings
  };
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
