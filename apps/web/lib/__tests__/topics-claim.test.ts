import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { initTestDb, resetTestDb } from "./helpers/db";
import { createTopic, claimTopicForRun, getTopic, updateTopic } from "../topics";
import { createSite } from "../sites";

let siteId: string;

before(async () => {
  await initTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  const site = await createSite({
    name: "Claim Site",
    domain: "claim.example.com",
    brandVoice: "x",
    apiKeys: {},
    author: { name: "A" },
    pillars: [{ name: "General", weight: 1 }],
  });
  siteId = site.id;
});

function makeTopic() {
  return createTopic({
    siteId,
    title: "Test topic",
    targetKeyword: "test",
    pillarSlug: "general",
  });
}

test("claimTopicForRun atomically flips queued -> in_progress and reports success", async () => {
  const topic = await makeTopic();
  assert.equal(topic.status, "queued");

  const claimed = await claimTopicForRun(topic.id);
  assert.equal(claimed, true);
  assert.equal((await getTopic(topic.id))!.status, "in_progress");
});

test("a second claim on the same topic fails (single-claim mutex)", async () => {
  const topic = await makeTopic();
  assert.equal(await claimTopicForRun(topic.id), true);
  // Concurrent/duplicate trigger: the topic is no longer queued.
  assert.equal(await claimTopicForRun(topic.id), false);
});

test("cannot claim a topic that isn't queued", async () => {
  const topic = await makeTopic();
  await updateTopic(topic.id, { status: "rejected" });
  assert.equal(await claimTopicForRun(topic.id), false);
});
