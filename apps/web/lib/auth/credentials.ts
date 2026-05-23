/**
 * Helpers for the `user_credentials` table. This is a separate concern from
 * the legacy `users.passwordHash` column: a row here means the user has
 * EXPLICITLY set (or rotated) a real password and so invite codes are no
 * longer a valid login path for them.
 *
 * Migration story: existing users keep working via `users.passwordHash` —
 * `verifyAndUpgrade` will lazy-migrate their hash into `user_credentials` on
 * the next successful login, so nobody has to "force-reset" anything.
 */

import { sql } from "drizzle-orm";
import { getDb, ensureSchema } from "../db/client";
import { hashPassword, verifyPassword } from "./password";

export interface StoredCredential {
  userId: string;
  passwordHash: string;
  passwordSetAt: string;
  passwordChangedAt: string | null;
}

export async function getCredential(
  userId: string,
): Promise<StoredCredential | null> {
  await ensureSchema();
  const db = getDb();
  const res = await db.run(
    sql`SELECT user_id, password_hash, password_set_at, password_changed_at
        FROM user_credentials
        WHERE user_id = ${userId}
        LIMIT 1`,
  );
  const row = res.rows?.[0] as unknown as
    | {
        user_id: string;
        password_hash: string;
        password_set_at: string;
        password_changed_at: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    passwordHash: row.password_hash,
    passwordSetAt: row.password_set_at,
    passwordChangedAt: row.password_changed_at,
  };
}

export async function hasCredential(userId: string): Promise<boolean> {
  return (await getCredential(userId)) !== null;
}

/**
 * Set or rotate a user's password. Upserts into `user_credentials` and also
 * mirrors the hash to the legacy `users.password_hash` so older code paths
 * keep working during transition.
 */
export async function setPassword(
  userId: string,
  plain: string,
): Promise<void> {
  await ensureSchema();
  const db = getDb();
  const hash = await hashPassword(plain);
  const existing = await getCredential(userId);

  if (existing) {
    await db.run(
      sql`UPDATE user_credentials
          SET password_hash = ${hash},
              password_changed_at = ${new Date().toISOString()}
          WHERE user_id = ${userId}`,
    );
  } else {
    await db.run(
      sql`INSERT INTO user_credentials (user_id, password_hash, password_set_at)
          VALUES (${userId}, ${hash}, ${new Date().toISOString()})`,
    );
  }

  // Mirror to legacy column so the existing `authenticate()` path still works
  // when called from places we haven't migrated yet.
  await db.run(
    sql`UPDATE users SET password_hash = ${hash} WHERE id = ${userId}`,
  );
}

/**
 * Verify a plaintext password. Tries the canonical `user_credentials` row
 * first; if no row exists yet (legacy user), falls back to
 * `users.passwordHash` and OPPORTUNISTICALLY upgrades by writing a fresh row
 * to `user_credentials`. After upgrade, invite codes can no longer log in as
 * that user.
 *
 * Returns `true` iff the password matched.
 */
export async function verifyAndUpgrade(
  userId: string,
  legacyHash: string | null,
  plain: string,
): Promise<boolean> {
  const cred = await getCredential(userId);
  if (cred) {
    return verifyPassword(plain, cred.passwordHash);
  }

  // Legacy path: verify against the users.passwordHash column, then upgrade.
  if (!legacyHash) return false;
  const ok = await verifyPassword(plain, legacyHash);
  if (!ok) return false;

  // Best-effort upgrade — don't fail the login if the upgrade write hits a
  // race condition.
  try {
    await ensureSchema();
    const db = getDb();
    await db.run(
      sql`INSERT INTO user_credentials (user_id, password_hash, password_set_at)
          VALUES (${userId}, ${legacyHash}, ${new Date().toISOString()})
          ON CONFLICT(user_id) DO NOTHING`,
    );
  } catch {
    // ignore — next successful login will retry
  }
  return true;
}

export async function clearCredential(userId: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.run(sql`DELETE FROM user_credentials WHERE user_id = ${userId}`);
}
