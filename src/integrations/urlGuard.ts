/**
 * Lightweight, synchronous SSRF guard for the core pipeline's outbound fetches
 * of URLs that originate from tenant config or remote-controlled content
 * (competitor sitemap indexes recurse into arbitrary <loc> URLs).
 *
 * It blocks the realistic payloads — literal private/loopback/link-local IPs
 * (incl. the cloud-metadata 169.254.169.254), `localhost`, and non-FQDN /
 * `.local` / `.internal` names — without a DNS lookup, so it stays fast and
 * test-friendly (no network in unit tests). It does NOT resolve DNS, so a public
 * hostname that resolves to a private IP (DNS-rebinding) is out of scope here;
 * `guardedFetch` additionally refuses to follow redirects so a public host can't
 * bounce the request to an internal target.
 */

import net from "node:net";

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // unparseable → treat as unsafe
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lc = ip.toLowerCase();
  if (lc === "::1" || lc === "::") return true; // loopback / unspecified
  if (lc.startsWith("fe80")) return true; // link-local
  if (lc.startsWith("fc") || lc.startsWith("fd")) return true; // unique-local
  const mapped = lc.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  return false;
}

/** Throw if `rawUrl` is not a safe, public http(s) URL. Returns the parsed URL. */
export function assertSafeUrl(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(`Blocked invalid URL: ${rawUrl}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error(`Blocked non-http(s) URL: ${rawUrl}`);
  }
  const host = u.hostname.toLowerCase();
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    if (isPrivateIpv4(host)) throw new Error(`Blocked private/loopback host: ${host}`);
    return u;
  }
  if (ipVersion === 6) {
    if (isPrivateIpv6(host)) throw new Error(`Blocked private/loopback host: ${host}`);
    return u;
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error(`Blocked localhost: ${host}`);
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error(`Blocked internal TLD: ${host}`);
  }
  if (!host.includes(".")) {
    throw new Error(`Blocked non-FQDN host (possible internal name): ${host}`);
  }
  return u;
}

/**
 * SSRF-guarded fetch: validate the target, bound wall-clock, and REFUSE to
 * follow redirects (so a validated public host can't 30x-bounce to an internal
 * one). Signature mirrors `fetch(url)` so callers can inject a mock in tests.
 */
export async function guardedFetch(
  rawUrl: string,
  f: typeof fetch = globalThis.fetch,
  timeoutMs = 15_000,
): Promise<Response> {
  assertSafeUrl(rawUrl);
  return f(rawUrl, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
}
