import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { normalizeStore } from "@/lib/store-utils";
import { AppStore } from "@/lib/types";

export interface LocalStoreSnapshot {
  filePath: string;
  store: AppStore;
}

export interface ResolveLocalStorePathOptions {
  cwd?: string;
  dataDir?: string;
  fromFile?: string;
}

export function resolveLocalStorePath(options: ResolveLocalStorePathOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();

  if (options.fromFile) {
    return path.resolve(cwd, options.fromFile);
  }

  const baseDir = options.dataDir ?? process.env.LEARNING_OPTIMIZER_DATA_DIR ?? path.join(cwd, ".data");
  return path.resolve(cwd, baseDir, "store.json");
}

export async function loadLocalStoreSnapshot(
  options: ResolveLocalStorePathOptions = {}
): Promise<LocalStoreSnapshot> {
  const filePath = resolveLocalStorePath(options);

  try {
    await access(filePath);
  } catch {
    throw new Error(
      `Local store file not found at ${filePath}. Run the app once in local mode first or pass --from /absolute/path/to/store.json.`
    );
  }

  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<AppStore>;

  return {
    filePath,
    store: normalizeStore(parsed)
  };
}

export function summarizeStore(store: AppStore): Record<keyof AppStore, number> {
  return {
    users: store.users.length,
    modules: store.modules.length,
    sources: store.sources.length,
    chunks: store.chunks.length,
    concepts: store.concepts.length,
    edges: store.edges.length,
    reviewStates: store.reviewStates.length,
    conceptFamiliarities: store.conceptFamiliarities.length,
    quizItems: store.quizItems.length,
    quizAttempts: store.quizAttempts.length,
    reminders: store.reminders.length,
    reminderSettings: store.reminderSettings.length
  };
}
