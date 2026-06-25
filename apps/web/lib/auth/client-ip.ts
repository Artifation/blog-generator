/**
 * Trusted-proxy-aware client IP resolution for rate-limiting.
 *
 * The naive "first X-Forwarded-For entry" is the CLIENT-supplied, left-most hop
 * — fully spoofable when the app isn't behind a proxy that overwrites it, so an
 * attacker rotates a fake IP per request to get a fresh login budget every time.
 *
 * Instead we read the entry `trustedProxyCount` positions from the RIGHT: those
 * right-most entries are the ones our own reverse-proxy chain appended, so they
 * can't be forged by the client. Everything further left is client-controlled
 * and ignored. With 0 trusted proxies (app exposed directly) we don't trust XFF
 * at all and fall back to the single-value proxy headers / a shared bucket.
 */

export interface ClientIpInput {
  xForwardedFor: string | null;
  xRealIp: string | null;
  cfConnectingIp: string | null;
  /** Number of trusted reverse proxies in front of the app (env-configured). */
  trustedProxyCount: number;
}

export function resolveClientIp(input: ClientIpInput): string {
  const hops = input.trustedProxyCount;
  if (hops > 0 && input.xForwardedFor) {
    const parts = input.xForwardedFor
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const idx = parts.length - hops;
      // The entry `hops` from the right was appended by our trusted chain. If the
      // chain is shorter than configured (idx < 0), the left-most is the best
      // available — still not attacker-prependable past a real proxy.
      return idx >= 0 ? parts[idx]! : parts[0]!;
    }
  }
  if (input.xRealIp) return input.xRealIp.trim();
  if (input.cfConnectingIp) return input.cfConnectingIp.trim();
  return "unknown";
}

/** How many trusted reverse proxies sit in front of the app. Default: 1. */
export function trustedProxyCount(): number {
  const raw = Number(process.env.TRUSTED_PROXY_COUNT);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 1;
}
