import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { initTestDb } from "../../__tests__/helpers/db";
import { checkReadiness } from "../readiness";

before(async () => {
  await initTestDb();
});

let savedCronToken: string | undefined;
beforeEach(() => {
  savedCronToken = process.env.CRON_TOKEN;
});
afterEach(() => {
  if (savedCronToken === undefined) delete process.env.CRON_TOKEN;
  else process.env.CRON_TOKEN = savedCronToken;
});

test("reports ready when DB, encryption key and CRON_TOKEN are all present", async () => {
  process.env.CRON_TOKEN = "a-secret";
  const r = await checkReadiness();
  assert.equal(r.checks.db, true);
  assert.equal(r.checks.encryption, true); // helper set APP_ENCRYPTION_KEY
  assert.equal(r.checks.cronToken, true);
  assert.equal(r.ready, true);
});

test("reports not-ready (but DB still ok) when CRON_TOKEN is missing", async () => {
  delete process.env.CRON_TOKEN;
  const r = await checkReadiness();
  assert.equal(r.checks.db, true);
  assert.equal(r.checks.cronToken, false);
  assert.equal(r.ready, false);
});
