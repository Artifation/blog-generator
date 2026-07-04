/**
 * Tests for the server-side session store — the core of the auth-hardening
 * fix that replaced forgeable id-bearing cookies with opaque, revocable,
 * server-side session tokens.
 *
 * Uses a throwaway SQLite DB; no network, no shared state with other suites.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Side-effect: bootstrap APP_ENCRYPTION_KEY + DATABASE_FILE before any
// db/client import.
import { initTestDb, resetTestDb } from "../../__tests__/helpers/db";

import {
  createSession,
  getSession,
  deleteSession,
  deleteSessionsForUser,
  refreshSessionIfStale,
} from "../session";
import { getDb } from "../../db/client";
import { sql } from "drizzle-orm";

/** Seed the minimal site + user rows the session FKs reference. */
async function seed(): Promise<void> {
  const db = getDb();
  for (const id of ["site_abc", "site_demo", "site_x"]) {
    await db.run(sql`INSERT INTO sites (id, slug, name, domain) VALUES (${id}, ${id}, ${id}, ${id + ".test"})`);
  }
  const usersToSeed: Array<[string, string]> = [
    ["usr_abc", "site_abc"],
    ["usr_x", "site_x"],
    ["usr_1", "site_x"],
    ["usr_2", "site_x"],
  ];
  for (const [id, siteId] of usersToSeed) {
    await db.run(
      sql`INSERT INTO users (id, site_id, email, password_hash) VALUES (${id}, ${siteId}, ${id + "@test.nl"}, ${"x"})`,
    );
  }
}

before(async () => {
  await initTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  await seed();
});

test("createSession issues an opaque high-entropy token bound to (site,user)", async () => {
  const token = await createSession("site_abc", "usr_abc");
  // 256-bit token, base64url ≈ 43 chars. Crucially NOT an enumerable id.
  assert.ok(token.length >= 40, "token should be long/random");
  assert.notEqual(token, "site_abc");
  assert.notEqual(token, "usr_abc");
  const s = await getSession(token);
  assert.ok(s);
  assert.equal(s!.siteId, "site_abc");
  assert.equal(s!.userId, "usr_abc");
});

test("each session gets a unique token", async () => {
  const a = await createSession("site_x", "usr_x");
  const b = await createSession("site_x", "usr_x");
  assert.notEqual(a, b);
});

test("getSession returns null for unknown / forged / empty tokens", async () => {
  assert.equal(await getSession("not-a-real-token"), null);
  assert.equal(await getSession(""), null);
});

test("a demo session (no user) resolves with userId null", async () => {
  const token = await createSession("site_demo");
  const s = await getSession(token);
  assert.ok(s);
  assert.equal(s!.userId, null);
  assert.equal(s!.siteId, "site_demo");
});

test("expired sessions are rejected and garbage-collected", async () => {
  const token = await createSession("site_x", "usr_x");
  const past = new Date(Date.now() - 1000).toISOString();
  await getDb().run(sql`UPDATE sessions SET expires_at = ${past} WHERE id = ${token}`);
  assert.equal(await getSession(token), null);
  const rows = await getDb().run(sql`SELECT 1 FROM sessions WHERE id = ${token}`);
  assert.equal(rows.rows.length, 0, "expired row should be deleted on read");
});

test("deleteSession revokes a single session", async () => {
  const token = await createSession("site_x", "usr_x");
  await deleteSession(token);
  assert.equal(await getSession(token), null);
});

test("deleteSessionsForUser revokes all of a user's sessions (logout-everywhere)", async () => {
  const a = await createSession("site_x", "usr_1");
  const b = await createSession("site_x", "usr_1");
  const other = await createSession("site_x", "usr_2");
  await deleteSessionsForUser("usr_1");
  assert.equal(await getSession(a), null);
  assert.equal(await getSession(b), null);
  assert.ok(await getSession(other), "another user's session must survive");
});

test("refreshSessionIfStale only writes once the session has aged", async () => {
  const token = await createSession("site_x", "usr_x");
  const fresh = await getSession(token);
  assert.equal(await refreshSessionIfStale(fresh!), false, "fresh session must not be rewritten");

  // Force the row close to expiry so it counts as stale.
  const soon = new Date(Date.now() + 1000).toISOString();
  await getDb().run(sql`UPDATE sessions SET expires_at = ${soon} WHERE id = ${token}`);
  const stale = await getSession(token);
  assert.equal(await refreshSessionIfStale(stale!), true, "stale session must slide forward");
  const after = await getSession(token);
  assert.ok(
    new Date(after!.expiresAt).getTime() > new Date(stale!.expiresAt).getTime(),
    "expiry should extend after refresh",
  );
});
