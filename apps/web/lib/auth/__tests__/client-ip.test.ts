import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveClientIp } from "../client-ip";

const base = { xForwardedFor: null, xRealIp: null, cfConnectingIp: null, trustedProxyCount: 1 };

test("with one trusted proxy, uses the (only) forwarded entry", () => {
  assert.equal(resolveClientIp({ ...base, xForwardedFor: "1.2.3.4" }), "1.2.3.4");
});

test("ignores a spoofed left-most XFF entry, trusting the proxy-appended right-most", () => {
  // Attacker prepends 6.6.6.6; our single trusted proxy appended the real client.
  assert.equal(
    resolveClientIp({ ...base, xForwardedFor: "6.6.6.6, 1.2.3.4" }),
    "1.2.3.4",
  );
});

test("with two trusted proxies, reads the 2nd entry from the right", () => {
  assert.equal(
    resolveClientIp({ ...base, trustedProxyCount: 2, xForwardedFor: "6.6.6.6, 1.2.3.4, 10.0.0.1" }),
    "1.2.3.4",
  );
});

test("falls back to x-real-ip when there is no XFF", () => {
  assert.equal(resolveClientIp({ ...base, xRealIp: "9.9.9.9" }), "9.9.9.9");
});

test("does NOT trust XFF at all when trustedProxyCount is 0 (direct exposure)", () => {
  assert.equal(
    resolveClientIp({ ...base, trustedProxyCount: 0, xForwardedFor: "6.6.6.6", xRealIp: "9.9.9.9" }),
    "9.9.9.9",
  );
});

test("returns 'unknown' when no usable header is present", () => {
  assert.equal(resolveClientIp(base), "unknown");
});

test("tolerates a shorter chain than the configured hop count", () => {
  assert.equal(
    resolveClientIp({ ...base, trustedProxyCount: 3, xForwardedFor: "1.2.3.4" }),
    "1.2.3.4",
  );
});
