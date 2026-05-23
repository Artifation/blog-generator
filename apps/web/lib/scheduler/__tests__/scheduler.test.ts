/**
 * Smoke tests for the in-process scheduler. Verifies the externally-observable
 * contract:
 *
 *   - Sites with an empty `schedule_cron` are not scheduled.
 *   - Sites with an invalid cron expression are not scheduled (warning logged).
 *   - Sites with a valid cron expression ARE scheduled.
 *   - Mutex: when `runningSiteIds` already contains the site, triggerSiteRun
 *     skips immediately (logs `scheduler-skip-overlap`).
 *
 * We do NOT exercise `runForSite` end-to-end — that needs LLM providers, the
 * full pipeline, and is out-of-scope for a smoke test. Instead we verify the
 * scheduler's bookkeeping + skip-paths.
 */

import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import "../../__tests__/helpers/db";
import { initTestDb, resetTestDb } from "../../__tests__/helpers/db";

import { createSite } from "../../sites";
import {
  _getScheduledSnapshot,
  _syncScheduledJobsForTest,
  _resetSchedulerForTest,
  _triggerSiteRunForTest,
  _setRunningSiteIdsForTest,
  _getRunningSiteIdsForTest,
  isSchedulerEnabled,
} from "../index";

// Capture console output so we can assert on log lines without polluting the
// test runner output.
const consoleLogs: string[] = [];
const consoleWarns: string[] = [];
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

