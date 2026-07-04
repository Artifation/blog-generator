/**
 * Best-effort in-process sliding-window rate limiter for UNAUTHENTICATED
 * onboarding endpoints (website scrape, invite-code check). These run before a
 * session exists, so the DB-backed login limiter (rate-limit.ts) does not apply.
 *
 * This is intentionally simple and in-memory: it caps brute-force / cost-abuse
 * from a single source between process restarts. It is not a hard security
 * boundary on its own (a multi-process deploy gets N× the budget, and it resets
 * on restart), but it turns "unlimited free Gemini calls / invite enumeration"
 * into a throttled trickle, which is the load-bearing mitigation.
 *
 * `throttle` both checks AND records a hit in one call (each call = one attempt).
 */

const buckets = new Map<string, number[]>();

export interface ThrottleResult {
  allowed: boolean;
  /** ms until the oldest counted hit rolls out of the window (0 when allowed). */
  retryAfterMs: number;
}

/**
 * Record an attempt for `key` and decide whether it is allowed. At most `max`
 * hits are permitted within any `windowMs` sliding window.
 *
 * `now` is injectable for deterministic tests; production calls omit it.
 */
export function throttle(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): ThrottleResult {
  const since = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t >= since);

  if (hits.length >= max) {
    // Blocked — keep the pruned window so it keeps sliding, but don't add a hit
    // (an attacker hammering shouldn't push their own unlock further out here).
    buckets.set(key, hits);
    const retryAfterMs = Math.max(0, hits[0]! + windowMs - now);
    return { allowed: false, retryAfterMs };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, retryAfterMs: 0 };
}

/** Test-only: clear all buckets. */
export function __resetThrottle(): void {
  buckets.clear();
}
