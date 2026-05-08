import { describe, expect, it, vi } from "vitest";
import { fetchSitemapEntries } from "@/pipeline/sitemap";

describe("fetchSitemapEntries", () => {
  it("parses index + sub-sitemap and returns posts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <sitemapindex>
            <sitemap><loc>https://x.test/post-sitemap.xml</loc></sitemap>
          </sitemapindex>`,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <urlset>
            <url><loc>https://x.test/blog/foo/</loc></url>
            <url><loc>https://x.test/blog/bar/</loc></url>
          </urlset>`,
      } as Response);

    const r = await fetchSitemapEntries("https://x.test/sitemap.xml", {
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(r.map((e) => e.slug)).toEqual(["foo", "bar"]);
  });

  it("falls back to direct urlset when no sub-sitemaps", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <urlset>
          <url><loc>https://x.test/page-a/</loc></url>
        </urlset>`,
    } as Response);

    const r = await fetchSitemapEntries("https://x.test/sitemap.xml", {
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(r).toEqual([{ url: "https://x.test/page-a/", slug: "page-a" }]);
  });
});