before(async () => {
  await initTestDb();
  console.log = (...args: unknown[]) => {
    consoleLogs.push(args.map((a) => String(a)).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    consoleWarns.push(args.map((a) => String(a)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    consoleWarns.push(args.map((a) => String(a)).join(" "));
  };
});

after(() => {
  console.log = origLog;
  console.warn = origWarn;
  console.error = origError;
});

beforeEach(async () => {
  await resetTestDb();
  _resetSchedulerForTest();
  consoleLogs.length = 0;
  consoleWarns.length = 0;
});

test("isSchedulerEnabled honours DISABLE_INPROCESS_SCHEDULER override", () => {
  const prev = process.env.DISABLE_INPROCESS_SCHEDULER;
  try {
    process.env.DISABLE_INPROCESS_SCHEDULER = "true";
    assert.equal(isSchedulerEnabled(), false);
  } finally {
    if (prev === undefined) delete process.env.DISABLE_INPROCESS_SCHEDULER;
    else process.env.DISABLE_INPROCESS_SCHEDULER = prev;
  }
});

test("site without schedule_cron is not scheduled", async () => {
  await createSite({
    name: "No Cron Site",
    domain: "x.example.com",
    brandVoice: "x",
    scheduleCron: "", // empty → no schedule
    author: { name: "A" },
    pillars: [{ name: "Core", weight: 1 }],
  });

  await _syncScheduledJobsForTest();
  const snapshot = _getScheduledSnapshot();
  assert.equal(snapshot.length, 0, `no sites should be scheduled, got: ${JSON.stringify(snapshot)}`);
});

test("site with invalid cron expression is not scheduled (and warns)", async () => {
  await createSite({
    name: "Bad Cron Site",
    domain: "bad.example.com",
    brandVoice: "x",
    scheduleCron: "not-a-valid-cron",
    author: { name: "B" },
    pillars: [{ name: "Core", weight: 1 }],
  });

  await _syncScheduledJobsForTest();
  const snapshot = _getScheduledSnapshot();
  assert.equal(snapshot.length, 0);
  const warnedAboutInvalid = consoleWarns.some((line) =>
    line.includes("scheduler-invalid-cron"),
  );
  assert.ok(
    warnedAboutInvalid,
    `expected scheduler-invalid-cron warning, got: ${consoleWarns.join("\n")}`,
  );
});

test("site with valid cron IS scheduled", async () => {
  const site = await createSite({
    name: "Good Cron Site",
    domain: "good.example.com",
    brandVoice: "x",
    scheduleCron: "0 6 * * 1,3,5",
    author: { name: "C" },
    pillars: [{ name: "Core", weight: 1 }],
  });

  await _syncScheduledJobsForTest();
  const snapshot = _getScheduledSnapshot();
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0]!.siteId, site.id);
  assert.equal(snapshot[0]!.cron, "0 6 * * 1,3,5");
  // Clean up the cron task to avoid keeping the test process alive.
  _resetSchedulerForTest();
});

test("syncScheduledJobs is idempotent — second sync doesn't double-schedule", async () => {
  await createSite({
    name: "Stable Site",
    domain: "stable.example.com",
    brandVoice: "x",
    scheduleCron: "*/5 * * * *",
    author: { name: "D" },
    pillars: [{ name: "Core", weight: 1 }],
  });

  await _syncScheduledJobsForTest();
  await _syncScheduledJobsForTest();
  await _syncScheduledJobsForTest();
  const snapshot = _getScheduledSnapshot();
  assert.equal(snapshot.length, 1);
  _resetSchedulerForTest();
});

test("mutex: triggerSiteRun skips when site is already in runningSiteIds", async () => {
  // Pre-populate the mutex to simulate an in-flight run.
  _setRunningSiteIdsForTest(["site_busy"]);
  // Trigger another tick for the SAME site — should immediately log
  // "scheduler-skip-overlap" and return without removing the id (because
  // the "in-flight" run owns the slot).
  await _triggerSiteRunForTest("site_busy", "busy-slug");

  const skipped = consoleLogs.some((line) =>
    line.includes("scheduler-skip-overlap") && line.includes("site_busy"),
  );
  assert.ok(
    skipped,
    `expected scheduler-skip-overlap log, got: ${consoleLogs.join("\n")}`,
  );
  // The owning run still holds the slot.
  assert.deepEqual(_getRunningSiteIdsForTest(), ["site_busy"]);
});

test("triggerSiteRun on missing site logs scheduler-site-missing", async () => {
  // Clean mutex, no site in DB → the inner getSiteById returns null.
  _setRunningSiteIdsForTest([]);
  await _triggerSiteRunForTest("site_nonexistent", "ghost");

  const missingLogged = [...consoleLogs, ...consoleWarns].some((line) =>
    line.includes("scheduler-site-missing") && line.includes("site_nonexistent"),
  );
  assert.ok(
    missingLogged,
    `expected scheduler-site-missing log, got logs=${consoleLogs.join("\n")} warns=${consoleWarns.join("\n")}`,
  );
  // Mutex released afterwards.
  assert.deepEqual(_getRunningSiteIdsForTest(), []);
});

test("triggerSiteRun on site with no queued topics logs scheduler-skip-empty", async () => {
  _setRunningSiteIdsForTest([]);
  const site = await createSite({
    name: "Empty Site",
    domain: "empty.example.com",
    brandVoice: "x",
    scheduleCron: "0 6 * * *",
    author: { name: "E" },
    pillars: [{ name: "Core", weight: 1 }],
  });

  await _triggerSiteRunForTest(site.id, site.slug);

  const skipEmpty = consoleLogs.some((line) =>
    line.includes("scheduler-skip-empty") && line.includes(site.id),
  );
  assert.ok(
    skipEmpty,
    `expected scheduler-skip-empty log, got: ${consoleLogs.join("\n")}`,
  );
  assert.deepEqual(_getRunningSiteIdsForTest(), []);
});

test("site removed from DB is unscheduled on next sync", async () => {
  const site = await createSite({
    name: "Ephemeral Site",
    domain: "eph.example.com",
    brandVoice: "x",
    scheduleCron: "0 6 * * *",
    author: { name: "F" },
    pillars: [{ name: "Core", weight: 1 }],
  });
  await _syncScheduledJobsForTest();
  assert.equal(_getScheduledSnapshot().length, 1);

  // Delete the site, re-sync — should unschedule.
  const { deleteSite } = await import("../../sites");
  await deleteSite(site.id);
  await _syncScheduledJobsForTest();
  assert.equal(_getScheduledSnapshot().length, 0);
});
