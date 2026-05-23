/**
 * Auth-schema bootstrapping. Kept in its own module so the core
 * `lib/db/client.ts` stays generic — the auth subsystem owns its own tables.
 *
 * Wire from `db/client.ts#ensureSchema` after the rest of the schema is up:
 *
 *   import { ensureAuthSchema } from "../auth/ensure-schema";
 *   ...
 *   await ensureAuthSchema(db);
 *
 * Idempotent: every statement is CREATE IF NOT EXISTS, safe to call on every
 * boot.
 */

import type { drizzle } from "drizzle-orm/libsql";
import type * as schema from "../db/schema";

type LibsqlDb = ReturnType<typeof drizzle<typeof schema>>;

let _done = false;

export async function ensureAuthSchema(db: LibsqlDb): Promise<void> {
  if (_done) return;

  // user_credentials — one row per user that has explicitly set a password
  // after the invite-code bootstrap. Once a row exists for a user, invite
  // codes can no longer be used to log in *as that user*; invite codes
  // remain valid for onboarding fresh sites only.
  await db.run(`CREATE TABLE IF NOT EXISTS user_credentials (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    password_set_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    password_changed_at TEXT
  )`);

  // login_attempts — sliding-window rate-limit log. We GC older rows
  // opportunistically inside the rate-limit check (no separate cron needed).
  await db.run(`CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    ts INTEGER NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    attempted_email TEXT
  )`);
  await db.run(
    `CREATE INDEX IF NOT EXISTS login_attempts_ip_ts_idx ON login_attempts(ip, ts)`,
  );
  await db.run(
    `CREATE INDEX IF NOT EXISTS login_attempts_ts_idx ON login_attempts(ts)`,
  );

  _done = true;
}

/** Test/CLI hook so callers can force a re-run after a manual wipe. */
export function resetAuthSchemaCache(): void {
  _done = false;
}
