/**
 * Fail-closed gating for secret writes.
 *
 * Before this guard, sealApiKeys/sealWordpressConfig silently stored secrets as
 * cleartext whenever APP_ENCRYPTION_KEY was missing or malformed — so any
 * deployment that lost/typo'd the key persisted WP app-passwords and LLM keys in
 * plaintext with only a console warning nobody reads. We now refuse to write a
 * non-empty secret as plaintext unless the operator explicitly opts in with
 * ALLOW_PLAINTEXT_SECRETS=true, and a present-but-invalid key is always a hard
 * error (it signals a misconfiguration, never an intentional dev choice).
 *
 * Run:
 *   npm test --workspace=@blog-tool/web
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Side-effect import: sets APP_ENCRYPTION_KEY + DATABASE_FILE before crypto loads.
import "../../__tests__/helpers/db";

import { sealApiKeys, sealWordpressConfig } from "../secrets";
import { _resetKeyCache } from "../../security/crypto";

/** Run `fn` with env overrides applied + the key cache reset, then restore. */
function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(overrides)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  _resetKeyCache();
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    _resetKeyCache();
  }
}

test("sealApiKeys refuses to write a non-empty secret as plaintext when no key is set", () => {
  withEnv({ APP_ENCRYPTION_KEY: undefined, ALLOW_PLAINTEXT_SECRETS: undefined }, () => {
    assert.throws(
      () => sealApiKeys({ anthropic: "sk-ant-secret" }),
      /plaintext|APP_ENCRYPTION_KEY/i,
    );
  });
});

test("sealApiKeys allows plaintext only with the explicit ALLOW_PLAINTEXT_SECRETS opt-in", () => {
  withEnv({ APP_ENCRYPTION_KEY: undefined, ALLOW_PLAINTEXT_SECRETS: "true" }, () => {
    const sealed = sealApiKeys({ anthropic: "sk-ant-secret" });
    assert.equal(sealed.anthropic, "sk-ant-secret");
  });
});

test("sealApiKeys hard-errors on a present-but-invalid key, even with the opt-in", () => {
  withEnv({ APP_ENCRYPTION_KEY: "tooshort", ALLOW_PLAINTEXT_SECRETS: "true" }, () => {
    assert.throws(() => sealApiKeys({ anthropic: "sk-ant-secret" }), /invalid/i);
  });
});

test("sealApiKeys never throws for empty/undefined leaves (no secret to protect)", () => {
  withEnv({ APP_ENCRYPTION_KEY: undefined, ALLOW_PLAINTEXT_SECRETS: undefined }, () => {
    assert.doesNotThrow(() => sealApiKeys({ anthropic: "", gemini: undefined }));
  });
});

test("sealWordpressConfig refuses a plaintext appPassword when no key is set", () => {
  withEnv({ APP_ENCRYPTION_KEY: undefined, ALLOW_PLAINTEXT_SECRETS: undefined }, () => {
    assert.throws(
      () => sealWordpressConfig({ baseUrl: "https://x.com", user: "u", appPassword: "p" }),
      /plaintext|APP_ENCRYPTION_KEY/i,
    );
  });
});

test("sealWordpressConfig is fine when there is no appPassword to protect", () => {
  withEnv({ APP_ENCRYPTION_KEY: undefined, ALLOW_PLAINTEXT_SECRETS: undefined }, () => {
    assert.doesNotThrow(() =>
      sealWordpressConfig({ baseUrl: "https://x.com", user: "u", appPassword: "" }),
    );
  });
});
