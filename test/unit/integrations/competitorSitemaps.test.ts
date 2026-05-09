import { describe, expect, it, vi } from "vitest";
import {
  fetchCompetitorSitemaps,
  diffNewEntries,
  type SitemapEntry,
} from "@/integrations/competitorSitemaps";

// ---------------------------------------------------------------------------
// Fixture XML
// ---------------------------------------------------------------------------

const SIMPLE_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://competitor.nl/ai-tools/</loc>
    <lastmod>2026-04-01</lastmod>
  </url>
  <url>
    <loc>https://competitor.nl/chatgpt-voor-mkb/</loc>
    <lastmod>2026-04-15</lastmod>
  </url>
</urlset>`;

const INDEX_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://competitor.nl/post-sitemap.xml</loc>
  </sitemap>
</sitemapindex>`;

const POST_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://competitor.nl/post-one/</loc>
    <lastmod>2026-05-01</lastmod>
  </url>
  <url>
    <loc>https://competitor.nl/post-two/</loc>
  </url>
</urlset>`;

// ---------------------------------------------------------------------------
// Helper: build mock fetch
// ---------------------------------------------------------------------------

function makeFetch(map: Record<string, { ok: boolean; text: string }>): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const key = url.toString();
    const entry = map[key];
    if (!entry) return { ok: false, status: 404, text: async () => "" } as unknown as Response;
    return { ok: entry.ok, status: entry.ok ? 200 : 500, text: async () => entry.text } as unknown as Response;
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Tests: fetchCompetitorSitemaps
// ---------------------------------------------------------------------------

describe("fetchCompetitorSitemaps", () => {
  it("fetches and parses simple (non-index) sitemap", async () => {
    const fetchImpl = makeFetch({
      "https://competitor.nl/sitemap.xml": { ok: true, text: SIMPLE_SITEMAP_XML },
    });

    const entries = await fetchCompetitorSitemaps({
      domains: ["competitor.nl"],
      fetchImpl,
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      url: "https://competitor.nl/ai-tools/",
      slug: "ai-tools",
      lastmod: "2026-04-01",
      competitor_domain: "competitor.nl",
    });
    expect(entries[1]).toMatchObject({
      url: "https://competitor.nl/chatgpt-voor-mkb/",
      slug: "chatgpt-voor-mkb",
      lastmod: "2026-04-15",
      competitor_domain: "competitor.nl",
    });
  });

  it("follows sitemap index and parses sub-sitemaps", async () => {
    const fetchImpl = makeFetch({
      "https://competitor.nl/sitemap.xml": { ok: true, text: INDEX_SITEMAP_XML },
      "https://competitor.nl/post-sitemap.xml": { ok: true, text: POST_SITEMAP_XML },
    });

    const entries = await fetchCompetitorSitemaps({
      domains: ["competitor.nl"],
      fetchImpl,
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      url: "https://competitor.nl/post-one/",
      slug: "post-one",
      lastmod: "2026-05-01",
      competitor_domain: "competitor.nl",
    });
    expect(entries[1]).toMatchObject({
      url: "https://competitor.nl/post-two/",
      slug: "post-two",
      competitor_domain: "competitor.nl",
    });
    expect(entries[1]!.lastmod).toBeUndefined();
  });

  it("handles multiple domains — concatenates results", async () => {
    const fetchImpl = makeFetch({
      "https://a.nl/sitemap.xml": { ok: true, text: `<urlset><url><loc>https://a.nl/page-a/</loc></url></urlset>` },
      "https://b.nl/sitemap.xml": { ok: true, text: `<urlset><url><loc>https://b.nl/page-b/</loc></url></urlset>` },
    });

    const entries = await fetchCompetitorSitemaps({
      domains: ["a.nl", "b.nl"],
      fetchImpl,
    });

    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.competitor_domain === "a.nl")).toBeDefined();
    expect(entries.find((e) => e.competitor_domain === "b.nl")).toBeDefined();
  });

  it("silently skips a domain that returns a network error", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (url: string | URL | Request) => {
      if (url.toString().includes("broken.nl")) throw new Error("ECONNREFUSED");
      return { ok: true, status: 200, text: async () => SIMPLE_SITEMAP_XML } as unknown as Response;
    }) as unknown as typeof fetch;

    const entries = await fetchCompetitorSitemaps({
      domains: ["broken.nl", "competitor.nl"],
      fetchImpl,
    });

    // broken.nl skipped, competitor.nl succeeds
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.competitor_domain === "competitor.nl")).toBe(true);
  });

  it("returns empty array when all domains fail", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => {
      throw new Error("network error");
    }) as unknown as typeof fetch;

    const entries = await fetchCompetitorSitemaps({
      domains: ["a.nl", "b.nl"],
      fetchImpl,
    });

    expect(entries).toHaveLength(0);
  });

  it("returns empty array for empty domains list", async () => {
    const fetchImpl = makeFetch({});

    const entries = await fetchCompetitorSitemaps({ domains: [], fetchImpl });
    expect(entries).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: diffNewEntries
// ---------------------------------------------------------------------------

describe("diffNewEntries", () => {
  const makeEntry = (url: string, domain = "comp.nl"): SitemapEntry => ({
    url,
    slug: url.split("/").filter(Boolean).pop() ?? "",
    competitor_domain: domain,
  });

  it("returns all current entries when no previous snapshot exists", () => {
    const current = [makeEntry("https://comp.nl/a/"), makeEntry("https://comp.nl/b/")];
    const result = diffNewEntries({ current });
    expect(result).toHaveLength(2);
  });

  it("returns only entries not in previous snapshot (matched by URL)", () => {
    const current = [
      makeEntry("https://comp.nl/a/"),
      makeEntry("https://comp.nl/b/"),
      makeEntry("https://comp.nl/c/"),
    ];
    const previousSnapshot = [makeEntry("https://comp.nl/a/"), makeEntry("https://comp.nl/b/")];

    const result = diffNewEntries({ current, previousSnapshot });
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBe("https://comp.nl/c/");
  });

  it("returns empty array when current is empty", () => {
    const result = diffNewEntries({ current: [], previousSnapshot: [] });
    expect(result).toHaveLength(0);
  });

  it("returns empty array when all current entries are in previous snapshot", () => {
    const entries = [makeEntry("https://comp.nl/a/"), makeEntry("https://comp.nl/b/")];
    const result = diffNewEntries({ current: entries, previousSnapshot: entries });
    expect(result).toHaveLength(0);
  });

  it("matches strictly by URL — same slug on different domain is a new entry", () => {
    const current = [makeEntry("https://comp-b.nl/ai-tools/", "comp-b.nl")];
    const previousSnapshot = [makeEntry("https://comp-a.nl/ai-tools/", "comp-a.nl")];

    const result = diffNewEntries({ current, previousSnapshot });
    expect(result).toHaveLength(1);
  });
});
