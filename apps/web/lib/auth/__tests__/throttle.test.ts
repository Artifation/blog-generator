import { test } from "node:test";
import assert from "node:assert/strict";
import { throttle, __resetThrottle } from "../throttle";

test("allows up to `max` hits inside the window", () => {
  __resetThrottle();
  const key = "scrape:1.2.3.4";
  for (let i = 0; i < 3; i++) {
    assert.equal(throttle(key, 3, 1000, i).allowed, true);
  }
});

test("blocks the (max+1)-th hit inside the window and reports retryAfterMs", () => {
  __resetThrottle();
  const key = "scrape:1.2.3.4";
  throttle(key, 3, 1000, 0);
  throttle(key, 3, 1000, 100);
  throttle(key, 3, 1000, 200);
  const r = throttle(key, 3, 1000, 300);
  assert.equal(r.allowed, false);
  // oldest hit at t=0 rolls off at t=1000 -> retry in 700ms
  assert.equal(r.retryAfterMs, 700);
});

test("lets hits back in once the window slides past the oldest hit", () => {
  __resetThrottle();
  const key = "invite:9.9.9.9";
  throttle(key, 2, 1000, 0);
  throttle(key, 2, 1000, 500);
  assert.equal(throttle(key, 2, 1000, 900).allowed, false);
  // at t=1001 the t=0 hit has expired, leaving only t=500 -> allowed again
  assert.equal(throttle(key, 2, 1000, 1001).allowed, true);
});

test("buckets are isolated by key", () => {
  __resetThrottle();
  throttle("a", 1, 1000, 0);
  assert.equal(throttle("a", 1, 1000, 10).allowed, false);
  assert.equal(throttle("b", 1, 1000, 10).allowed, true);
});
