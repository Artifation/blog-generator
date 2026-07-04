/**
 * Server-side session store. Replaces the previous "the cookie value IS the
 * site/user id" scheme (which was an unsigned, forgeable, non-revocable bearer
 * credential) with opaque random tokens backed by a `sessions` DB row.
 *
 * The cookie carries only the random token; the (userId, siteId) binding,
 * expiry and revocation all live server-side, so:
 *   - forging a cookie is infeasible (256-bit random token, not an enumerable id)
 *   - sessions expire server-side and can be revoked (logout, user removal,
 *     password change) — a copied cookie stops working once revoked.
 */

import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { getDb, ensureSchema } from "../db/client";
import { sessions, type Session } from "../db/schema";

/** Sliding session lifetime — refreshed (at most once/day) on activity. */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
/** Only slide the DB expiry when it has dropped more than this below the max. */
const REFRESH_AFTER_MS = 1000 * 60 * 60 * 24; // 1 day

/** A 256-bit URL-safe opaque token. Not an id — never derived from one. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(siteId: string, userId?: string): Promise<string> {
  await ensureSchema();
  const db = getDb();
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.insert(sessions).values({
    id: token,
    siteId,
    userId: userId ?? null,
    expiresAt,
  });
  return token;
}

/**
 * Look up a live session by token. Returns null (and deletes the row) when the
 * token is unknown or expired, so a stale/forged cookie never authenticates.
 */
export async function getSession(token: string): Promise<Session | null> {
  if (!token) return null;
  await ensureSchema();
  const db = getDb();
  const rows = await db.select().from(sessions).where(eq(sessions.id, token)).limit(1);
  const s = rows[0];
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() <= Date.now()) {
    try {
      await db.delete(sessions).where(eq(sessions.id, token));
    } catch {
      /* best-effort GC */
    }
    return null;
  }
  return s;
}

/**
 * Slide the session's server-side expiry forward, but only when it has aged
 * more than a day — so a request burst doesn't hammer the DB with writes.
 * Returns true when a write happened (caller can then also refresh the cookie).
 */
export async function refreshSessionIfStale(session: Session): Promise<boolean> {
  const remaining = new Date(session.expiresAt).getTime() - Date.now();
  if (remaining > SESSION_TTL_MS - REFRESH_AFTER_MS) return false;
  await ensureSchema();
  const db = getDb();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, session.id));
  return true;
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  await ensureSchema();
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, token));
}

/** Revoke every session for a user (logout-everywhere / on user removal). */
export async function deleteSessionsForUser(userId: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Opportunistic GC of expired rows. Cheap; safe to call from hot paths. */
export async function gcExpiredSessions(): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString()));
}
