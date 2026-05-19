export interface CitationCheckInput {
  urls: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface CitationCheckResult {
  total: number;
  alive: number;
  dead: { url: string; reason: string }[];
  deadRatio: number; // 0-1
}

// Soft-404 detection: server returns 200 but the page is actually a
// "page not found" CMS template. Common at Wolters Kluwer, big news sites,
// SaaS-marketing sites. Two signals:
//   1) The post-redirect URL contains a known 404-path marker.
//   2) The <title> contains a "not found" phrase.
// We check #1 cheaply (no body read needed) and #2 by reading the first
// ~10 KB and matching against a phrase list. Both checks are language-aware
// (NL + EN cover ~95% of relevant cases).
const SOFT404_PATH_PATTERN = /\/(404|error|not[-_]?found|page-not-found|pagina-niet-gevonden)(?:[\/?#]|$)/i;
const SOFT404_TITLE_PATTERN =
  /(404\s+pagina|pagina\s+niet\s+gevonden|niet\s+gevonden|404\s+error|page\s+not\s+found|not\s+found\s+\|)/i;

async function detectSoftNotFound(res: Response): Promise<boolean> {
  // Use final URL after redirects when available (browser-ish runtimes set this).
  if (res.url && SOFT404_PATH_PATTERN.test(res.url)) return true;

  // Skip body read for non-HTML responses (PDFs, images, JSON-only APIs).
  const ct = res.headers.get("content-type") ?? "";
  if (ct && !/text\/html|application\/xhtml/i.test(ct)) return false;

  try {
    // Read only the first ~10 KB — enough to capture <title> on virtually
    // every CMS, cheap enough to not hurt the citation-check budget.
    const text = await res.text();
    const head = text.slice(0, 10_000);
    const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1] ?? "";
      if (SOFT404_TITLE_PATTERN.test(title)) return true;
    }
  } catch {
    // Body read failed (rare). Fall through to alive — don't false-positive.
  }
  return false;
}

export async function checkCitations(input: CitationCheckInput): Promise<CitationCheckResult> {
  const fetchFn = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 5000;
  const urls = [...new Set(input.urls)]; // deduplicate

  const dead: { url: string; reason: string }[] = [];

  await Promise.all(
    urls.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        // Browser-UA: EU/gov-sites (ec.europa.eu, autoriteitpersoonsgegevens.nl, kvk.nl)
        // weigeren default undici-UA en geven 403/406. Zelfde fix-familie als
        // WordpressClient (commit 65fcbd3) en sitemap-fetcher (commit 4150be2).
        // GET ipv HEAD: veel gov-sites returnen 405 op HEAD; GET is universeel
        // ondersteund en de body wordt niet gelezen (we kijken alleen status).
        const res = await fetchFn(url, {
          method: "GET",
          signal: controller.signal,
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; ArtifationBlogBot/1.0; +https://artifation.nl)",
            Accept: "text/html, */*",
          },
        });
        if (res.status >= 400) {
          dead.push({ url, reason: `status:${res.status}` });
        } else if (res.status >= 200 && res.status < 400) {
          // Soft-404 check on 2xx/3xx responses (some redirects land on
          // generic 404 templates that still return 200).
          const isSoft404 = await detectSoftNotFound(res);
          if (isSoft404) dead.push({ url, reason: "status:soft404" });
        }
        // 200-399 + not soft-404 = alive
      } catch (err: unknown) {
        if (
          (err instanceof Error && err.name === "AbortError") ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          dead.push({ url, reason: "timeout" });
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          dead.push({ url, reason: `network:${msg}` });
        }
      } finally {
        clearTimeout(timer);
      }
    })
  );

  const total = urls.length;
  const alive = total - dead.length;
  const deadRatio = total > 0 ? dead.length / total : 0;

  return { total, alive, dead, deadRatio };
}

export function enrichSignalsWithCitationCheck<T extends object>(
  signals: T,
  citationResult: CitationCheckResult
): T & { dead_external_link_count: number; external_link_check_total: number } {
  return {
    ...signals,
    dead_external_link_count: citationResult.dead.length,
    external_link_check_total: citationResult.total,
  };
}
