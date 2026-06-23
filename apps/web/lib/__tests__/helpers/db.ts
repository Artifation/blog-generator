/**
 * Shared test helpers — throwaway SQLite DB per test-FILE + APP_ENCRYPTION_KEY
 * autosetup.
 *
 * Why per-file (not per-test): `apps/web/lib/db/client.ts` captures `DB_PATH`
 * from `process.env.DATABASE_FILE` at module-load time (top-level `const`),
 * so we can't redirect to a new file mid-process. Each test FILE runs in its
 * own Node process (node --test spawns workers), so we set DATABASE_FILE to a
 * unique tmp path the first time this helper loads and let all tests in that
 * file share it.
 *
 * Usage:
 *
 *   import { initTestDb, resetTestDb } from "../../__tests__/helpers/db";
 *
 *   before(async () => { await initTestDb(); });
 *   beforeEach(async () => { await resetTestDb(); });
 *
 *   test("my smoke test", async () => {
 *     const db = getDb();
 *     // ... schema is in place, tables empty.
 *   });
 *
 * Cleanup: when the process exits Node will remove the tmpdir for us
 * (best-effort `process.on("exit")`).
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { _resetKeyCache } from "../../security/crypto";

let _tmpDir: string | null = null;
let _initialized = false;

/**
 * Set APP_ENCRYPTION_KEY to a random 32-byte key if not already set, and
 * point DATABASE_FILE at a fresh tmp path. Must be called BEFORE any import
 * of `~/lib/db/client` is awaited.
 */
export function bootstrapTestEnv(): void {
  if (_initialized) return;
  _initialized = true;
  if (!process.env.APP_ENCRYPTION_KEY) {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  }
  _resetKeyCache();
  _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-tool-test-"));
  process.env.DATABASE_FILE = path.join(_tmpDir, "test.db");
  // Best-effort cleanup on process exit.
  process.on("exit", () => {
    try {
      fs.rmSync(_tmpDir!, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
}

// Eagerly bootstrap on first import of this module so tests can simply do
// `import { initTestDb } from "..."` without remembering to call a setup.
bootstrapTestEnv();

/**
 * Call `ensureSchema()` once for this test file. Idempotent — re-callable.
 */
export async function initTestDb(): Promise<void> {
  const { ensureSchema } = await import("../../db/client");
  await ensureSchema();
}

/**
 * Truncate every domain table so the next test starts with empty rows.
 * Schema-only — does not drop columns/tables.
 */
export async function resetTestDb(): Promise<void> {
  const { getDb, ensureSchema } = await import("../../db/client");
  await ensureSchema();
  const db = getDb();
  // Order matters for FK cascades, but with SQLite we can just DELETE in any
  // order as long as ON DELETE CASCADE handles children.
  await db.run(`DELETE FROM sessions`);
  await db.run(`DELETE FROM post_refreshes`);
  await db.run(`DELETE FROM runs`);
  await db.run(`DELETE FROM published_posts`);
  await db.run(`DELETE FROM drafts`);
  await db.run(`DELETE FROM topics`);
  await db.run(`DELETE FROM pillars`);
  await db.run(`DELETE FROM users`);
  await db.run(`DELETE FROM sites`);
  await db.run(`DELETE FROM settings`);
}

/**
 * Hard-reset: close the DB singleton, delete the file, re-init schema.
 * Used by tests that want to verify ensureSchema() is idempotent.
 */
export async function hardResetTestDb(): Promise<void> {
  const { closeDb } = await import("../../db/client");
  closeDb();
  try {
    fs.rmSync(process.env.DATABASE_FILE!, { force: true });
  } catch {
    /* ignore */
  }
}
