/**
 * Fetches sitemap.xml from competitor domains and diffs against a previous snapshot
 * to detect newly published competitor content.
 */

import { guardedFetch } from "./urlGuard.ts";

// Bound resource use on hostile/huge competitor sitemaps: a remote server fully
// controls the document size, the number of sub-sitemaps in an index, and the
// entry count — without caps a single domain could OOM the run or run for ages.
const MAX_SITEMAP_BYTES = 5_000_000; // 5 MB per sitemap document
const MAX_SUB_SITEMAPS = 50; // recurse into at most this many sub-sitemaps
const MAX_ENTRIES_PER_DOMAIN = 5000; // stop parsing past this many entries

async function readCappedText(res: Response, url: string): Promise<string> {
  const len = Number(res.headers?.get?.("content-length") ?? "");
  if (Number.isFinite(len) && len > MAX_SITEMAP_BYTES) {
    throw new Error(`sitemap too large (${len} bytes) for ${url}`);
  }
  const text = await res.text();
  if (text.length > MAX_SITEMAP_BYTES) {
    throw new Error(`sitemap body too large (${text.length} bytes) for ${url}`);
  }
  return text;
}

export interface SitemapEntry {
  url: string;
  slug: string;
  lastmod?: string; // ISO date string
  competitor_domain: string;
}

export interface CompetitorSitemapInput {
  domains: string[];
  fetchImpl?: typeof fetch;
}

export interface SnapshotDiffInput {
  current: SitemapEntry[];
  previousSnapshot?: SitemapEntry[];
}

function extractSlug(url: string): string {
  try {
    const pathname = new URL(url).pathname.replace(/\/$/, "");
    const parts = pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  } catch {
    return "";
  }
}

interface ParsedUrlBlock {
  url: string;
  lastmod?: string;
}

/**
 * Parses all <url> blocks from a sitemap XML and extracts loc + lastmod pairs.
 * Falls back to simple <loc> extraction when <url> blocks are not present.
 */
function parseUrlBlocks(xml: string): ParsedUrlBlock[] {
  const blocks: ParsedUrlBlock[] = [];
  // Match each complete <url>...</url> block
  const urlBlockRe = /<url>([\s\S]*?)<\/url>/gi;
  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = urlBlockRe.exec(xml)) !== null) {
    const block = match[1]!;
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    const lastmod = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1]?.trim();
    blocks.push({ url: loc, lastmod: lastmod || undefined });
  }
  return blocks;
}

function matchAllLocs(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) out.push(m[1]!);
  return out;
}

async function fetchSingleSitemap(
  sitemapUrl: string,
  domain: string,
  f: typeof fetch
): Promise<SitemapEntry[]> {
  // SSRF-guarded + timed out: `domain` is tenant config and the recursed <loc>
  // URLs below are fully controlled by the remote sitemap.
  const res = await guardedFetch(sitemapUrl, f);
  if (!res.ok) throw new Error(`sitemap fetch failed for ${sitemapUrl}: ${res.status}`);
  const xml = await readCappedText(res, sitemapUrl);

  const isIndex = /<sitemapindex/i.test(xml);

  if (!isIndex) {
    const blocks = parseUrlBlocks(xml);
    return blocks.map(({ url, lastmod }) => ({
      url,
      slug: extractSlug(url),
      lastmod,
      competitor_domain: domain,
    }));
  }

  // Sitemap index: recurse into sub-sitemaps (bounded).
  const allLocs = matchAllLocs(xml);
  const postSitemaps = allLocs.filter((u) => /post|page|article/i.test(u));
  const targets = (postSitemaps.length > 0 ? postSitemaps : allLocs).slice(0, MAX_SUB_SITEMAPS);
  const entries: SitemapEntry[] = [];

  for (const sm of targets) {
    if (entries.length >= MAX_ENTRIES_PER_DOMAIN) break;
    try {
      const r = await guardedFetch(sm, f);
      if (!r.ok) continue;
      const subXml = await readCappedText(r, sm);
      const blocks = parseUrlBlocks(subXml);
      for (const { url, lastmod } of blocks) {
        if (entries.length >= MAX_ENTRIES_PER_DOMAIN) break;
        entries.push({
          url,
          slug: extractSlug(url),
          lastmod,
          competitor_domain: domain,
        });
      }
    } catch {
      // skip failing sub-sitemaps
    }
  }

  return entries;
}

/**
 * Fetches sitemap.xml for each domain in `input.domains`.
 * Returns all discovered entries with `competitor_domain` set.
 * Network failures per domain are silently skipped (caller gets partial results).
 */
export async function fetchCompetitorSitemaps(
  input: CompetitorSitemapInput
): Promise<SitemapEntry[]> {
  const f = input.fetchImpl ?? globalThis.fetch;
  const results: SitemapEntry[] = [];

  for (const domain of input.domains) {
    const sitemapUrl = `https://${domain}/sitemap.xml`;
    try {
      const entries = await fetchSingleSitemap(sitemapUrl, domain, f);
      results.push(...entries);
    } catch {
      // skip failing domains — caller receives partial results
    }
  }

  return results;
}

/**
 * Returns entries in `current` that are not present in `previousSnapshot`
 * (matched by URL).
 */
export function diffNewEntries(input: SnapshotDiffInput): SitemapEntry[] {
  const previous = input.previousSnapshot ?? [];
  const previousUrls = new Set(previous.map((e) => e.url));
  return input.current.filter((e) => !previousUrls.has(e.url));
}
