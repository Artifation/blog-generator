/**
 * Idempotency of the built-in publish path: re-publishing the same draft must
 * not create a second published row (avoids duplicate posts on double-click /
 * retry).
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { initTestDb, resetTestDb } from "./helpers/db";
import { createSite } from "../sites";
import { createDraft, publishDraftBuiltIn, listPublishedPostsForSite } from "../drafts";

before(async () => {
  await initTestDb();
});
beforeEach(async () => {
  await resetTestDb();
});

test("publishDraftBuiltIn is idempotent for a given draft", async () => {
  const site = await createSite({
    name: "Pub Test",
    domain: "pub.test",
    brandVoice: "x",
    author: { name: "A" },
    pillars: [{ name: "P", weight: 1 }],
  });
  const draft = await createDraft({
    siteId: site.id,
    title: "Hello",
    slug: "hello",
    contentHtml: "<p>hi</p>",
  });

  const first = await publishDraftBuiltIn({ draftId: draft.id });
  const second = await publishDraftBuiltIn({ draftId: draft.id });

  assert.equal(second.id, first.id, "second publish returns the same row");
  const all = await listPublishedPostsForSite(site.id);
  assert.equal(all.length, 1, "only one published post exists for the draft");
});
