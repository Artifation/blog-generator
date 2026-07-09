import * as React from "react";
import fs from "node:fs/promises";
import path from "node:path";

import { createProviderRegistry, resolveAgentModel } from "@/llm/client";
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
import { buildAllSchemaJsonLd } from "@/pipeline/schemaGenerator";
import { parsePreviousFabricatedClaims } from "@/pipeline/fabricatedClaimsParser";
import { fetchSitemapEntries } from "@/pipeline/sitemap";
import type { TenantConfig } from "@/config/tenant";
import { checkCitations, enrichSignalsWithCitationCheck } from "@/pipeline/citationCheck";
import { filterDeadResearchUrls } from "@/pipeline/researchUrlFilter";
import { extractExternalHrefs, stripDeadLinks, filterDefinitivelyDead } from "@/pipeline/stripDeadLinks";
import {
  computeRunCost,
  assertRunBudget,
  exceedsWeeklyBudget,
  effectiveUsdCap,
  usdToEur,
  type UsageEntry,
} from "@/pipeline/costTracker";
import { derivePerformanceInsights, loadLatestSnapshot } from "@/pipeline/gscPerformanceInsights";
import { applyFactCheckerFixes } from "@/pipeline/applyFactCheckerFixes";
import type { StrategistInput } from "@/agents/strategist";

import type { Site, Topic, Pillar } from "~/lib/db/schema";
import { createDraft, getLatestRejectedDraftForTopic } from "~/lib/drafts";
import { startRun, finishRun, sumRunCostLast7DaysForSite } from "~/lib/runs";
import { updateTopic } from "~/lib/topics";
import { listPublishedPostsForSite, countPublishedThisIsoWeekForSite, countDraftsThisIsoWeekForSite } from "~/lib/drafts";
import { getDb } from "~/lib/db/client";
import { sites } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/email/resend";
import { render } from "@react-email/render";
import { Success } from "@/email/templates/Success";
import { Reject } from "@/email/templates/Reject";
import { recordError } from "~/lib/errors/store";

/**
 * Verstuurt een Resend-email als de site emailConfig.enabled = true heeft en
 * de Resend API-key in apiKeys staat. Faalt stil (logt warning) zodat een
 * email-issue de pipeline niet ophoudt.
 */
