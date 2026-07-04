/**
 * Tests for the secret-masking + merge-on-write behavior that keeps decrypted
 * API keys / WordPress passwords out of the client while still allowing the
 * settings UI to save one field at a time.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { initTestDb, resetTestDb } from "../../__tests__/helpers/db";
import { createSite, getSiteById, updateSite } from "../../sites";
import { maskSiteForClient } from "../mask";

before(async () => {
  await initTestDb();
});
beforeEach(async () => {
  await resetTestDb();
});

async function makeSite() {
  return createSite({
    name: "Mask Test",
    domain: "mask.test",
    brandVoice: "x",
    author: { name: "A" },
    pillars: [{ name: "Pillar", weight: 1 }],
    apiKeys: {
      gemini: "AIza-secret",
      anthropic: "sk-ant-secret",
      dataForSeoLogin: "me@dfs.com",
      dataForSeoPassword: "dfs-secret",
      dataForSeoLocationCode: "2528",
    },
    wordpressConfig: { baseUrl: "https://wp.test", user: "agent", appPassword: "wp-secret" },
  });
}

test("maskSiteForClient blanks secrets but keeps non-secret apiKeys + flags presence", async () => {
  const site = await makeSite();
  const { site: masked, secretsPresent } = maskSiteForClient(site);

  // secret leaves blanked
  assert.equal(masked.apiKeys?.gemini, "");
  assert.equal(masked.apiKeys?.anthropic, "");
  assert.equal(masked.apiKeys?.dataForSeoPassword, "");
  assert.equal(masked.wordpressConfig?.appPassword, "");

  // non-secret identifiers preserved
  assert.equal(masked.apiKeys?.dataForSeoLogin, "me@dfs.com");
  assert.equal(masked.apiKeys?.dataForSeoLocationCode, "2528");
  assert.equal(masked.wordpressConfig?.baseUrl, "https://wp.test");
  assert.equal(masked.wordpressConfig?.user, "agent");

  // presence flags
  assert.equal(secretsPresent.apiKeys.gemini, true);
  assert.equal(secretsPresent.apiKeys.anthropic, true);
  assert.equal(secretsPresent.apiKeys.dataForSeoPassword, true);
  assert.equal(secretsPresent.apiKeys.groq, false);
  assert.equal(secretsPresent.wpAppPassword, true);

  // the original (server) object is untouched
  assert.equal(site.apiKeys?.gemini, "AIza-secret");
});

test("updateSite merges apiKeys — a partial save preserves the other keys", async () => {
  const site = await makeSite();
  // Save only a new anthropic key (as one settings card would).
  await updateSite(site.id, { apiKeys: { anthropic: "sk-ant-NEW" } });
  const after = await getSiteById(site.id);
  assert.equal(after!.apiKeys?.anthropic, "sk-ant-NEW");
  assert.equal(after!.apiKeys?.gemini, "AIza-secret", "gemini must survive a partial save");
  assert.equal(after!.apiKeys?.dataForSeoPassword, "dfs-secret");
});

test("updateSite keeps the stored WordPress password when the incoming one is blank", async () => {
  const site = await makeSite();
  // Save WP config with a blank password (masked field left untouched).
  await updateSite(site.id, {
    wordpressConfig: { baseUrl: "https://wp.test/new", user: "agent2", appPassword: "" },
  });
  const after = await getSiteById(site.id);
  assert.equal(after!.wordpressConfig?.baseUrl, "https://wp.test/new");
  assert.equal(after!.wordpressConfig?.user, "agent2");
  assert.equal(after!.wordpressConfig?.appPassword, "wp-secret", "blank password preserves stored one");
});

test("updateSite replaces the WordPress password when a new one is provided", async () => {
  const site = await makeSite();
  await updateSite(site.id, {
    wordpressConfig: { baseUrl: "https://wp.test", user: "agent", appPassword: "wp-NEW" },
  });
  const after = await getSiteById(site.id);
  assert.equal(after!.wordpressConfig?.appPassword, "wp-NEW");
});
