import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { initTestDb, resetTestDb } from "./helpers/db";
import { createSite } from "../sites";
import { createTopic, getTopic, updateTopic, resetStaleInProgressTopics } from "../topics";
import { createDraft } from "../drafts";

before(async () => {
  await initTestDb();
});
beforeEach(async () => {
  await resetTestDb();
});

async function makeSite() {
  return createSite({
    name: "Reaper",
    domain: "reaper.test",
    brandVoice: "x",
    author: { name: "A" },
    pillars: [{ name: "P", weight: 1 }],
  });
}

// olderThanMs = -1 puts the cutoff 1ms in the FUTURE, so every in_progress row
// passes the age filter — isolating the "no pending draft" safety clause.

test("reaps a topic stranded in_progress with no pending draft", async () => {
  const s = await makeSite();
  const t = await createTopic({ siteId: s.id, title: "T", targetKeyword: "k", pillarSlug: "p" });
  await updateTopic(t.id, { status: "in_progress" });

  assert.equal(await resetStaleInProgressTopics(-1), 1);
  assert.equal((await getTopic(t.id))!.status, "queued");
});

test("does NOT reap an in_progress topic with a pending_review draft (awaiting review)", async () => {
  const s = await makeSite();
  const t = await createTopic({ siteId: s.id, title: "T", targetKeyword: "k", pillarSlug: "p" });
  await updateTopic(t.id, { status: "in_progress" });
  await createDraft({
    siteId: s.id,
    topicId: t.id,
    title: "D",
    slug: "d",
    contentHtml: "<p>x</p>",
    status: "pending_review",
  });

  assert.equal(await resetStaleInProgressTopics(-1), 0);
  assert.equal((await getTopic(t.id))!.status, "in_progress");
});

test("does not reap a topic updated more recently than the threshold", async () => {
  const s = await makeSite();
  const t = await createTopic({ siteId: s.id, title: "T", targetKeyword: "k", pillarSlug: "p" });
  await updateTopic(t.id, { status: "in_progress" });

  // 1h threshold; the topic was just updated, so it is not yet stale.
  assert.equal(await resetStaleInProgressTopics(60 * 60 * 1000), 0);
  assert.equal((await getTopic(t.id))!.status, "in_progress");
});
