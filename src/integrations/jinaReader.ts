/**
 * Jina Reader (https://jina.ai/reader) — gratis crawler die elke URL omzet
 * naar schone markdown via `r.jina.ai/<url>`. Vervangt de FireCrawl-rol uit
 * de vorige blogtool zonder kosten of API-account (anonymous tier is gratis;
 * authenticated tier voor hogere rate-limits via `apiKey`).
 *
 * Response-envelope ziet er zo uit (plain text):
 *   Title: <title>
 *   URL Source: <resolved url>
 *   Markdown Content:
 *   <markdown body...>
 */

export interface ReadPageInput {
  url: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface ReadPageResult {
  url: string;
  title: string;
  markdown: string;
  links: string[];
}

const JINA_BASE = "https://r.jina.ai/";

function buildEndpoint(url: string): string {
  return `${JINA_BASE}${url}`;
}

function parseEnvelope(body: string, requestedUrl: string): ReadPageResult {
  const titleMatch = body.match(/^Title:\s*(.+)$/m);
  const urlMatch = body.match(/^URL Source:\s*(.+)$/m);
  const markdownMarker = body.indexOf("Markdown Content:");

  if (titleMatch === null && urlMatch === null && markdownMarker === -1) {
    return { url: requestedUrl, title: "", markdown: body.trim(), links: [] };
  }

  const title = titleMatch?.[1]?.trim() ?? "";
  // Anchor link-resolution against the URL Jina actually fetched (handles
  // redirects); but report the requested URL so callers can correlate with
  // their input list.
  const linkBase = urlMatch?.[1]?.trim() ?? requestedUrl;
  const markdown =
    markdownMarker === -1
      ? body.trim()
      : body.slice(markdownMarker + "Markdown Content:".length).trim();

  return { url: requestedUrl, title, markdown, links: extractLinks(markdown, linkBase) };
}

/**
 * Extract absolute URLs from markdown link syntax `[text](href)`. Relative
 * hrefs are resolved against `baseUrl`; anchors and mailto/tel are skipped.
 */
function extractLinks(markdown: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const re = /\[[^\]]*\]\(([^)\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const href = m[1]!;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const abs = new URL(href, baseUrl).toString();
      out.add(abs);
    } catch {
      // skip malformed hrefs
    }
  }
  return [...out];
}

export async function readPage(input: ReadPageInput): Promise<ReadPageResult> {
  const f = input.fetchImpl ?? globalThis.fetch;
  const endpoint = buildEndpoint(input.url);

  const headers: Record<string, string> = { Accept: "text/plain" };
  if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`;

  const res = await f(endpoint, {
    headers,
    // r.jina.ai proxies arbitrary third-party pages that can hang — bound it.
    signal: input.signal ?? AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Jina Reader fetch failed for ${input.url}: ${res.status}`);
  }

  const body = await res.text();
  return parseEnvelope(body, input.url);
}

export interface ReadPagesInput {
  urls: string[];
  apiKey?: string;
  concurrency?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Fetch many URLs with bounded concurrency. Failures are silently skipped
 * (results may be shorter than `urls`). Order of results matches input order
 * for successful fetches.
 */
export async function readPages(input: ReadPagesInput): Promise<ReadPageResult[]> {
  const concurrency = Math.max(1, input.concurrency ?? 3);
  const results: (ReadPageResult | null)[] = new Array(input.urls.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= input.urls.length) return;
      const url = input.urls[idx]!;
      try {
        results[idx] = await readPage({
          url,
          apiKey: input.apiKey,
          fetchImpl: input.fetchImpl,
          signal: input.signal,
        });
      } catch {
        results[idx] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, input.urls.length) }, () => worker());
  await Promise.all(workers);

  return results.filter((r): r is ReadPageResult => r !== null);
}
