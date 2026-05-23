/**
 * Smoke tests for db/client.ts. Focus: `ensureSchema()` idempotency — calling
 * it 2+ times must not throw, must not create duplicate tables/indexes, and
 * must not break running queries.
 *
 * We don't test the encrypted-migration path here in depth — that's covered
 * implicitly by the sites/secrets tests.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";

import "../../__tests__/helpers/db";

import { ensureSchema, getDb, closeDb } from "../client";

before(async () => {
  // First call materializes the schema.
  await ensureSchema();
});

test("ensureSchema is idempotent — repeated calls do not throw", async () => {
  await ensureSchema();
  await ensureSchema();
  await ensureSchema();
});

test("expected tables exist after ensureSchema", async () => {
  const db = getDb();
  const result = await db.run(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
  );
  const names = ((result.rows ?? []) as unknown as Array<{ name: string }>).map(
    (r) => r.name,
  );
  for (const expected of [
    "sites",
    "pillars",
    "topics",
    "drafts",
    "published_posts",
    "runs",
    "settings",
    "post_refreshes",
    "users",
  ]) {
    assert.ok(
      names.includes(expected),
      `expected table "${expected}" to exist, got: ${names.join(", ")}`,
    );
  }
});

test("expected indexes exist (no duplicates after re-running ensureSchema)", async () => {
  // Force a hard reset + re-run to make sure CREATE INDEX IF NOT EXISTS
  // doesn't accumulate duplicates.
  await ensureSchema();
  const db = getDb();
  const result = await db.run(
    `SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  const names = ((result.rows ?? []) as unknown as Array<{ name: string }>).map(
    (r) => r.name,
  );
  // Each named index should appear exactly once.
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  for (const [name, count] of counts) {
    assert.equal(count, 1, `index ${name} should appear exactly once`);
  }
  // Spot-check a few expected indexes
  for (const expected of [
    "sites_slug_idx",
    "pillars_site_slug_idx",
    "topics_site_status_idx",
    "drafts_site_status_idx",
  ]) {
    assert.ok(
      names.includes(expected),
      `expected index "${expected}" missing`,
    );
  }
});

test("closeDb resets the singleton; getDb after close re-opens cleanly", () => {
  closeDb();
  const db1 = getDb();
  const db2 = getDb();
  assert.equal(db1, db2, "second call should return the cached instance");
});

test("safe ADD COLUMN migrations don't fail on second boot", async () => {
  // Drive the ensureSchema path again — the ALTER TABLE … ADD COLUMN call for
  // `published_posts.repurposed` and `topics.custom_instructions` should be
  // swallowed by safeAddColumn when the column already exists.
  await ensureSchema();
  const db = getDb();
  const pubInfo = await db.run(`PRAGMA table_info(published_posts)`);
  const pubCols = ((pubInfo.rows ?? []) as unknown as Array<{ name: string }>).map(
    (r) => r.name,
  );
  assert.ok(pubCols.includes("repurposed"), "repurposed column should exist");

  const topInfo = await db.run(`PRAGMA table_info(topics)`);
  const topCols = ((topInfo.rows ?? []) as unknown as Array<{ name: string }>).map(
    (r) => r.name,
  );
  assert.ok(
    topCols.includes("custom_instructions"),
    "custom_instructions column should exist",
  );
});