async function notifySiteEmail(
  site: Site,
  input: { subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }
): Promise<void> {
  const cfg = site.emailConfig;
  if (!cfg?.enabled) return;
  const apiKey = site.apiKeys?.resend;
  const to = cfg.to;
  const from = cfg.from ?? "onboarding@resend.dev";
  if (!apiKey || !to) {
    console.warn(JSON.stringify({ stage: "notify-skip", reason: "missing resend key or to-address", siteSlug: site.slug }));
    return;
  }
  try {
    await sendEmail({
      apiKey,
      from,
      to,
      replyTo: cfg.replyTo ?? to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    });
  } catch (err) {
    console.warn(JSON.stringify({ stage: "notify-failed", siteSlug: site.slug, error: (err as Error).message }));
  }
}

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
  // CAP-CHECK vóór de eerste LLM-call. Voorkomt ~€0.15 verspild aan
  // researcher/writer/judge wanneer de site al z'n weekcap heeft bereikt.
  // Markeert het topic als cap_deferred zodat het volgende week opnieuw
  // geprobeerd wordt, en finished de run zonder kosten te maken.
  // Cap on the most expensive metric: published posts OR drafts generated this
  // week (each draft is a paid run). Counting only published let a non-auto-
  // publish site generate unlimited paid drafts.
  const publishedThisWeek = await countPublishedThisIsoWeekForSite(site.id);
  const generatedThisWeek = await countDraftsThisIsoWeekForSite(site.id);
  const usedThisWeek = Math.max(publishedThisWeek, generatedThisWeek);
  if (usedThisWeek >= site.maxPostsPerWeek) {
    const run = await startRun(site.id, topic.id);
    const reason = `weekcap bereikt (${usedThisWeek}/${site.maxPostsPerWeek})`;
    await updateTopic(topic.id, { status: "cap_deferred", rejectReason: reason });
    const finalRun = await finishRun(run.id, {
      verdict: "cap_deferred",
      reason,
      stages: [{ stage: "cap-check-early", ms: 0, ok: true }],
    });
    return {
      runId: finalRun.id,
      draftId: null,
      verdict: "rejected",
      weightedTotal: null,
      hardFails: [],
      reason,
      costUsd: 0,
    };
  }

  // Optional hard USD guardrails (opt-in via env; unset = no cap). The per-run
  // ceiling is enforced at the stage boundaries below; the weekly cap is a
  // pre-flight gate that defers the topic, mirroring the post-count cap.
  const runUsdCeiling = effectiveUsdCap(site.maxRunEur, process.env.MAX_RUN_USD);
  const weeklyUsdCap = effectiveUsdCap(site.maxWeeklyEur, process.env.MAX_WEEKLY_USD);
  if (weeklyUsdCap != null) {
    const spentThisWeek = await sumRunCostLast7DaysForSite(site.id);
    if (exceedsWeeklyBudget(spentThisWeek, weeklyUsdCap)) {
      const capRun = await startRun(site.id, topic.id);
      const reason = `weekbudget bereikt (€${usdToEur(spentThisWeek).toFixed(2)}/€${usdToEur(weeklyUsdCap).toFixed(2)})`;
      await updateTopic(topic.id, { status: "cap_deferred", rejectReason: reason });
      const finalRun = await finishRun(capRun.id, {
        verdict: "cap_deferred",
        reason,
        stages: [{ stage: "cost-cap-early", ms: 0, ok: true }],
      });
      return {
        runId: finalRun.id,
        draftId: null,
        verdict: "rejected",
        weightedTotal: null,
        hardFails: [],
        reason,
        costUsd: 0,
      };
    }
  }

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

    // Existing site URLs = union of (a) already-published posts in our DB
    // and (b) the live sitemap of the site's domain. The DB list alone is
    // empty for fresh sites and starves the internal-link rubric; the
    // sitemap gives the researcher/strategist real material to link to.
    // Sitemap fetch is best-effort — a 404 or network error is non-fatal,
    // we just fall back to the DB list.
    let endStage = startStage("collectInternalUrls");
    const publishedSoFar = await listPublishedPostsForSite(site.id);
    const dbUrls = publishedSoFar
      .map((p) => p.externalUrl ?? `https://${site.domain}/${p.slug}`)
      .filter(Boolean);
    let sitemapUrls: string[] = [];
    try {
      const entries = await fetchSitemapEntries(`https://${site.domain}/sitemap.xml`);
      sitemapUrls = entries.map((e) => e.url);
    } catch (err) {
      console.warn(`sitemap fetch failed for ${site.domain}: ${(err as Error).message}`);
    }
    const existingUrls = Array.from(new Set([...dbUrls, ...sitemapUrls]));
    console.log(
      JSON.stringify({
        stage: "collectInternalUrls",
        dbUrls: dbUrls.length,
        sitemapUrls: sitemapUrls.length,
        merged: existingUrls.length,
      })
    );
    endStage(true);

    // Researcher
    endStage = startStage("researcher");
    const researcherModel = resolveAgentModel("researcher", providers);
    const research = await runResearcher(
      {
        target_keyword: topic.targetKeyword,
        topic_title: topic.title,
        pillar: topic.pillarSlug,
        existing_site_urls: existingUrls,
      },
      { provider: providers.get(researcherModel.provider), model: researcherModel, sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: researcherModel.provider, model: research.raw.model, inputTokens: research.raw.inputTokens, outputTokens: research.raw.outputTokens });
    assertRunBudget(usage, runUsdCeiling);

    // URL self-verification
    endStage = startStage("urlVerify");
    try {
      const urlFilter = await filterDeadResearchUrls(research.parsed);
      research.parsed = urlFilter.filtered;
      endStage(true);
    } catch {
      endStage(false);
    }

    // Auto-detect fact-poor research. When the researcher found < 5 verifiable
    // key_facts, the writer tends to fabricate statistics to compensate
    // (resulting in repeat fact_check rejections). Inject a forced-qualitative
    // directive that overrides any LLM tendency to "sound authoritative" with
    // made-up numbers. Combines with topic.customInstructions so user-supplied
    // guidance still applies.
    const factPoor = research.parsed.key_facts.length < 5;
    const qualitativeOverride = factPoor
      ? `KRITISCH: research vond slechts ${research.parsed.key_facts.length} verifieerbare feit(en). SCHRIJF KWALITATIEF. ABSOLUUT GEEN specifieke percentages, euro-bedragen of jaartallen — alleen kwalitatieve frasering: "een groeiend aantal", "veel MKB-bedrijven", "de afgelopen jaren", "een aanzienlijk deel". Specifieke getallen MAG ALLEEN als ze LETTERLIJK in research.key_facts staan. Bij twijfel: weglaten.`
      : null;

    const combinedInstructions = [qualitativeOverride, topic.customInstructions ?? null]
      .filter(Boolean)
      .join("\n\n") || undefined;

    if (factPoor) {
      console.log(
        JSON.stringify({
          stage: "factPoorMode",
          keyFactsCount: research.parsed.key_facts.length,
          message: "Research is fact-poor; forcing qualitative writing mode",
        })
      );
    }

    // Performance-feedback: leest meest recente GSC-snapshot. Path werkt
    // vanuit apps/web/ (cwd) zodat het de repo-root data/-dir vindt.
    let strategistPerformanceSignals: StrategistInput["performance_signals"] | undefined;
    try {
      const snapshotDataDir = path.resolve(process.cwd(), "../../data");
      const latest = await loadLatestSnapshot(site.slug, snapshotDataDir);
      if (latest && latest.posts.length > 0) {
        const ins = derivePerformanceInsights(latest);
        strategistPerformanceSignals = {
          top_performers: ins.top_performers.map((p) => ({
            url: p.url,
            target_keyword: p.target_keyword,
            clicks_30d: p.clicks_30d,
            note: p.note,
          })),
          ranking_keywords: ins.ranking_keywords.map((k) => ({
            query: k.query,
            position: k.position,
            url: k.url,
          })),
        };
        console.log(
          JSON.stringify({
            stage: "strategist-perf-signals",
            topPerformers: strategistPerformanceSignals.top_performers.length,
            rankingKeywords: strategistPerformanceSignals.ranking_keywords.length,
          })
        );
      }
    } catch (err) {
      console.log(JSON.stringify({ stage: "strategist-perf-signals", warning: (err as Error).message }));
    }

    // Strategist
    endStage = startStage("strategist");
    const strategistModel = resolveAgentModel("strategist", providers);
    const outline = await runStrategist(
      {
        research: research.parsed,
        brand_voice: site.brandVoice,
        target_keyword: topic.targetKeyword,
        intent: topic.intent,
        intended_word_count_target: topic.intendedWordCount,
        custom_instructions: combinedInstructions,
        ...(strategistPerformanceSignals ? { performance_signals: strategistPerformanceSignals } : {}),
      },
      { provider: providers.get(strategistModel.provider), model: strategistModel, sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: strategistModel.provider, model: outline.raw.model, inputTokens: outline.raw.inputTokens, outputTokens: outline.raw.outputTokens });
    assertRunBudget(usage, runUsdCeiling);

    // Retry-feedback loop: if this topic was rejected before, read the
    // factChecker's fabricated_claims out of the previous rejected draft and
    // feed them to the writer as "do NOT repeat these".
    const prevRejected = await getLatestRejectedDraftForTopic(topic.id).catch(() => null);
    const previousFabricatedClaims = prevRejected
      ? parsePreviousFabricatedClaims(prevRejected.hardFails ?? [])
      : [];
    if (previousFabricatedClaims.length > 0) {
      console.log(
        JSON.stringify({
          stage: "retryFeedbackLoop",
          previousRejectedDraftId: prevRejected!.id,
          previousFabricatedCount: previousFabricatedClaims.length,
          message: "Feeding previous-rejection fabricated claims back to writer",
        })
      );
    }

    // Writer
    endStage = startStage("writer");
    const writerModel = resolveAgentModel("writer", providers);
    const writer = await runWriter(
      {
        outline: outline.parsed.outline,
        brand_voice: site.brandVoice,
        ban_list: site.banList,
        contrarian_hint: outline.parsed.contrarian_opinion_hint,
        key_facts: research.parsed.key_facts,
        originality_anchor: research.parsed.originality_anchor,
        custom_instructions: combinedInstructions,
        previous_fabricated_claims:
          previousFabricatedClaims.length > 0 ? previousFabricatedClaims : undefined,
      },
      { provider: providers.get(writerModel.provider), model: writerModel, sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: writerModel.provider, model: writerModel.model, inputTokens: writer.totalInputTokens, outputTokens: writer.totalOutputTokens });
    assertRunBudget(usage, runUsdCeiling);

    // SEO editor
    endStage = startStage("seoEditor");
    const seoEditorModel = resolveAgentModel("seoEditor", providers);
    const seo = await runSeoEditor(
      {
        draft_html: writer.parsed.draft_html,
        target_keyword: topic.targetKeyword,
        internal_links_target_list: outline.parsed.outline.internal_links_to_inject,
        ban_list: site.banList,
      },
      { provider: providers.get(seoEditorModel.provider), model: seoEditorModel, sleepImpl: sleep }
    );
    endStage(true);
    seo.parsed.edited_html = postProcessDraftHtml(seo.parsed.edited_html);
    usage.push({ provider: seoEditorModel.provider, model: seo.raw.model, inputTokens: seo.raw.inputTokens, outputTokens: seo.raw.outputTokens });
    assertRunBudget(usage, runUsdCeiling);

    // Final dead-link scrub on the SEO-edited HTML. researchUrlFilter only
    // caught dead source URLs in research output; the writer / seoEditor can
    // still introduce hrefs that are dead or soft-404 (CMS pages that have
    // moved). We re-check every external <a> in the draft and strip the
    // anchor tags from URLs whose reason is DEFINITIVELY dead — same logic
    // as researchUrlFilter (404/410/soft404). WAF-blocked (403/429), 5xx,
    // timeouts and transient network errors are NOT stripped because they're
    // usually false negatives on bot-hostile authoritative sites (RVO, AP,
    // gov.nl, Wolters Kluwer) where the page is fine but blocks Node-UA.
    endStage = startStage("draftLinkScrub");
    try {
      const draftHrefs = extractExternalHrefs(seo.parsed.edited_html);
      if (draftHrefs.length > 0) {
        const linkCheck = await checkCitations({ urls: draftHrefs, timeoutMs: 6000 });
        const definitivelyDead = filterDefinitivelyDead(linkCheck.dead);
        const deadSet = new Set(definitivelyDead.map((d) => d.url));
        if (deadSet.size > 0) {
          seo.parsed.edited_html = stripDeadLinks(seo.parsed.edited_html, deadSet);
        }
        console.log(
          JSON.stringify({
            stage: "draftLinkScrub",
            checked: draftHrefs.length,
            stripped: deadSet.size,
            unverified: linkCheck.dead.length - definitivelyDead.length,
          })
        );
      }
      endStage(true);
    } catch (err) {
      // Don't fail the run for a scrub error — log and continue with original
      // HTML. The downstream citation rubric still flags broken links.
      console.warn("draftLinkScrub failed:", (err as Error).message);
      endStage(false);
    }

    // Fact-check — pass originality_anchor so the checker recognises
    // researcher-supplied hypothetical-scenario specifics as legitimate
    // (otherwise it flags them as fabricated and forces NO-GO).
    endStage = startStage("factChecker");
    const factCheckerModel = resolveAgentModel("factChecker", providers);
    let fc = await runFactChecker(
      {
        edited_html: seo.parsed.edited_html,
        key_facts: research.parsed.key_facts,
        originality_anchor: research.parsed.originality_anchor,
      },
      { provider: providers.get(factCheckerModel.provider), model: factCheckerModel, sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: factCheckerModel.provider, model: fc.raw.model, inputTokens: fc.raw.inputTokens, outputTokens: fc.raw.outputTokens });
    assertRunBudget(usage, runUsdCeiling);

    // AUTO-FIX LOOP (bounded: 1 retry max). Wanneer factChecker fail-verdict
    // gaf MAAR de fabricated_claims hebben suggested_rewrites, probeer ze
    // automatisch toe te passen en her-checken. Dit voorkomt dat ~30% van
    // de rejects (waar de fix triviaal was) een handmatige rewrite-cyclus
    // veroorzaken. Cost: 1 extra factChecker-call (~€0.02). Bounded zodat
    // we niet eindeloos vechten tegen een writer die blijft hallucineren.
    if (fc.parsed.verdict === "fail" && fc.parsed.fabricated_claims.some((c) => c.suggested_rewrite)) {
      endStage = startStage("factCheckerAutoFix");
      const fixResult = applyFactCheckerFixes({
        html: seo.parsed.edited_html,
        fixes: fc.parsed.fabricated_claims,
      });
      if (fixResult.applied.length > 0) {
        seo.parsed.edited_html = fixResult.patched_html;
        console.log(
          JSON.stringify({
            stage: "factCheckerAutoFix",
            applied: fixResult.applied.length,
            skipped: fixResult.skipped.length,
            skipReasons: fixResult.skipped.map((s) => s.reason),
          })
        );
        // Re-check tegen dezelfde key_facts. Als nog steeds fail → reject pad
        // pakt het op met de NIEUWE fabricated_claims (kan minder zijn dan
        // de eerste run als auto-fix gedeeltelijk werkte).
        const fc2 = await runFactChecker(
          {
            edited_html: seo.parsed.edited_html,
            key_facts: research.parsed.key_facts,
            originality_anchor: research.parsed.originality_anchor,
          },
          { provider: providers.get(factCheckerModel.provider), model: factCheckerModel, sleepImpl: sleep }
        );
        usage.push({ provider: factCheckerModel.provider, model: fc2.raw.model, inputTokens: fc2.raw.inputTokens, outputTokens: fc2.raw.outputTokens });
        fc = fc2;
        endStage(true);
        console.log(
          JSON.stringify({
            stage: "factCheckerRecheck",
            verdict: fc.parsed.verdict,
            remainingFabricated: fc.parsed.fabricated_claims.length,
          })
        );
      } else {
        endStage(false);
        console.log(
          JSON.stringify({
            stage: "factCheckerAutoFix",
            applied: 0,
            skipped: fixResult.skipped.length,
            note: "geen fixes toepasbaar — overslaan naar reject",
          })
        );
      }
    }

    // Build JSON-LD schemas (BlogPosting + BreadcrumbList — author Person is
    // nested in BlogPosting) BEFORE quality judge so the seo_schema rubric
    // signal sees them. Without this the judge consistently scores 0.0 on
    // seo_schema because the draft HTML doesn't yet contain JSON-LD; final
    // image URL is unknown at this stage so we use a placeholder that gets
    // replaced at publish-time.
    const baseUrl = `https://${site.domain}`;
    const preJudgeSchema = buildAllSchemaJsonLd({
      tenant: siteToTenantShim(site, baseUrl),
      topic: { pillar: topic.pillarSlug, target_keyword: topic.targetKeyword },
      post: {
        headline: outline.parsed.outline.h1_suggestion,
        description: outline.parsed.outline.tldr_one_liner,
        slug: seo.parsed.slug,
        url: `${baseUrl}/${seo.parsed.slug}/`,
        datePublished: new Date().toISOString(),
        imageUrl: `${baseUrl}/_image-placeholder-${seo.parsed.slug}.avif`,
        imageAlt: outline.parsed.outline.h1_suggestion,
      },
      keyEntities: research.parsed.key_entities,
    });
    const htmlForJudge = `${seo.parsed.edited_html}\n${preJudgeSchema}`;

    // Deterministic signals + citation check — run against htmlForJudge so
    // the schema detection regex finds the JSON-LD scripts we just built.
    let signals = computeDeterministicRubricSignals({
      html: htmlForJudge,
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
    const qualityJudgeModel = resolveAgentModel("qualityJudge", providers);
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
      { provider: providers.get(qualityJudgeModel.provider), model: qualityJudgeModel, sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: qualityJudgeModel.provider, model: judge.raw.model, inputTokens: judge.raw.inputTokens, outputTokens: judge.raw.outputTokens });

    const cost = computeRunCost(usage);

    if (judge.parsed.verdict === "NO-GO" || judge.parsed.weighted_total < site.qualityThreshold) {
      // Save the rejected draft so the user can inspect what was generated
      // and decide whether to manually rewrite, regenerate with different
      // custom_instructions, or accept that the topic needs a different angle.
      // We pack the fact-checker's fabricated_claims into hardFails so they
      // surface as red badges on the Drafts page — that's the most actionable
      // info ("here are the made-up numbers, fix or remove them").
      // factChecker's fabricated_claims is Array<{claim, reason}> — destructure
      // .claim so we don't end up storing literal "[object Object]" strings.
      // We pack the reason in a second sentence so the badge in the UI is
      // descriptive without being too long.
      const rejectHardFails = [
        ...judge.parsed.hard_fails,
        ...fc.parsed.fabricated_claims.map((c) => {
          // Houdt het bestaande "fabricated claim: <claim> — <reason>" formaat
          // intact (parsePreviousFabricatedClaims rekent er op). Wanneer de
          // factChecker een rewrite voorstelde, hangen we die er achter zodat
          // de Drafts-UI de fix toont en de gebruiker hem 1-klik kan plakken.
          const base = `fabricated claim: ${c.claim}${c.reason ? ` — ${c.reason}` : ""}`;
          return c.suggested_rewrite ? `${base}\n→ FIX: ${c.suggested_rewrite}` : base;
        }),
      ];
      const rejectedDraft = await createDraft({
        siteId: site.id,
        topicId: topic.id,
        runId: run.id,
        status: "rejected",
        title: outline.parsed.outline.h1_suggestion,
        slug: seo.parsed.slug,
        contentHtml: seo.parsed.edited_html,
        metaTitle: seo.parsed.meta_title,
        metaDescription: seo.parsed.meta_description,
        tldr: outline.parsed.outline.tldr_one_liner,
        rubricScores: judge.parsed.scores,
        weightedTotal: judge.parsed.weighted_total,
        hardFails: rejectHardFails,
        costUsd: cost.totalUsd,
      });

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

      // Email-notificatie (opt-in via site.emailConfig.enabled). Faalt stil.
      try {
        const html = await render(
          React.createElement(Reject, {
            title: outline.parsed.outline.h1_suggestion,
            weightedTotal: judge.parsed.weighted_total,
            scoreBreakdown: judge.parsed.scores,
            hardFails: rejectHardFails,
            reasoning: judge.parsed.reasoning,
            improvementSuggestions: judge.parsed.improvement_suggestions,
          })
        );
        await notifySiteEmail(site, {
          subject: `[${site.name}] Reject: ${outline.parsed.outline.h1_suggestion} — score ${judge.parsed.weighted_total.toFixed(1)}`,
          html,
          attachments: [
            { filename: "draft.html", content: Buffer.from(seo.parsed.edited_html, "utf-8") },
          ],
        });
      } catch (err) {
        console.warn(JSON.stringify({ stage: "notify-reject", warning: (err as Error).message }));
      }

      return {
        runId: finalRun.id,
        draftId: rejectedDraft.id,
        verdict: "rejected",
        weightedTotal: judge.parsed.weighted_total,
        hardFails: judge.parsed.hard_fails,
        reason: finalRun.reason ?? undefined,
        costUsd: cost.totalUsd,
      };
    }

    // Image generation
    endStage = startStage("imagePrompter");
    const imagePrompterModel = resolveAgentModel("imagePrompter", providers);
    const ip = await runImagePrompter(
      {
        title: outline.parsed.outline.h1_suggestion,
        tldr: outline.parsed.outline.tldr_one_liner,
        brand_style: "modern editorial",
        pillar: topic.pillarSlug,
        target_keyword: topic.targetKeyword,
        key_entities: research.parsed.key_entities.slice(0, 5),
      },
      { provider: providers.get(imagePrompterModel.provider), model: imagePrompterModel, sleepImpl: sleep }
    );
    endStage(true);
    usage.push({ provider: imagePrompterModel.provider, model: ip.raw.model, inputTokens: ip.raw.inputTokens, outputTokens: ip.raw.outputTokens });

    endStage = startStage("imageGen");
    let imagePath: string | null = null;
    try {
      const image = await generateBlogImage(
        { prompt: ip.parsed.prompt, negative_prompt: ip.parsed.negative_prompt },
        {
          FAL_API_KEY: env.FAL_API_KEY,
          GEMINI_API_KEY: env.GEMINI_API_KEY,
          CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
          CF_API_TOKEN: env.CF_API_TOKEN,
        }
      );
      const optimized = await optimizeForWeb({ pngBytes: image.bytes });
      const imgDir = path.resolve(process.cwd(), "../../data/images", site.slug);
      await fs.mkdir(imgDir, { recursive: true });
      const ext = optimized.contentType === "image/webp" ? "webp" : "png";
      const file = path.join(imgDir, `${seo.parsed.slug}.${ext}`);
      await fs.writeFile(file, optimized.bytes);
      imagePath = `data/images/${site.slug}/${seo.parsed.slug}.${ext}`;
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

    // Email-notificatie bij succesvol concept (opt-in via site.emailConfig.enabled).
    // "Published" hier betekent: draft is opgeslagen in onze DB voor review. De
    // daadwerkelijke push naar WordPress/markdown gebeurt apart via publishDraft
    // wanneer de gebruiker (of auto-publish) groen licht geeft.
    try {
      const html = await render(
        React.createElement(Success, {
          title: outline.parsed.outline.h1_suggestion,
          weightedTotal: judge.parsed.weighted_total,
          scoreBreakdown: judge.parsed.scores,
          tldr: outline.parsed.outline.tldr_one_liner,
          imageUrl: imagePath ? `/${imagePath}` : "",
          editUrl: `/drafts/${draft.id}`,
          previewUrl: `/drafts/${draft.id}`,
          targetKeyword: topic.targetKeyword,
          internalLinksUsed: outline.parsed.outline.internal_links_to_inject,
        })
      );
      await notifySiteEmail(site, {
        subject: `[${site.name}] Concept klaar: ${outline.parsed.outline.h1_suggestion} — score ${judge.parsed.weighted_total.toFixed(1)}`,
        html,
      });
    } catch (err) {
      console.warn(JSON.stringify({ stage: "notify-publish", warning: (err as Error).message }));
    }

    return {
      runId: finalRun.id,
      draftId: draft.id,
      verdict: "published",
      weightedTotal: judge.parsed.weighted_total,
      hardFails: judge.parsed.hard_fails,
      costUsd: cost.totalUsd,
    };
  } catch (err) {
    const errObj = err as Error;
    const message = errObj.message;
    // Record whatever was already spent before the abort so a hard per-run
    // ceiling (or any mid-pipeline failure) still counts toward the weekly cap
    // and the cost dashboard — otherwise a topic that keeps aborting could burn
    // up to the ceiling every tick without ever tripping the weekly budget.
    const partialCost = computeRunCost(usage).totalUsd;
    // Capture in the central error-store BEFORE finishRun so the operator
    // can correlate the error_event with the run row. Last-completed stage
    // is the most actionable single field; we keep the full stage history
    // in context too so the detail-view has the timeline.
    const lastStage = stages.length > 0 ? stages[stages.length - 1] : null;
    void recordError({
      siteId: site.id,
      source: "pipeline",
      severity: "error",
      message,
      stack: errObj.stack,
      context: {
        runId: run.id,
        topicId: topic.id,
        topicTitle: topic.title,
        siteSlug: site.slug,
        lastStage: lastStage?.stage ?? null,
        lastStageOk: lastStage?.ok ?? null,
        stagesCompleted: stages.length,
        stages,
      },
    });
    await finishRun(run.id, {
      verdict: "error",
      reason: message,
      errorMessage: message,
      costUsd: partialCost,
      stages,
    });
    return {
      runId: run.id,
      draftId: null,
      verdict: "error",
      weightedTotal: null,
      hardFails: [],
      reason: message,
      costUsd: partialCost,
    };
  }
}

