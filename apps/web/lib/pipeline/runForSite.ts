import fs from "node:fs/promises";
import path from "node:path";

import { createProviderRegistry } from "@/llm/client";
import { runResearcher } from "@/agents/researcher";
import { runStrategist } from "@/agents/strategist";
import { runWriter } from "@/agents/writer";
import { runSeoEditor } from "@/agents/seoEditor";
import { runFactChecker } from "@/agents/factChecker";
import { runQualityJudge } from "@/agents/qualityJudge";
import { runImagePrompter } from "@/agents/imagePrompter";
import { generateBlogImage } from "@/image";
import { optimizeForWeb } from "@/image/optimize";

import { postProcessDraftHtml } from "@/pipeline/htmlPostProcess";
import { computeDeterministicRubricSignals } from "@/pipeline/rubric";
import { checkCitations, enrichSignalsWithCitationCheck } from "@/pipeline/citationCheck";
import { filterDeadResearchUrls } from "@/pipeline/researchUrlFilter";
import { computeRunCost, type UsageEntry } from "@/pipeline/costTracker";

import type { Site, Topic, Pillar, Draft } from "~/lib/db/schema";
import { createDraft } from "~/lib/drafts";
import { startRun, finishRun } from "~/lib/runs";
import { updateTopic } from "~/lib/topics";
import { listPublishedPostsForSite } from "~/lib/drafts";
import { getDb } from "~/lib/db/client";
import { sites } from "~/lib/db/schema";
import { eq } from "drizzle-orm";

export interface RunForSiteResult {
  runId: string;
  draftId: string | null;
  verdict: "published" | "rejected" | "error";
  weightedTotal: number | null;
  hardFails: string[];
  reason?: string;
  costUsd: number;
}

/**
 * Run the full multi-agent pipeline for a single topic on a site.
 * Stores draft + run result in SQLite. Does NOT publish — that's a
 * separate step the user triggers from the draft review UI (or auto-publish
 * if the site has autoPublish=true).
 */
