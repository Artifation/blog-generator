import { computeFleschNL } from "./readingLevel.ts";

export interface RubricSignalsInput {
  html: string;
  banList: string[];
  targetKeyword: string;
  internalUrls: string[];
}

export interface RubricSignals {
  word_count: number;
  banlist_hits: number;
  banlist_hits_per_1000_words: number;
  emdash_count: number;
  emdash_per_1000_words: number;
  internal_link_count: number;
  external_link_count: number;
  keyword_density_pct: number;
  has_tldr_block: boolean;
  has_cta: boolean;
  paragraph_length_variance: number;
  has_article_schema: boolean;
  has_breadcrumb_schema: boolean;
  has_person_schema: boolean;
  dead_external_link_count: number;
  external_link_check_total: number;
  flesch_nl_score: number;
}

export function computeDeterministicRubricSignals(input: RubricSignalsInput): RubricSignals {
  const text = stripHtml(input.html);
  const words = text.split(/\s+/).filter(Boolean);
  const wc = words.length;

  const lowerText = text.toLowerCase();
  const lowerKw = input.targetKeyword.toLowerCase();

  const banlistHits = input.banList.reduce(
    (sum, b) => sum + countOccurrences(lowerText, b.toLowerCase()),
    0
  );

  const emdashCount = (input.html.match(/—/g) || []).length;

  const allLinks = [...input.html.matchAll(/<a\s+[^>]*href="([^"]+)"/gi)].map((m) => m[1]!);
  const internalLinkCount = allLinks.filter((u) =>
    input.internalUrls.some((iu) => u.startsWith(iu) || u === iu)
  ).length;
  const externalLinkCount = allLinks.length - internalLinkCount;

  const kwOccurrences = countOccurrences(lowerText, lowerKw);
  const keywordDensityPct =
    wc > 0 ? (kwOccurrences * lowerKw.split(/\s+/).length * 100) / wc : 0;

  const hasTldr = /<div[^>]*class=["'][^"']*tldr[^"']*["']/i.test(input.html);
  const hasCta = /\/ai-scan\//.test(input.html) || /\/contact\//.test(input.html);

  const paragraphs = [...input.html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(
    (m) => stripHtml(m[1]!).split(/\s+/).filter(Boolean).length
  );
  const variance = paragraphs.length > 1 ? stdev(paragraphs) : 0;

  const hasArticleSchema = /"@type"\s*:\s*"(?:Article|BlogPosting)"/.test(input.html);
  const hasBreadcrumbSchema = /"@type"\s*:\s*"BreadcrumbList"/.test(input.html);
  const hasPersonSchema = /"@type"\s*:\s*"Person"/.test(input.html);

  return {
    word_count: wc,
    banlist_hits: banlistHits,
    banlist_hits_per_1000_words: wc > 0 ? (banlistHits * 1000) / wc : 0,
    emdash_count: emdashCount,
    emdash_per_1000_words: wc > 0 ? (emdashCount * 1000) / wc : 0,
    internal_link_count: internalLinkCount,
    external_link_count: externalLinkCount,
    keyword_density_pct: keywordDensityPct,
    has_tldr_block: hasTldr,
    has_cta: hasCta,
    paragraph_length_variance: variance,
    has_article_schema: hasArticleSchema,
    has_breadcrumb_schema: hasBreadcrumbSchema,
    has_person_schema: hasPersonSchema,
    dead_external_link_count: 0,
    external_link_check_total: 0,
    flesch_nl_score: computeFleschNL(text),
  };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let i = 0;
  let count = 0;
  while (true) {
    const idx = haystack.indexOf(needle, i);
    if (idx === -1) return count;
    count++;
    i = idx + needle.length;
  }
}

function stdev(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sq = arr.map((x) => (x - mean) ** 2);
  return Math.sqrt(sq.reduce((a, b) => a + b, 0) / arr.length);
}
