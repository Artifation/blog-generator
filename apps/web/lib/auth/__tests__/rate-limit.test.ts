import { test, before } from "node:test";
import assert from "node:assert/strict";

import "../../__tests__/helpers/db";

import {
  checkRateLimit,
  checkEmailRateLimit,
  recordAttempt,
} from "../rate-limit";

before(() => {
  // Small cap so the tests stay fast.
  process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = "3";
});

test("per-email cap blocks after N failures regardless of source IP", async () => {
  const email = "stuffing-target@example.com";
  // Three failures from three DIFFERENT IPs — the per-IP cap would never trip.
  await recordAttempt("10.0.0.1", false, email);
  await recordAttempt("10.0.0.2", false, email);
  await recordAttempt("10.0.0.3", false, email);

  const emailGate = await checkEmailRateLimit(email);
  assert.equal(emailGate.allowed, false, "email bucket should be blocked");

  // A brand-new IP is still allowed by the IP bucket — proving independence.
  const ipGate = await checkRateLimit("10.0.0.99");
  assert.equal(ipGate.allowed, true, "fresh IP bucket should still be allowed");
});

test("per-email cap is case-insensitive", async () => {
  await recordAttempt("10.1.0.1", false, "Mixed@Case.com");
  await recordAttempt("10.1.0.2", false, "mixed@case.COM");
  await recordAttempt("10.1.0.3", false, "MIXED@CASE.com");

  const gate = await checkEmailRateLimit("mixed@case.com");
  assert.equal(gate.allowed, false, "casing variations should share one bucket");
});

test("a different email is unaffected by another account's failures", async () => {
  await recordAttempt("10.2.0.1", false, "victim@example.com");
  await recordAttempt("10.2.0.2", false, "victim@example.com");
  await recordAttempt("10.2.0.3", false, "victim@example.com");

  const other = await checkEmailRateLimit("bystander@example.com");
  assert.equal(other.allowed, true);
});