export async function runForSite(
  site: Site & { pillars: Pillar[] },
  topic: Topic
): Promise<RunForSiteResult> {
  const run = await startRun(site.id, topic.id);
  const stages: Array<{ stage: string; ms: number; ok: boolean }> = [];
  const usage: UsageEntry[] = [];

  // Build an env-like object from the site's apiKeys so the existing
  // provider registry can pick them up without leaking to process.env.
  const env = { ...process.env };
  if (site.apiKeys?.anthropic) env.ANTHROPIC_API_KEY = site.apiKeys.anthropic;
  if (site.apiKeys?.gemini) env.GEMINI_API_KEY = site.apiKeys.gemini;
  if (site.apiKeys?.groq) env.GROQ_API_KEY = site.apiKeys.groq;
  if (site.apiKeys?.fal) env.FAL_API_KEY = site.apiKeys.fal;
  if (site.apiKeys?.resend) env.RESEND_API_KEY = site.apiKeys.resend;
  if (site.apiKeys?.cloudflareAccount) env.CF_ACCOUNT_ID = site.apiKeys.cloudflareAccount;
  if (site.apiKeys?.cloudflareToken) env.CF_API_TOKEN = site.apiKeys.cloudflareToken;

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const startStage = (name: string) => {
    const t = Date.now();
    return (ok: boolean) => stages.push({ stage: name, ms: Date.now() - t, ok });
  };

  try {
    const providers = createProviderRegistry(env);

    // Existing site urls = published posts (for cannibalization avoidance hint)
    const publishedSoFar = await listPublishedPostsForSite(site.id);
    const existingUrls = publishedSoFar
      .map((p) => p.externalUrl ?? `https://${site.domain}/${p.slug}`)
      .filter(Boolean);

    // Researcher
    let endStage = startStage("researcher");
    const research = await runResearcher(
      {
        target_keyword: topic.targetKeyword,
        topic_title: topic.title,
        pillar: topic.pillarSlug,
        existing_site_urls: existingUrls,
      },
      { provider: providers.get("gemini"), sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: "gemini", model: research.raw.model, inputTokens: research.raw.inputTokens, outputTokens: research.raw.outputTokens });

    // URL self-verification
    endStage = startStage("urlVerify");
    try {
      const urlFilter = await filterDeadResearchUrls(research.parsed);
      research.parsed = urlFilter.filtered;
      endStage(true);
    } catch {
      endStage(false);
    }

    // Strategist
    endStage = startStage("strategist");
    const outline = await runStrategist(
      {
        research: research.parsed,
        brand_voice: site.brandVoice,
        target_keyword: topic.targetKeyword,
        intent: topic.intent,
        intended_word_count_target: topic.intendedWordCount,
        custom_instructions: topic.customInstructions ?? undefined,
      },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: "anthropic", model: outline.raw.model, inputTokens: outline.raw.inputTokens, outputTokens: outline.raw.outputTokens });

    // Writer
    endStage = startStage("writer");
    const writer = await runWriter(
      {
        outline: outline.parsed.outline,
        brand_voice: site.brandVoice,
        ban_list: site.banList,
        contrarian_hint: outline.parsed.contrarian_opinion_hint,
        key_facts: research.parsed.key_facts,
        originality_anchor: research.parsed.originality_anchor,
        custom_instructions: topic.customInstructions ?? undefined,
      },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: "anthropic", model: "claude-sonnet-4-6", inputTokens: writer.totalInputTokens, outputTokens: writer.totalOutputTokens });

    // SEO editor
    endStage = startStage("seoEditor");
    const seo = await runSeoEditor(
      {
        draft_html: writer.parsed.draft_html,
        target_keyword: topic.targetKeyword,
        internal_links_target_list: outline.parsed.outline.internal_links_to_inject,
        ban_list: site.banList,
      },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    endStage(true);
    seo.parsed.edited_html = postProcessDraftHtml(seo.parsed.edited_html);
    usage.push({ provider: "anthropic", model: seo.raw.model, inputTokens: seo.raw.inputTokens, outputTokens: seo.raw.outputTokens });

    // Fact-check
    endStage = startStage("factChecker");
    const fc = await runFactChecker(
      { edited_html: seo.parsed.edited_html, key_facts: research.parsed.key_facts },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: "anthropic", model: fc.raw.model, inputTokens: fc.raw.inputTokens, outputTokens: fc.raw.outputTokens });

    // Deterministic signals + citation check
    let signals = computeDeterministicRubricSignals({
      html: seo.parsed.edited_html,
      banList: site.banList,
      targetKeyword: topic.targetKeyword,
      internalUrls: outline.parsed.outline.internal_links_to_inject.map((l) => l.url),
    });
    endStage = startStage("citationCheck");
    const citationUrls = [
      ...research.parsed.external_authority_sources.map((s) => s.url),
      ...outline.parsed.outline.external_links_to_cite,
    ];
    const citationResult = await checkCitations({ urls: citationUrls, timeoutMs: 5000 });
    signals = enrichSignalsWithCitationCheck(signals, citationResult);
    endStage(true);

    // Quality judge
    endStage = startStage("qualityJudge");
    const judge = await runQualityJudge(
      {
        edited_html: seo.parsed.edited_html,
        target_keyword: topic.targetKeyword,
        deterministic_signals: signals,
        fact_check_verdict: fc.parsed.verdict,
        fabricated_claims_count: fc.parsed.fabricated_claims.length,
        meta_fields: {
          meta_title: seo.parsed.meta_title,
          meta_description: seo.parsed.meta_description,
          slug: seo.parsed.slug,
          alt_texts: seo.parsed.alt_texts_per_image_placeholder,
        },
      },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: "anthropic", model: judge.raw.model, inputTokens: judge.raw.inputTokens, outputTokens: judge.raw.outputTokens });

    const cost = computeRunCost(usage);

    if (judge.parsed.verdict === "NO-GO" || judge.parsed.weighted_total < site.qualityThreshold) {
      await updateTopic(topic.id, {
        status: "rejected",
        rejectReason: judge.parsed.hard_fails.join("; ") || `score < threshold (${judge.parsed.weighted_total.toFixed(1)} < ${site.qualityThreshold})`,
      });
      const finalRun = await finishRun(run.id, {
        verdict: "rejected",
        weightedTotal: judge.parsed.weighted_total,
        hardFails: judge.parsed.hard_fails,
        reason: judge.parsed.hard_fails.join("; ") || "score < threshold",
        costUsd: cost.totalUsd,
        stages,
      });
      return {
        runId: finalRun.id,
        draftId: null,
        verdict: "rejected",
        weightedTotal: judge.parsed.weighted_total,
        hardFails: judge.parsed.hard_fails,
        reason: finalRun.reason ?? undefined,
        costUsd: cost.totalUsd,
      };
    }

    // Image generation
    endStage = startStage("imagePrompter");
    const ip = await runImagePrompter(
      {
        title: outline.parsed.outline.h1_suggestion,
        tldr: outline.parsed.outline.tldr_one_liner,
        brand_style: "modern editorial",
        pillar: topic.pillarSlug,
        target_keyword: topic.targetKeyword,
        key_entities: research.parsed.key_entities.slice(0, 5),
      },
      { provider: providers.get("groq"), sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: "groq", model: ip.raw.model, inputTokens: ip.raw.inputTokens, outputTokens: ip.raw.outputTokens });

    endStage = startStage("imageGen");
    let imagePath: string | null = null;
    try {
      const image = await generateBlogImage(
        { prompt: ip.parsed.prompt, negative_prompt: ip.parsed.negative_prompt },
        {
          FAL_API_KEY: env.FAL_API_KEY ?? "",
          CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
          CF_API_TOKEN: env.CF_API_TOKEN,
        }
      );
      const optimized = await optimizeForWeb({ pngBytes: image.bytes });
      const imgDir = path.resolve(process.cwd(), "../../data/images", site.slug);
      await fs.mkdir(imgDir, { recursive: true });
      const file = path.join(imgDir, `${seo.parsed.slug}.avif`);
      await fs.writeFile(file, optimized.avifBytes);
      imagePath = `data/images/${site.slug}/${seo.parsed.slug}.avif`;
      endStage(true);
    } catch (err) {
      endStage(false);
      // image is optional — continue without
      console.warn("image generation failed:", (err as Error).message);
    }

    // Save the draft
    const draft = await createDraft({
      siteId: site.id,
      topicId: topic.id,
      runId: run.id,
      title: outline.parsed.outline.h1_suggestion,
      slug: seo.parsed.slug,
      contentHtml: seo.parsed.edited_html,
      metaTitle: seo.parsed.meta_title,
      metaDescription: seo.parsed.meta_description,
      tldr: outline.parsed.outline.tldr_one_liner,
      imagePath,
      imageAlt: ip.parsed.alt_text_nl,
      rubricScores: judge.parsed.scores,
      weightedTotal: judge.parsed.weighted_total,
      hardFails: judge.parsed.hard_fails,
      costUsd: cost.totalUsd,
    });

    await updateTopic(topic.id, { status: "in_progress" });

    const finalRun = await finishRun(run.id, {
      verdict: "published",
      weightedTotal: judge.parsed.weighted_total,
      hardFails: judge.parsed.hard_fails,
      costUsd: cost.totalUsd,
      stages,
    });

    // Touch site.updatedAt so the dashboard "last activity" reflects this
    const db = getDb();
    await db.update(sites).set({ updatedAt: new Date().toISOString() }).where(eq(sites.id, site.id));

    return {
      runId: finalRun.id,
      draftId: draft.id,
      verdict: "published",
      weightedTotal: judge.parsed.weighted_total,
      hardFails: judge.parsed.hard_fails,
      costUsd: cost.totalUsd,
    };
  } catch (err) {
    const message = (err as Error).message;
    await finishRun(run.id, {
      verdict: "error",
      reason: message,
      errorMessage: message,
      stages,
    });
    return {
      runId: run.id,
      draftId: null,
      verdict: "error",
      weightedTotal: null,
      hardFails: [],
      reason: message,
      costUsd: 0,
    };
  }
}
