import { describe, expect, it } from "vitest";
import { stripDeadLinks, extractExternalHrefs, filterDefinitivelyDead } from "@/pipeline/stripDeadLinks";

describe("extractExternalHrefs", () => {
  it("extracts http(s) hrefs from anchor tags", () => {
    const html =
      "<p>Zie <a href='https://example.com/a'>A</a> en <a href=\"https://other.nl/b\">B</a>.</p>";
    expect(extractExternalHrefs(html).sort()).toEqual([
      "https://example.com/a",
      "https://other.nl/b",
    ]);
  });

  it("skips relative + anchor + mailto + tel links", () => {
    const html =
      "<a href='/internal'>x</a><a href='#section'>y</a><a href='mailto:a@b'>z</a><a href='tel:123'>q</a>";
    expect(extractExternalHrefs(html)).toEqual([]);
  });

  it("deduplicates identical hrefs", () => {
    const html = "<a href='https://x.nl/a'>1</a><a href='https://x.nl/a'>2</a>";
    expect(extractExternalHrefs(html)).toEqual(["https://x.nl/a"]);
  });
});

describe("stripDeadLinks", () => {
  it("replaces dead-href anchors with plain text, keeping anchor body", () => {
    const html = "<p>Zie <a href='https://dead.example/x'>de gids</a> voor meer.</p>";
    const out = stripDeadLinks(html, new Set(["https://dead.example/x"]));
    expect(out).toBe("<p>Zie de gids voor meer.</p>");
  });

  it("keeps anchors whose href is NOT in the dead set", () => {
    const html =
      "<a href='https://alive.example/a'>alive</a> <a href='https://dead.example/b'>dead</a>";
    const out = stripDeadLinks(html, new Set(["https://dead.example/b"]));
    expect(out).toContain("<a href='https://alive.example/a'>alive</a>");
    expect(out).toContain("dead");
    expect(out).not.toContain("https://dead.example/b");
  });

  it("handles anchors with extra attributes (target, rel, title)", () => {
    const html =
      `<a href="https://dead.example/x" target="_blank" rel="noopener" title="Click">Article title</a>`;
    const out = stripDeadLinks(html, new Set(["https://dead.example/x"]));
    expect(out).toBe("Article title");
  });

  it("keeps anchor body even when it contains nested HTML (strong, em)", () => {
    const html = "<a href='https://dead.example/x'><strong>belangrijk</strong></a>";
    const out = stripDeadLinks(html, new Set(["https://dead.example/x"]));
    expect(out).toBe("<strong>belangrijk</strong>");
  });

  it("is a no-op when no anchors match the dead set", () => {
    const html = "<p>Geen links hier <a href='https://alive.example/a'>maar wel een</a>.</p>";
    const out = stripDeadLinks(html, new Set(["https://other.example/x"]));
    expect(out).toBe(html);
  });

  it("matches URLs with single OR double quotes consistently", () => {
    const html =
      "<a href='https://dead.example/x'>A</a><a href=\"https://dead.example/x\">B</a>";
    const out = stripDeadLinks(html, new Set(["https://dead.example/x"]));
    expect(out).toBe("AB");
  });

  it("returns empty deadSet input unchanged", () => {
    const html = "<a href='https://x.nl/a'>x</a>";
    expect(stripDeadLinks(html, new Set())).toBe(html);
  });
});

describe("filterDefinitivelyDead", () => {
  it("keeps status:404 and status:410", () => {
    const dead = [
      { url: "https://a", reason: "status:404" },
      { url: "https://b", reason: "status:410" },
    ];
    expect(filterDefinitivelyDead(dead).map((d) => d.url)).toEqual([
      "https://a",
      "https://b",
    ]);
  });

  it("keeps status:soft404", () => {
    const dead = [{ url: "https://wk.com/page", reason: "status:soft404" }];
    expect(filterDefinitivelyDead(dead)).toHaveLength(1);
  });

  it("filters out WAF-blocked codes (403, 429)", () => {
    const dead = [
      { url: "https://rvo.nl/x", reason: "status:403" },
      { url: "https://ap.nl/y", reason: "status:429" },
    ];
    expect(filterDefinitivelyDead(dead)).toEqual([]);
  });

  it("filters out 5xx (transient server errors)", () => {
    const dead = [
      { url: "https://x", reason: "status:500" },
      { url: "https://y", reason: "status:503" },
    ];
    expect(filterDefinitivelyDead(dead)).toEqual([]);
  });

  it("filters out timeouts and network errors", () => {
    const dead = [
      { url: "https://slow", reason: "timeout" },
      { url: "https://offline", reason: "network:ECONNREFUSED" },
    ];
    expect(filterDefinitivelyDead(dead)).toEqual([]);
  });

  it("preserves only the definitively-dead from a mixed batch", () => {
    const dead = [
      { url: "https://real-404", reason: "status:404" },
      { url: "https://soft", reason: "status:soft404" },
      { url: "https://waf-block", reason: "status:403" },
      { url: "https://slow", reason: "timeout" },
      { url: "https://gone", reason: "status:410" },
    ];
    const result = filterDefinitivelyDead(dead);
    expect(result.map((d) => d.url).sort()).toEqual([
      "https://gone",
      "https://real-404",
      "https://soft",
    ]);
  });
});
