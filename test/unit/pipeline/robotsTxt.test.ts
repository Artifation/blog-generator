import { describe, expect, it } from "vitest";
import { generateRobotsTxt } from "@/pipeline/robotsTxt";

describe("generateRobotsTxt", () => {
  it("generates Disallow for blocked crawlers", () => {
    const result = generateRobotsTxt({
      ai_crawlers: { GPTBot: "block" },
    });
    expect(result).toContain("User-agent: GPTBot");
    expect(result).toContain("Disallow: /");
    expect(result).not.toContain("Allow: /");
  });

  it("generates Allow for allowed crawlers", () => {
    const result = generateRobotsTxt({
      ai_crawlers: { PerplexityBot: "allow" },
    });
    expect(result).toContain("User-agent: PerplexityBot");
    expect(result).toContain("Allow: /");
    expect(result).not.toContain("Disallow: /");
  });

  it("generates separate stanzas for each crawler", () => {
    const result = generateRobotsTxt({
      ai_crawlers: {
        GPTBot: "block",
        PerplexityBot: "allow",
        ClaudeBot: "block",
      },
    });
    expect(result).toContain("User-agent: GPTBot");
    expect(result).toContain("User-agent: PerplexityBot");
    expect(result).toContain("User-agent: ClaudeBot");
  });

  it("appends Sitemap directive when sitemapUrl provided", () => {
    const result = generateRobotsTxt({
      ai_crawlers: { GPTBot: "block" },
      sitemapUrl: "https://artifation.nl/sitemap.xml",
    });
    expect(result).toContain("Sitemap: https://artifation.nl/sitemap.xml");
  });

  it("snapshot — Artifation defaults", () => {
    const result = generateRobotsTxt({
      ai_crawlers: {
        GPTBot: "block",
        "OAI-SearchBot": "allow",
        ClaudeBot: "block",
        PerplexityBot: "allow",
        "Google-Extended": "block",
        "Applebot-Extended": "block",
        "Meta-ExternalAgent": "block",
      },
      sitemapUrl: "https://artifation.nl/sitemap.xml",
    });

    expect(result).toMatchInlineSnapshot(`
"User-agent: GPTBot
Disallow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Disallow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: Meta-ExternalAgent
Disallow: /

Sitemap: https://artifation.nl/sitemap.xml
"
`);
  });

  it("returns empty string when no crawlers and no sitemap", () => {
    const result = generateRobotsTxt({ ai_crawlers: {} });
    expect(result).toBe("");
  });

  it("handles undefined ai_crawlers gracefully", () => {
    const result = generateRobotsTxt({
      ai_crawlers: undefined as unknown as Record<string, "allow" | "block">,
      sitemapUrl: "https://artifation.nl/sitemap.xml",
    });
    expect(result).toContain("Sitemap:");
    expect(result).not.toContain("User-agent:");
  });
});
