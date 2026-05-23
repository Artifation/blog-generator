/**
 * Smoke tests for the AES-256-GCM helper. Uses Node's built-in `node:test`
 * runner so no extra dev-deps are needed.
 *
 * Run:
 *   npx tsx --test apps/web/lib/security/__tests__/crypto.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  encryptString,
  decryptString,
  isEncrypted,
  isEncryptionAvailable,
  _resetKeyCache,
} from "../crypto";

function withKey<T>(fn: () => T): T {
  const prev = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  _resetKeyCache();
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = prev;
    _resetKeyCache();
  }
}

test("round-trip preserves plaintext", () => {
  withKey(() => {
    const plain = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_=";
    const env = encryptString(plain);
    assert.ok(isEncrypted(env), "envelope should be recognized as encrypted");
    const back = decryptString(env);
    assert.equal(back, plain);
  });
});

test("two encrypts of the same plaintext produce different ciphertext", () => {
  withKey(() => {
    const plain = "hello world";
    const a = encryptString(plain);
    const b = encryptString(plain);
    assert.notEqual(a, b, "IV must be random so envelopes differ");
    assert.equal(decryptString(a), plain);
    assert.equal(decryptString(b), plain);
  });
});

test("round-trip works for unicode and long strings", () => {
  withKey(() => {
    const plain = "日本語 🚀 " + "x".repeat(10_000);
    const env = encryptString(plain);
    assert.equal(decryptString(env), plain);
  });
});

test("round-trip works for empty string", () => {
  withKey(() => {
    const env = encryptString("");
    assert.equal(decryptString(env), "");
  });
});

test("tampered ciphertext is rejected by GCM auth tag", () => {
  withKey(() => {
    const env = encryptString("super-secret");
    const parsed = JSON.parse(env) as { ct: string };
    // Flip a bit in the ciphertext
    const buf = Buffer.from(parsed.ct, "base64");
    buf[0] = buf[0]! ^ 0x01;
    parsed.ct = buf.toString("base64");
    assert.throws(() => decryptString(JSON.stringify(parsed)));
  });
});

test("tampered tag is rejected", () => {
  withKey(() => {
    const env = encryptString("super-secret");
    const parsed = JSON.parse(env) as { tag: string };
    const buf = Buffer.from(parsed.tag, "base64");
    buf[0] = buf[0]! ^ 0x01;
    parsed.tag = buf.toString("base64");
    assert.throws(() => decryptString(JSON.stringify(parsed)));
  });
});

test("decrypt with a different key fails", () => {
  const plain = "secret-token";
  let env: string;
  withKey(() => {
    env = encryptString(plain);
  });
  // Now decrypt under a fresh key — should fail.
  withKey(() => {
    assert.throws(() => decryptString(env));
  });
});

test("isEncrypted distinguishes envelope from plaintext", () => {
  withKey(() => {
    const env = encryptString("anything");
    assert.equal(isEncrypted(env), true);
    assert.equal(isEncrypted("sk-ant-plain"), false);
    assert.equal(isEncrypted(""), false);
    assert.equal(isEncrypted("{}"), false);
    assert.equal(isEncrypted('{"foo":"bar"}'), false);
    // A JSON blob that happens to have v:1 but no iv/tag/ct should NOT match.
    assert.equal(isEncrypted('{"v":1,"foo":"bar"}'), false);
    // Whitespace-tolerant
    assert.equal(isEncrypted("   " + env), true);
  });
});

test("missing key throws clear error", () => {
  const prev = process.env.APP_ENCRYPTION_KEY;
  delete process.env.APP_ENCRYPTION_KEY;
  _resetKeyCache();
  try {
    assert.equal(isEncryptionAvailable(), false);
    assert.throws(() => encryptString("x"), /APP_ENCRYPTION_KEY/);
    assert.throws(() => decryptString("x"), /APP_ENCRYPTION_KEY/);
  } finally {
    if (prev !== undefined) process.env.APP_ENCRYPTION_KEY = prev;
    _resetKeyCache();
  }
});

test("invalid key (wrong length) throws", () => {
  const prev = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = Buffer.from("too short").toString("base64");
  _resetKeyCache();
  try {
    assert.throws(() => encryptString("x"), /32 bytes/);
  } finally {
    if (prev !== undefined) process.env.APP_ENCRYPTION_KEY = prev;
    else delete process.env.APP_ENCRYPTION_KEY;
    _resetKeyCache();
  }
});

test("malformed envelope JSON throws", () => {
  withKey(() => {
    assert.throws(() => decryptString("not json"));
    assert.throws(() => decryptString('{"v":2,"iv":"a","tag":"b","ct":"c"}'));
    assert.throws(() => decryptString('{"v":1}'));
  });
});
