import { parse as parseHtml } from "node-html-parser";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface AnchorHistoryEntry {
  target_url: string;
  exact_match_anchors: Record<string, number>;  // anchor → count
  partial_match_anchors: Record<string, number>;
}

export interface AnchorTrackerInput {
  publishedPostUrls: string[];
  fetchImpl?: typeof fetch;
}

export interface OvertusedAnchorsInput {
  history: AnchorHistoryEntry[];
  threshold: number;  // e.g. 3
}

/**
 * Fetches each published post URL, parses all <a href="..."> tags,
 * and counts how many times each anchor text is used as exact-match
 * for the target URL's slug.
 *
 * Exact-match = anchor text contains the target URL's slug (lowercased, dashes → spaces).
 */
export async function buildAnchorHistory(
  input: AnchorTrackerInput
): Promise<AnchorHistoryEntry[]> {
  const f = input.fetchImpl ?? globalThis.fetch;
  const historyMap = new Map<string, AnchorHistoryEntry>();

  // Initialize an entry for every published URL
  for (const url of input.publishedPostUrls) {
    historyMap.set(url, {
      target_url: url,
      exact_match_anchors: {},
      partial_match_anchors: {},
    });
  }

  // For each published post, fetch HTML and extract all outgoing links
  for (const postUrl of input.publishedPostUrls) {
    let html: string;
    try {
      const res = await f(postUrl);
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }

    const root = parseHtml(html);
    const links = root.querySelectorAll("a[href]");

    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      const anchorText = link.text.trim().toLowerCase();
      if (!anchorText) continue;

      // Normalize href to see if it refers to one of our tracked URLs
      const normalizedHref = href.replace(/\/+$/, "");
      for (const targetUrl of input.publishedPostUrls) {
        if (targetUrl === postUrl) continue; // skip self-links
        const normalizedTarget = targetUrl.replace(/\/+$/, "");
        if (!normalizedHref.includes(normalizedTarget) && !normalizedTarget.endsWith(normalizedHref)) continue;
        if (normalizedHref !== normalizedTarget && !normalizedHref.includes(normalizedTarget)) continue;

        const entry = historyMap.get(targetUrl)!;
        const slug = extractSlug(targetUrl);
        const slugWords = slug.replace(/-/g, " ").toLowerCase();

        if (anchorText.includes(slugWords) || slugWords.includes(anchorText)) {
          // exact match
          entry.exact_match_anchors[anchorText] = (entry.exact_match_anchors[anchorText] ?? 0) + 1;
        } else {
          // partial/other — tracked but separate
          entry.partial_match_anchors[anchorText] = (entry.partial_match_anchors[anchorText] ?? 0) + 1;
        }
      }
    }
  }

  return Array.from(historyMap.values());
}

export function findOvertusedAnchors(
  input: OvertusedAnchorsInput
): { url: string; anchor: string; count: number }[] {
  const results: { url: string; anchor: string; count: number }[] = [];
  for (const entry of input.history) {
    for (const [anchor, count] of Object.entries(entry.exact_match_anchors)) {
      if (count >= input.threshold) {
        results.push({ url: entry.target_url, anchor, count });
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

interface CacheFile {
  built_at: string;
  entries: AnchorHistoryEntry[];
}

export async function loadCachedAnchorHistory(
  cacheFilePath: string,
  ttlHours: number
): Promise<AnchorHistoryEntry[] | null> {
  try {
    const raw = await readFile(cacheFilePath, "utf-8");
    const cache: CacheFile = JSON.parse(raw);
    const builtAt = new Date(cache.built_at).getTime();
    const ageMs = Date.now() - builtAt;
    if (ageMs < ttlHours * 3_600_000) {
      return cache.entries;
    }
    return null; // stale
  } catch {
    return null; // file doesn't exist or is corrupt
  }
}

export async function saveCachedAnchorHistory(
  cacheFilePath: string,
  entries: AnchorHistoryEntry[]
): Promise<void> {
  await mkdir(path.dirname(cacheFilePath), { recursive: true });
  const cache: CacheFile = { built_at: new Date().toISOString(), entries };
  await writeFile(cacheFilePath, JSON.stringify(cache, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function extractSlug(url: string): string {
  try {
    const p = new URL(url).pathname.replace(/\/$/, "");
    const parts = p.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  } catch {
    return "";
  }
}
