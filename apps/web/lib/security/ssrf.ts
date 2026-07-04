/**
 * SSRF guard for server-side fetches of user/tenant-supplied URLs.
 *
 * Without this, the onboarding scrape (and other URL fetches) would fetch any
 * URL the caller supplies — cloud metadata (169.254.169.254), localhost admin
 * panels, and RFC1918 internal services — and `redirect: follow` let an
 * attacker host a public URL that 302s to an internal target.
 *
 * `assertPublicUrl` resolves the hostname and rejects the request when any
 * resolved address is non-public (loopback / private / link-local / ULA /
 * reserved / multicast). `guardedFetch` re-validates every redirect hop.
 *
 * Note: this does not fully defeat DNS-rebinding (a TOCTOU between our lookup
 * and the socket connect). It blocks the practical SSRF vectors; pinning the
 * connect IP would be a hardening follow-up.
 */

import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_REDIRECTS = 5;

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/** True only for routable public unicast addresses. */
export function isPublicIp(ip: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return false;
  }
  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address();
  }
  // ipaddr.js classifies everything non-routable as a named range; only plain
  // public unicast returns "unicast".
  return addr.range() === "unicast";
}

/**
 * Validate that `rawUrl` is an http(s) URL whose hostname resolves only to
 * public IPs. Returns the parsed URL on success, throws SsrfError otherwise.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("Ongeldige URL.");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfError(`Niet-toegestaan protocol: ${url.protocol}`);
  }
  let resolved: Array<{ address: string }>;
  try {
    resolved = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new SsrfError(`Hostname kon niet worden opgelost: ${url.hostname}`);
  }
  if (resolved.length === 0) throw new SsrfError(`Geen DNS-record voor ${url.hostname}`);
  for (const { address } of resolved) {
    if (!isPublicIp(address)) {
      throw new SsrfError(`Geblokkeerd niet-publiek doel-IP (${address}) voor ${url.hostname}`);
    }
  }
  return url;
}

/**
 * Fetch that validates the target (and every redirect hop) against the SSRF
 * guard. Follows redirects manually so each Location is re-checked. Returns the
 * final Response plus the final URL.
 */
export async function guardedFetch(
  initialUrl: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ res: Response; finalUrl: string }> {
  const { timeoutMs = 8000, ...rest } = init;
  let url = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { ...rest, redirect: "manual", signal: controller.signal });
    } finally {
      clearTimeout(t);
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).toString();
      continue;
    }
    return { res, finalUrl: url };
  }
  throw new SsrfError("Te veel redirects.");
}
