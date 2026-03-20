import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadLocalStoreSnapshot, resolveLocalStorePath, summarizeStore } from "@/lib/bootstrap-store";

test("resolveLocalStorePath prefers an explicit import file", () => {
  const cwd = "/tmp/learning-optimizer";
  const resolved = resolveLocalStorePath({
    cwd,
    fromFile: "./fixtures/store.json",
    dataDir: "./ignored"
  });

  assert.equal(resolved, path.join(cwd, "fixtures/store.json"));
});

test("resolveLocalStorePath defaults to LEARNING_OPTIMIZER_DATA_DIR/store.json", () => {
  const original = process.env.LEARNING_OPTIMIZER_DATA_DIR;
  process.env.LEARNING_OPTIMIZER_DATA_DIR = "/tmp/custom-learning-data";

  try {
    const resolved = resolveLocalStorePath({ cwd: "/tmp/unused" });
    assert.equal(resolved, "/tmp/custom-learning-data/store.json");
  } finally {
    if (original) {
      process.env.LEARNING_OPTIMIZER_DATA_DIR = original;
    } else {
      delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    }
  }
});

test("loadLocalStoreSnapshot normalizes partial store snapshots", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-bootstrap-store-"));

  try {
    const storeFile = path.join(tempDir, "store.json");
    await writeFile(
      storeFile,
      JSON.stringify({
        modules: [
          {
            id: "mod_test",
            userId: "user_demo",
            title: "Test module",
            description: "Partial import payload.",
            createdAt: "2026-03-20T00:00:00.000Z"
          }
        ]
      }),
      "utf8"
    );

    const snapshot = await loadLocalStoreSnapshot({ fromFile: storeFile });
    assert.equal(snapshot.filePath, storeFile);
    assert.equal(snapshot.store.modules.some((moduleRecord) => moduleRecord.id === "mod_test"), true);
    assert.equal(snapshot.store.users.length > 0, true);

    const summary = summarizeStore(snapshot.store);
    assert.equal(summary.modules >= 1, true);
    assert.equal(summary.reminderSettings >= 1, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
