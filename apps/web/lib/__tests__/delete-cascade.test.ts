import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { initTestDb, resetTestDb } from "./helpers/db";
import { createSite, getSiteById, deleteSite } from "../sites";
import { createTopic, listTopicsForSite } from "../topics";
import { createUser, listUsersForSite } from "../users";

before(async () => {
  await initTestDb();
});
beforeEach(async () => {
  await resetTestDb();
});

test("deleteSite cascades to child rows (FK enforcement is ON)", async () => {
  const site = await createSite({
    name: "Cascade Test",
    domain: "cascade.test",
    brandVoice: "x",
    author: { name: "A" },
    pillars: [{ name: "Pillar", weight: 1 }],
  });
  await createTopic({ siteId: site.id, title: "T", targetKeyword: "k", pillarSlug: "pillar" });
  await createUser({ siteId: site.id, email: "u@cascade.test", password: "pw123456", role: "owner" });

  // Sanity: children exist before delete.
  assert.equal((await listTopicsForSite(site.id)).length, 1);
  assert.equal((await listUsersForSite(site.id)).length, 1);

  await deleteSite(site.id);

  // With PRAGMA foreign_keys=ON the ON DELETE CASCADE removes every child row.
  assert.equal(await getSiteById(site.id), null);
  assert.equal((await listTopicsForSite(site.id)).length, 0);
  assert.equal((await listUsersForSite(site.id)).length, 0);
});
