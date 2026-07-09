/**
 * Integration smoke-tests for the site CRUD layer. Verifies:
 *   - createSite + getSiteById round-trip preserves all fields
 *   - apiKeys and wordpressConfig.appPassword are encrypted-at-rest in the
 *     raw SQLite row (defense against a leaked DB file)
 *   - getSiteById returns plaintext keys (decrypted on read)
 *   - updateSite re-seals when keys change
 *   - deleteSite removes the row
 *
 * Uses a throwaway SQLite DB; no network, no shared state with other suites.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Side-effect: bootstrap APP_ENCRYPTION_KEY + DATABASE_FILE before any
// db/client import.
import { initTestDb, resetTestDb } from "../../__tests__/helpers/db";

import { createSite, getSiteById, updateSite, deleteSite } from "../../sites";
import { isEncrypted } from "../../security/crypto";
import { getDb } from "../../db/client";
import { sites } from "../../db/schema";
import { eq } from "drizzle-orm";

before(async () => {
  await initTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

test("createSite + getSiteById round-trip preserves fields", async () => {
  const created = await createSite({
    name: "Test Site",
    domain: "test.example.com",
    brandVoice: "friendly",
    apiKeys: { anthropic: "sk-ant-secret", gemini: "AIza-secret" },
    author: { name: "Alice" },
    pillars: [
      { name: "Pillar A", weight: 1 },
      { name: "Pillar B", weight: 1 },
    ],
  });
  assert.ok(created.id.startsWith("site_"));
  assert.equal(created.slug, "test-site");
  assert.equal(created.pillars.length, 2);

  const read = await getSiteById(created.id);
  assert.ok(read);
  assert.equal(read!.name, "Test Site");
  // apiKeys come back PLAINTEXT through getSiteById (openSiteSecrets is
  // applied on read).
  assert.equal(read!.apiKeys?.anthropic, "sk-ant-secret");
  assert.equal(read!.apiKeys?.gemini, "AIza-secret");
});

test("raw DB row stores apiKeys encrypted (defense against disk leak)", async () => {
  const created = await createSite({
    name: "Encrypted Site",
    domain: "enc.example.com",
    brandVoice: "x",
    apiKeys: { anthropic: "sk-ant-PLAINTEXT-marker-zzz" },
    author: { name: "Bob" },
    pillars: [{ name: "Core", weight: 1 }],
  });
  const db = getDb();
  const rows = await db.select().from(sites).where(eq(sites.id, created.id));
  const raw = rows[0]!;
  // Drizzle parses the JSON blob for us — the leaf value should be an
  // envelope-string, not the plaintext marker.
  const rawAnthropic = (raw.apiKeys as Record<string, string>).anthropic;
  assert.ok(
    isEncrypted(rawAnthropic),
    `raw apiKeys.anthropic should be encrypted, got: ${rawAnthropic.slice(0, 40)}`,
  );
  assert.equal(rawAnthropic.includes("sk-ant-PLAINTEXT-marker-zzz"), false);
});

test("wordpressConfig.appPassword is encrypted at rest, plaintext on read", async () => {
  const created = await createSite({
    name: "WP Site",
    domain: "wp.example.com",
    brandVoice: "x",
    publishDestination: "wordpress",
    wordpressConfig: {
      baseUrl: "https://wp.example.com",
      user: "admin",
      appPassword: "WP-PLAINTEXT-marker",
    },
    author: { name: "C" },
    pillars: [{ name: "Core", weight: 1 }],
  });

  const db = getDb();
  const rows = await db.select().from(sites).where(eq(sites.id, created.id));
  const rawWp = rows[0]!.wordpressConfig!;
  assert.equal(rawWp.baseUrl, "https://wp.example.com");
  assert.equal(rawWp.user, "admin");
  assert.ok(
    isEncrypted(rawWp.appPassword),
    "appPassword should be encrypted on disk",
  );

  const read = await getSiteById(created.id);
  assert.equal(read!.wordpressConfig?.appPassword, "WP-PLAINTEXT-marker");
});

test("updateSite re-seals new api keys, keeps old ones intact", async () => {
  const created = await createSite({
    name: "Update Test",
    domain: "u.example.com",
    brandVoice: "x",
    apiKeys: { anthropic: "first-key" },
    author: { name: "D" },
    pillars: [{ name: "Core", weight: 1 }],
  });

  await updateSite(created.id, {
    apiKeys: { anthropic: "second-key", gemini: "added-key" },
  });

  const read = await getSiteById(created.id);
  assert.equal(read!.apiKeys?.anthropic, "second-key");
  assert.equal(read!.apiKeys?.gemini, "added-key");

  const db = getDb();
  const rows = await db.select().from(sites).where(eq(sites.id, created.id));
  const rawKeys = rows[0]!.apiKeys as Record<string, string>;
  assert.ok(isEncrypted(rawKeys.anthropic), "new key should be encrypted");
  assert.ok(isEncrypted(rawKeys.gemini), "added key should be encrypted");
});

test("deleteSite removes the row", async () => {
  const created = await createSite({
    name: "To Delete",
    domain: "del.example.com",
    brandVoice: "x",
    author: { name: "E" },
    pillars: [{ name: "Core", weight: 1 }],
  });
  assert.ok(await getSiteById(created.id));
  await deleteSite(created.id);
  assert.equal(await getSiteById(created.id), null);
});

test("createSite normalizes pillar weights to sum to ~1", async () => {
  const created = await createSite({
    name: "Weighted Site",
    domain: "w.example.com",
    brandVoice: "x",
    author: { name: "F" },
    pillars: [
      { name: "A", weight: 3 },
      { name: "B", weight: 1 },
    ],
  });
  const total = created.pillars.reduce((s, p) => s + p.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `pillar weights should sum to 1, got ${total}`);
  // Sort by sortOrder
  const sorted = [...created.pillars].sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(sorted[0]!.weight, 0.75);
  assert.equal(sorted[1]!.weight, 0.25);
});

test("budget caps: createSite stores euro caps, updateSite clears to null", async () => {
  const created = await createSite({
    name: "Budget Site",
    domain: "budget.example.com",
    brandVoice: "x",
    maxRunEur: 3,
    maxWeeklyEur: 25,
    author: { name: "G" },
    pillars: [{ name: "Core", weight: 1 }],
  });
  assert.equal(created.maxRunEur, 3);
  assert.equal(created.maxWeeklyEur, 25);

  // Clearing a cap in the UI sends null → falls back to the env default.
  await updateSite(created.id, { maxWeeklyEur: null });
  const read = await getSiteById(created.id);
  assert.equal(read!.maxRunEur, 3);
  assert.equal(read!.maxWeeklyEur, null);
});

test("budget caps: default to null when omitted", async () => {
  const created = await createSite({
    name: "No Budget Site",
    domain: "nobudget.example.com",
    brandVoice: "x",
    author: { name: "H" },
    pillars: [{ name: "Core", weight: 1 }],
  });
  assert.equal(created.maxRunEur, null);
  assert.equal(created.maxWeeklyEur, null);
});
