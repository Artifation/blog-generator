/**
 * Smoke tests for sealApiKeys / openApiKeys / sealWordpressConfig /
 * openWordpressConfig — round-trip semantics, idempotency, and graceful
 * handling of the "no key configured" edge case.
 *
 * Run:
 *   npm test --workspace=@blog-tool/web
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// Side-effect import: sets APP_ENCRYPTION_KEY + DATABASE_FILE before any
// crypto import happens.
import "../../__tests__/helpers/db";

import {
  sealApiKeys,
  openApiKeys,
  sealWordpressConfig,
  openWordpressConfig,
  openSiteSecrets,
} from "../secrets";
import { isEncrypted, _resetKeyCache } from "../../security/crypto";

before(() => {
  // Make sure the key is fresh for the suite.
  if (!process.env.APP_ENCRYPTION_KEY) {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  }
  _resetKeyCache();
});

test("sealApiKeys encrypts every leaf, openApiKeys round-trips", () => {
  const plain = {
    anthropic: "sk-ant-aaa",
    gemini: "AIza-bbb",
    fal: "fal-ccc",
  };
  const sealed = sealApiKeys(plain);
  // Every non-empty leaf value should now be an envelope.
  for (const k of Object.keys(plain)) {
    assert.ok(
      isEncrypted(sealed[k as keyof typeof plain] as string),
      `${k} should be encrypted`,
    );
    assert.notEqual(
      sealed[k as keyof typeof plain],
      plain[k as keyof typeof plain],
    );
  }
  const opened = openApiKeys(sealed);
  assert.deepEqual(opened, plain);
});

test("sealApiKeys is idempotent (re-sealing leaves envelopes alone)", () => {
  const plain = { anthropic: "sk-ant-xxx" };
  const sealedOnce = sealApiKeys(plain);
  const sealedTwice = sealApiKeys(sealedOnce);
  assert.equal(sealedOnce.anthropic, sealedTwice.anthropic);
});

test("sealApiKeys skips empty strings", () => {
  const sealed = sealApiKeys({ anthropic: "", gemini: "real-key" });
  assert.equal(sealed.anthropic, "");
  assert.ok(isEncrypted(sealed.gemini!));
});

test("sealApiKeys drops undefined values", () => {
  const sealed = sealApiKeys({ anthropic: "x", gemini: undefined });
  assert.ok("anthropic" in sealed);
  assert.equal("gemini" in sealed, false);
});

test("openApiKeys tolerates plaintext (legacy rows)", () => {
  // Simulate a half-migrated row: plaintext value mixed with an envelope.
  const sealed = sealApiKeys({ anthropic: "real-key" });
  const mixed = { ...sealed, gemini: "legacy-plaintext" };
  const opened = openApiKeys(mixed);
  assert.equal(opened.anthropic, "real-key");
  assert.equal(opened.gemini, "legacy-plaintext");
});

test("openApiKeys handles null/undefined input", () => {
  assert.deepEqual(openApiKeys(null), {});
  assert.deepEqual(openApiKeys(undefined), {});
});

test("sealWordpressConfig encrypts only appPassword, leaves baseUrl/user alone", () => {
  const cfg = {
    baseUrl: "https://example.com",
    user: "admin",
    appPassword: "xxxx yyyy zzzz",
  };
  const sealed = sealWordpressConfig(cfg)!;
  assert.equal(sealed.baseUrl, cfg.baseUrl);
  assert.equal(sealed.user, cfg.user);
  assert.ok(isEncrypted(sealed.appPassword));
  const opened = openWordpressConfig(sealed)!;
  assert.deepEqual(opened, cfg);
});

test("sealWordpressConfig handles null", () => {
  assert.equal(sealWordpressConfig(null), null);
  assert.equal(openWordpressConfig(null), null);
});

test("openSiteSecrets hydrates both apiKeys and wordpressConfig in one shot", () => {
  const sealedApi = sealApiKeys({ anthropic: "abc" });
  const sealedWp = sealWordpressConfig({
    baseUrl: "https://x.com",
    user: "u",
    appPassword: "p",
  });
  // Cast to satisfy the structural Site-shape that openSiteSecrets expects.
  const row = {
    apiKeys: sealedApi,
    wordpressConfig: sealedWp,
  } as Parameters<typeof openSiteSecrets>[0];
  const opened = openSiteSecrets(row);
  assert.equal(
    (opened.apiKeys as Record<string, string>).anthropic,
    "abc",
  );
  assert.equal(
    (opened.wordpressConfig as { appPassword: string }).appPassword,
    "p",
  );
});
