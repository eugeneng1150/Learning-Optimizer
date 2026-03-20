import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { GET, POST } from "@/app/api/reminders/route";
import { resetStoreCache } from "@/lib/store";

test("reminder settings persist through GET and POST", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-reminders-"));
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  resetStoreCache();

  try {
    const initial = await GET();
    const initialBody = (await initial.json()) as {
      settings: { emailEnabled: boolean; inAppEnabled: boolean; dailyHour: number };
    };

    assert.equal(initialBody.settings.emailEnabled, true);
    assert.equal(initialBody.settings.inAppEnabled, true);

    const updated = await POST(
      new Request("http://localhost/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: false,
          inAppEnabled: true,
          dailyHour: 7
        })
      })
    );

    assert.equal(updated.status, 200);

    const saved = (await updated.json()) as {
      settings: { emailEnabled: boolean; inAppEnabled: boolean; dailyHour: number };
      cadenceText: string;
    };

    assert.equal(saved.settings.emailEnabled, false);
    assert.equal(saved.settings.inAppEnabled, true);
    assert.equal(saved.settings.dailyHour, 7);
    assert.match(saved.cadenceText, /7:00 AM/);

    const reread = await GET();
    const rereadBody = (await reread.json()) as typeof saved;
    assert.equal(rereadBody.settings.emailEnabled, false);
    assert.equal(rereadBody.settings.dailyHour, 7);
  } finally {
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});
