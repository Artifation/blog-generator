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

  // sessions — server-side session store. The cookie holds only the opaque
  // random `id`; the (user_id, site_id) binding lives here so sessions are
  // revocable and expire server-side. user_id is nullable for the dev demo
  // login. ON DELETE CASCADE removes a user's/site's sessions automatically.
  await db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at TEXT NOT NULL
  )`);
  await db.run(
    `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
  );
  await db.run(
    `CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at)`,
  );

  _done = true;
}

/** Test/CLI hook so callers can force a re-run after a manual wipe. */
export function resetAuthSchemaCache(): void {
  _done = false;
}
