"use server";

import { requireSite } from "~/lib/auth";
import { createProviderRegistry } from "@/llm/client";
import { runAuditor, type AuditorOutput } from "@/agents/auditor";
import { computeDeterministicRubricSignals } from "@/pipeline/rubric";
import {
  analyzeHeadings,
  analyzeSentences,
  countPassiveVoiceNL,
  estimateReadingTimeMinutes,
  countQuestions,
} from "@/pipeline/auditSignals";

export interface AuditResultView {
  scores: AuditorOutput["scores"];
  weightedTotal: number;
  issues: AuditorOutput["issues"];
  summary: string;
  fixFirst: string[];
  improvedVersion: string | null;
  deterministic: {
    wordCount: number;
    banlistHits: number;
    banlistHitsPer1000Words: number;
    emdashCount: number;
    emdashPer1000Words: number;
    keywordDensityPct: number;
    fleschNlScore: number;
    hasTldrBlock: boolean;
    hasCta: boolean;
    internalLinkCount: number;
    externalLinkCount: number;
    readingTimeMinutes: number;
    questionCount: number;
    passiveVoiceCount: number;
    headings: {
      counts: { h1: number; h2: number; h3: number; h4: number };
      issues: string[];
    };
    sentences: {
      count: number;
      avgWords: number;
      medianWords: number;
      maxWords: number;
      percentOver25Words: number;
      longSentences: { sentence: string; wordCount: number }[];
    };
  };
}

export async function auditBlogAction(input: {
  html: string;
  targetKeyword: string;
}): Promise<{ ok: true; result: AuditResultView } | { ok: false; error: string }> {
  if (!input.html.trim()) {
    return { ok: false, error: "Plak eerst je blog-tekst." };
  }
  if (!input.targetKeyword.trim()) {
    return { ok: false, error: "Geef een target keyword op." };
  }

  const site = await requireSite();
  const key = site.apiKeys?.gemini ?? site.apiKeys?.anthropic;
  if (!key) {
    return { ok: false, error: "API-key ontbreekt — vul Gemini of Anthropic in onder Instellingen." };
  }

  const env = { ...process.env };
  if (site.apiKeys?.gemini) env.GEMINI_API_KEY = site.apiKeys.gemini;
  if (site.apiKeys?.anthropic) env.ANTHROPIC_API_KEY = site.apiKeys.anthropic;
  const providers = createProviderRegistry(env);

  // Wrap in <article> so user can paste plain HTML body or plain text;
  // the deterministic rubric expects HTML-ish input.
  const html = input.html.trim().startsWith("<") ? input.html : `<article>${escapeMinimal(input.html)}</article>`;

  // Deterministic signals are computed locally — fast, free, instant.
  const det = computeDeterministicRubricSignals({
    html,
    banList: site.banList,
    targetKeyword: input.targetKeyword,
    internalUrls: [`https://${site.domain}`],
  });

  const headings = analyzeHeadings(html);
  const sentences = analyzeSentences(html);
  const passiveCount = countPassiveVoiceNL(html);
  const readingTime = estimateReadingTimeMinutes(det.word_count);
  const questionCount = countQuestions(html);

  // LLM audit for the qualitative bits (brand voice, originality, structure
  // critique with quoted spans).
  let agent: AuditorOutput;
  try {
    const res = await runAuditor(
      {
        html,
        target_keyword: input.targetKeyword,
        brand_voice: site.brandVoice,
        ban_list: site.banList,
      },
      { provider: providers.get(site.apiKeys?.gemini ? "gemini" : "anthropic") }
    );
    agent = res.parsed;
  } catch (err) {
    return { ok: false, error: `Auditor mislukte: ${(err as Error).message}` };
  }

  return {
    ok: true,
    result: {
      scores: agent.scores,
      weightedTotal: agent.weighted_total,
      issues: agent.issues,
      summary: agent.summary,
      fixFirst: agent.fix_first ?? [],
      improvedVersion: agent.improved_version ?? null,
      deterministic: {
        wordCount: det.word_count,
        banlistHits: det.banlist_hits,
        banlistHitsPer1000Words: det.banlist_hits_per_1000_words,
        emdashCount: det.emdash_count,
        emdashPer1000Words: det.emdash_per_1000_words,
        keywordDensityPct: det.keyword_density_pct,
        fleschNlScore: det.flesch_nl_score,
        hasTldrBlock: det.has_tldr_block,
        hasCta: det.has_cta,
        internalLinkCount: det.internal_link_count,
        externalLinkCount: det.external_link_count,
        readingTimeMinutes: readingTime,
        questionCount,
        passiveVoiceCount: passiveCount,
        headings: { counts: headings.counts, issues: headings.issues },
        sentences: {
          count: sentences.count,
          avgWords: sentences.avgWords,
          medianWords: sentences.medianWords,
          maxWords: sentences.maxWords,
          percentOver25Words: sentences.percentOver25Words,
          longSentences: sentences.longSentences,
        },
      },
    },
  };
}

function escapeMinimal(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