/**
 * Map a Site (Drizzle shape used in the webapp) onto the TenantConfig shape
 * the legacy schemaGenerator expects. Only the fields actually read by
 * buildAllSchemaJsonLd are populated; the rest are filled with sensible
 * stubs so TypeScript stops complaining. Casting at the end to avoid having
 * to mirror the full TenantConfig type for an internal adapter.
 */
function siteToTenantShim(
  site: Site & { pillars: Pillar[] },
  baseUrl: string
): TenantConfig {
  return {
    slug: site.slug,
    domain: site.domain,
    language: site.language,
    brand: {
      name: site.name,
      voice: site.brandVoice,
      ban_list: site.banList,
      signature_phrases: site.signaturePhrases,
    },
    author: {
      name: site.author?.name ?? "",
      bio: site.author?.bio ?? "",
      linkedin: site.author?.linkedin ?? "",
      photo_url: site.author?.photoUrl ?? "",
    },
    organization: {
      legal_name: site.organization?.legalName ?? site.name,
      kvk: site.organization?.kvk ?? "",
      btw: site.organization?.btw ?? "",
      address: site.organization?.address ?? "",
    },
    wordpress: {
      base_url: baseUrl,
      user_secret_ref: "",
      app_password_secret_ref: "",
    },
    email: { from: "", to: "", reply_to: "" },
    pillars: site.pillars.map((p) => ({ id: p.slug, weight: p.weight })),
    quality_threshold: site.qualityThreshold,
    max_posts_per_week_published: site.maxPostsPerWeek,
    features: site.features as unknown as TenantConfig["features"],
  } as TenantConfig;
}
