import { Pool } from "pg";

import { seedStore } from "@/lib/seed";
import { cloneStore, normalizeStore } from "@/lib/store-utils";
import { AppStore } from "@/lib/types";

const STORE_ID = "default";

declare global {
  var __learningOptimizerPgPool: Pool | undefined;
}

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the Postgres store");
  }

  if (!globalThis.__learningOptimizerPgPool) {
    globalThis.__learningOptimizerPgPool = new Pool({
      connectionString
    });
  }

  return globalThis.__learningOptimizerPgPool;
}

async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function loadStoreFromPostgres(): Promise<AppStore> {
  const pool = getPool();
  await ensureSchema(pool);

  const existing = await pool.query<{ payload: Partial<AppStore> }>(
    "SELECT payload FROM app_state WHERE id = $1",
    [STORE_ID]
  );

  if (!existing.rowCount) {
    const seeded = seedStore();
    await saveStoreToPostgres(seeded);
    return cloneStore(seeded);
  }

  return cloneStore(normalizeStore(existing.rows[0].payload));
}

export async function saveStoreToPostgres(store: AppStore): Promise<AppStore> {
  const pool = getPool();
  await ensureSchema(pool);

  const normalized = normalizeStore(store);

  await pool.query(
    `
      INSERT INTO app_state (id, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `,
    [STORE_ID, JSON.stringify(normalized)]
  );

  return cloneStore(normalized);
}
