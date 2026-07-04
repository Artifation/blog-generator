/**
 * DB-backed single-use invite codes: lookup hides consumed codes, and
 * consume is atomic (only one claimer wins).
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

import { initTestDb, resetTestDb } from "./helpers/db";
import { getDb } from "../db/client";
import { lookupInviteCode, consumeInviteCode, releaseInviteCode } from "../invites";

const CODE = "TEST-INVITE-1";

before(async () => {
  await initTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  // Insert a fresh, unconsumed code (independent of the real seed data).
  await getDb().run(
    sql`INSERT INTO invite_codes (code, plan, company, email, name, domain)
        VALUES (${CODE}, 'pro', 'Acme', 'a@acme.test', 'Ann', 'acme.test')`,
  );
});

test("lookupInviteCode returns info for a valid, unconsumed code (case-insensitive)", async () => {
  const info = await lookupInviteCode("  test-invite-1 ");
  assert.ok(info);
  assert.equal(info!.company, "Acme");
  assert.equal(info!.plan, "pro");
});

test("lookupInviteCode returns null for an unknown code", async () => {
  assert.equal(await lookupInviteCode("NOPE"), null);
});

test("consumeInviteCode is single-use: only the first claim wins", async () => {
  const first = await consumeInviteCode(CODE, "site_1");
  const second = await consumeInviteCode(CODE, "site_2");
  assert.equal(first, true);
  assert.equal(second, false, "a consumed code cannot be claimed again");
});

test("a consumed code no longer looks up", async () => {
  await consumeInviteCode(CODE, "site_1");
  assert.equal(await lookupInviteCode(CODE), null);
});

test("releaseInviteCode makes a claimed code usable again (rollback)", async () => {
  await consumeInviteCode(CODE, "site_1");
  await releaseInviteCode(CODE);
  assert.ok(await lookupInviteCode(CODE));
  assert.equal(await consumeInviteCode(CODE, "site_2"), true);
});
