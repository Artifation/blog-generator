/**
 * AI-crawler robots.txt strategy generator.
 *
 * Generates a robots.txt snippet (User-agent + Allow/Disallow per crawler,
 * plus a Sitemap directive) based on tenant configuration.
 *
 * Note: ClaudeBot (training crawler) is distinct from Anthropic's search
 * variant — blocking ClaudeBot does NOT affect Anthropic's retrieval crawler.
 *
 * Strategy for Artifation defaults:
 *   - Block training crawlers (GPTBot, ClaudeBot, Google-Extended,
 *     Applebot-Extended, Meta-ExternalAgent) — protect training data.
 *   - Allow retrieval/search crawlers (OAI-SearchBot, PerplexityBot) —
 *     maximise AI-search visibility.
 */

export interface RobotsTxtInput {
  ai_crawlers: Record<string, "allow" | "block">;
  sitemapUrl?: string;
}

/**
 * Generates a robots.txt snippet for AI crawlers.
 *
 * Each crawler gets its own User-agent stanza. Blocked crawlers receive
 * `Disallow: /`; allowed crawlers receive `Allow: /`.
 * If sitemapUrl is provided, a `Sitemap:` directive is appended at the end.
 */
export function generateRobotsTxt(input: RobotsTxtInput): string {
  const entries = Object.entries(input.ai_crawlers ?? {});
  if (entries.length === 0 && !input.sitemapUrl) return "";

  const lines: string[] = [];

  for (const [crawler, policy] of entries) {
    if (lines.length > 0) lines.push("");
    lines.push(`User-agent: ${crawler}`);
    if (policy === "block") {
      lines.push("Disallow: /");
    } else {
      lines.push("Allow: /");
    }
  }

  if (input.sitemapUrl) {
    if (lines.length > 0) lines.push("");
    lines.push(`Sitemap: ${input.sitemapUrl}`);
  }

  return lines.join("\n") + "\n";
}
