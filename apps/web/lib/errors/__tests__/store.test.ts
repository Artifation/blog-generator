/**
 * Regression tests for the error store's read path.
 *
 * Bug (digest 328401321): `runRaw` routed the libsql `{sql, args}` object form
 * through Drizzle's `db.run()`, which treats any non-string as an SQL wrapper
 * and calls `.getSQL()` on it — so every SELECT threw
 * `TypeError: a.getSQL is not a function` and the /errors page crashed.
 */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { initTestDb, resetTestDb } from "../../__tests__/helpers/db";
import { getDb } from "../../db/client";
import { recordError, listErrors, countErrors, getError } from "../store";

before(async () => {
  await initTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  // resetTestDb() doesn't truncate error_events; clear it so counts are isolated.
  await getDb().run(`DELETE FROM error_events`);
});

test("listErrors returns recorded errors (no getSQL crash)", async () => {
  const id = await recordError({
    siteId: null,
    source: "pipeline",
    severity: "error",
    message: "boom",
  });
  assert.ok(id, "recordError should persist and return an id");

  const events = await listErrors({ siteId: null });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.message, "boom");
  assert.equal(events[0]!.source, "pipeline");
});

test("listErrors applies source + severity filters", async () => {
  await recordError({ siteId: null, source: "pipeline", severity: "error", message: "a" });
  await recordError({ siteId: null, source: "scheduler", severity: "warn", message: "b" });

  const onlyScheduler = await listErrors({ siteId: null, source: "scheduler" });
  assert.equal(onlyScheduler.length, 1);
  assert.equal(onlyScheduler[0]!.message, "b");
});

test("countErrors buckets resolved/unresolved/fatal", async () => {
  await recordError({ siteId: null, source: "pipeline", severity: "error", message: "open1" });
  await recordError({ siteId: null, source: "pipeline", severity: "fatal", message: "openFatal" });

  const counts = await countErrors({ siteId: null });
  assert.equal(counts.unresolved, 2);
  assert.equal(counts.fatalUnresolved, 1);
  assert.equal(counts.resolved, 0);
});

test("getError fetches a single row by id", async () => {
  const id = await recordError({ siteId: null, source: "api", message: "single" });
  const row = await getError(id!);
  assert.ok(row);
  assert.equal(row!.message, "single");
});
