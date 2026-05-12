export interface SitemapEntry {
  url: string;
  slug: string;
}

export interface FetchOpts {
  fetch?: typeof fetch;
}

// Realistische browser-UA om Hostinger/Cloudflare WAFs te omzeilen die Node's
// default `undici/x.y.z` User-Agent als bot herkennen en met 403 blokkeren.
const FETCH_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (compatible; ArtifationBlogBot/1.0; +https://artifation.nl)",
  Accept: "application/xml, text/xml, */*",
};

export async function fetchSitemapEntries(
  rootUrl: string,
  opts: FetchOpts = {}
): Promise<SitemapEntry[]> {
  const f = opts.fetch ?? globalThis.fetch;
  const indexRes = await f(rootUrl, { headers: FETCH_HEADERS });
  if (!indexRes.ok) throw new Error(`sitemap fetch failed: ${indexRes.status}`);
  const indexXml = await indexRes.text();

  const allLocs = matchAll(indexXml, /<loc>([^<]+)<\/loc>/g);
  const isIndex = /<sitemapindex/i.test(indexXml);

  if (!isIndex) {
    return allLocs.map((url) => ({ url, slug: extractSlug(url) }));
  }

  const postSitemaps = allLocs.filter((u) => u.includes("post"));
  const targets = postSitemaps.length > 0 ? postSitemaps : allLocs;
  const entries: SitemapEntry[] = [];
  for (const sm of targets) {
    const r = await f(sm, { headers: FETCH_HEADERS });
    if (!r.ok) continue;
    const xml = await r.text();
    for (const url of matchAll(xml, /<loc>([^<]+)<\/loc>/g)) {
      entries.push({ url, slug: extractSlug(url) });
    }
  }
  return entries;
}

function extractSlug(url: string): string {
  const path = new URL(url).pathname.replace(/\/$/, "");
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function matchAll(s: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(re)) out.push(m[1]!);
  return out;
}
