import * as React from "react";
import { render } from "@react-email/render";
import { loadTenant } from "@/config/loader";
import { loadTopics, saveTopics } from "@/config/topics";
import { selectNextTopic } from "./topicSelector.ts";
import { detectCannibalization } from "./cannibalization.ts";
import { fetchSitemapEntries } from "./sitemap.ts";
import { computeDeterministicRubricSignals } from "./rubric.ts";
import { computeRunCost, type UsageEntry } from "./costTracker.ts";
import { countPublishedThisIsoWeek, markTopicStatus } from "./state.ts";
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
import { createWordpressClient } from "@/wordpress/client";
import { uploadMedia } from "@/wordpress/media";
import { createDraftPost, buildEditUrl } from "@/wordpress/posts";
import { setRankMathMeta } from "@/wordpress/rankMath";
import { sendEmail } from "@/email/resend";
import { Success } from "@/email/templates/Success";
import { Reject } from "@/email/templates/Reject";
import { CapReached } from "@/email/templates/CapReached";
import { ErrorMail } from "@/email/templates/Error";
import { buildAllSchemaJsonLd } from "./schemaGenerator.ts";
import type { TenantConfig } from "@/config/tenant";

export interface OrchestratorOpts {
  tenantSlug: string;
  baseDir?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

export async function runPipeline(opts: OrchestratorOpts): Promise<void> {
  const env = opts.env ?? process.env;
  const baseDir = opts.baseDir ?? "tenants";
  const now = opts.now ?? new Date();

  const tenant = await loadTenant(opts.tenantSlug, baseDir);
  let topics = await loadTopics(opts.tenantSlug, baseDir);

  const next = selectNextTopic(topics, now);
  if (!next) {
    await sendErrorEmail(env, tenant, now, "topic-selector", "Topic queue is leeg.");
    return;
  }

  const usage: UsageEntry[] = [];
  let currentStage = "init";

  try {
    currentStage = "sitemap";
    const sitemap = await fetchSitemapEntries(`${tenant.wordpress.base_url}/sitemap.xml`);
    const cann = detectCannibalization({
      targetKeyword: next.target_keyword,
      existingSlugs: sitemap.map((e) => e.slug),
      existingTitles: sitemap.map((e) => e.slug.replace(/-/g, " ")),
    });
    if (cann.isCannibalized) {
      topics = markTopicStatus(topics, next.id, "cannibalization_skipped", now, {
        reject_reason: cann.reason,
      });
      await saveTopics(topics, opts.tenantSlug, baseDir);
      return;
    }

    const providers = createProviderRegistry(env);
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    currentStage = "researcher";
    const research = await runResearcher(
      {
        target_keyword: next.target_keyword,
        topic_title: next.title,
        pillar: next.pillar,
        existing_site_urls: sitemap.map((e) => e.url),
      },
      { provider: providers.get("gemini"), sleepImpl: sleep }
    );
    usage.push({
      provider: "gemini",
      model: research.raw.model,
      inputTokens: research.raw.inputTokens,
      outputTokens: research.raw.outputTokens,
    });

    currentStage = "strategist";
    const outline = await runStrategist(
      {
        research: research.parsed,
        brand_voice: tenant.brand.voice,
        target_keyword: next.target_keyword,
        intent: next.intent,
        intended_word_count_target: next.intended_word_count_target,
      },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    usage.push({
      provider: "anthropic",
      model: outline.raw.model,
      inputTokens: outline.raw.inputTokens,
      outputTokens: outline.raw.outputTokens,
    });

    currentStage = "writer";
    const writer = await runWriter(
      {
        outline: outline.parsed.outline,
        brand_voice: tenant.brand.voice,
        ban_list: tenant.brand.ban_list,
        contrarian_hint: outline.parsed.contrarian_opinion_hint,
      },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    usage.push({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      inputTokens: writer.totalInputTokens,
      outputTokens: writer.totalOutputTokens,
    });

    currentStage = "seoEditor";
    const seo = await runSeoEditor(
      {
        draft_html: writer.parsed.draft_html,
        target_keyword: next.target_keyword,
        internal_links_target_list: outline.parsed.outline.internal_links_to_inject,
        ban_list: tenant.brand.ban_list,
      },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    usage.push({
      provider: "anthropic",
      model: seo.raw.model,
      inputTokens: seo.raw.inputTokens,
      outputTokens: seo.raw.outputTokens,
    });

    currentStage = "factChecker";
    const fc = await runFactChecker(
      { edited_html: seo.parsed.edited_html, key_facts: research.parsed.key_facts },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    usage.push({
      provider: "anthropic",
      model: fc.raw.model,
      inputTokens: fc.raw.inputTokens,
      outputTokens: fc.raw.outputTokens,
    });

    const signals = computeDeterministicRubricSignals({
      html: seo.parsed.edited_html,
      banList: tenant.brand.ban_list,
      targetKeyword: next.target_keyword,
      internalUrls: outline.parsed.outline.internal_links_to_inject.map((l) => l.url),
    });

    currentStage = "qualityJudge";
    const judge = await runQualityJudge(
      {
        edited_html: seo.parsed.edited_html,
        target_keyword: next.target_keyword,
        deterministic_signals: signals,
        fact_check_verdict: fc.parsed.verdict,
        fabricated_claims_count: fc.parsed.fabricated_claims.length,
      },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    usage.push({
      provider: "anthropic",
      model: judge.raw.model,
      inputTokens: judge.raw.inputTokens,
      outputTokens: judge.raw.outputTokens,
    });

    if (judge.parsed.verdict === "NO-GO") {
      const html = await render(
        React.createElement(Reject, {
          title: outline.parsed.outline.h1_suggestion,
          weightedTotal: judge.parsed.weighted_total,
          scoreBreakdown: judge.parsed.scores,
          hardFails: judge.parsed.hard_fails,
          reasoning: judge.parsed.reasoning,
          improvementSuggestions: judge.parsed.improvement_suggestions,
        })
      );
      await sendEmail({
        apiKey: requireEnv(env, "RESEND_API_KEY"),
        from: tenant.email.from,
        to: tenant.email.to,
        replyTo: tenant.email.reply_to,
        subject: `[${tenant.brand.name}] Reject: ${outline.parsed.outline.h1_suggestion} — score ${judge.parsed.weighted_total.toFixed(1)}`,
        html,
        attachments: [
          { filename: "draft.html", content: Buffer.from(seo.parsed.edited_html, "utf-8") },
          {
            filename: "outline.json",
            content: Buffer.from(JSON.stringify(outline.parsed, null, 2), "utf-8"),
          },
        ],
      });
      topics = markTopicStatus(topics, next.id, "rejected", now, {
        reject_reason: judge.parsed.hard_fails.join("; ") || "score < threshold",
        retry_after: new Date(now.getTime() + 7 * 86400_000).toISOString(),
      });
      await saveTopics(topics, opts.tenantSlug, baseDir);
      return;
    }

    const publishedThisWeek = countPublishedThisIsoWeek(topics, now);
    if (publishedThisWeek >= tenant.max_posts_per_week_published) {
      const html = await render(
        React.createElement(CapReached, {
          title: outline.parsed.outline.h1_suggestion,
          weightedTotal: judge.parsed.weighted_total,
          weeklyCap: tenant.max_posts_per_week_published,
          publishedThisWeek,
        })
      );
      await sendEmail({
        apiKey: requireEnv(env, "RESEND_API_KEY"),
        from: tenant.email.from,
        to: tenant.email.to,
        replyTo: tenant.email.reply_to,
        subject: `[${tenant.brand.name}] Cap bereikt — draft bewaard: ${outline.parsed.outline.h1_suggestion}`,
        html,
        attachments: [
          { filename: "draft.html", content: Buffer.from(seo.parsed.edited_html, "utf-8") },
        ],
      });
      topics = markTopicStatus(topics, next.id, "cap_deferred", now, {
        retry_after: nextMondayIso(now),
      });
      await saveTopics(topics, opts.tenantSlug, baseDir);
      return;
    }

    currentStage = "imagePrompter";
    const ip = await runImagePrompter(
      {
        title: outline.parsed.outline.h1_suggestion,
        tldr: outline.parsed.outline.tldr_one_liner,
        brand_style: "blue corporate editorial",
      },
      { provider: providers.get("groq"), sleepImpl: sleep }
    );
    usage.push({
      provider: "groq",
      model: ip.raw.model,
      inputTokens: ip.raw.inputTokens,
      outputTokens: ip.raw.outputTokens,
    });

    currentStage = "imageGen";
    const image = await generateBlogImage(
      { prompt: ip.parsed.prompt, negative_prompt: ip.parsed.negative_prompt },
      {
        FAL_API_KEY: requireEnv(env, "FAL_API_KEY"),
        CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
        CF_API_TOKEN: env.CF_API_TOKEN,
      }
    );

    currentStage = "wordpress";
    const wp = createWordpressClient({
      baseUrl: tenant.wordpress.base_url,
      user: requireEnv(env, tenant.wordpress.user_secret_ref),
      appPassword: requireEnv(env, tenant.wordpress.app_password_secret_ref),
    });
    const optimized = await optimizeForWeb({ pngBytes: image.bytes });
    const media = await uploadMedia(wp, {
      bytes: optimized.avifBytes,
      contentType: optimized.contentType,           // "image/avif"
      filename: `${seo.parsed.slug}.avif`,
      altText: ip.parsed.alt_text_nl,
    });

    // Generate JSON-LD schema and append to edited HTML before publish
    const schemaJsonLd = buildAllSchemaJsonLd({
      tenant,
      topic: { pillar: next.pillar, target_keyword: next.target_keyword },
      post: {
        headline: outline.parsed.outline.h1_suggestion,
        description: outline.parsed.outline.tldr_one_liner,
        slug: seo.parsed.slug,
        url: `${tenant.wordpress.base_url}/${seo.parsed.slug}/`,
        datePublished: now.toISOString(),
        imageUrl: media.source_url,
        imageAlt: ip.parsed.alt_text_nl,
      },
      keyEntities: research.parsed.key_entities,
    });
    const finalContent = `${seo.parsed.edited_html}\n${schemaJsonLd}`;

    const post = await createDraftPost(wp, {
      title: outline.parsed.outline.h1_suggestion,
      content: finalContent,
      slug: seo.parsed.slug,
      excerpt: outline.parsed.outline.tldr_one_liner,
      featuredMediaId: media.id,
      categories: [],
      tags: [],
    });
    await setRankMathMeta(wp, post.id, {
      rank_math_title: seo.parsed.meta_title,
      rank_math_description: seo.parsed.meta_description,
      rank_math_focus_keyword: next.target_keyword,
      rank_math_canonical_url: `${tenant.wordpress.base_url}/${seo.parsed.slug}/`,
    });

    currentStage = "email";
    const editUrl = buildEditUrl(tenant.wordpress.base_url, post.id);
    const html = await render(
      React.createElement(Success, {
        title: outline.parsed.outline.h1_suggestion,
        weightedTotal: judge.parsed.weighted_total,
        scoreBreakdown: judge.parsed.scores,
        tldr: outline.parsed.outline.tldr_one_liner,
        imageUrl: media.source_url,
        editUrl,
        previewUrl: post.link,
        targetKeyword: next.target_keyword,
        internalLinksUsed: outline.parsed.outline.internal_links_to_inject,
      })
    );
    await sendEmail({
      apiKey: requireEnv(env, "RESEND_API_KEY"),
      from: tenant.email.from,
      to: tenant.email.to,
      replyTo: tenant.email.reply_to,
      subject: `[${tenant.brand.name}] Concept klaar: ${outline.parsed.outline.h1_suggestion} — score ${judge.parsed.weighted_total.toFixed(1)}`,
      html,
    });

    topics = markTopicStatus(topics, next.id, "published", now, {
      wp_post_id: post.id,
      wp_post_url: post.link,
      key_entities: research.parsed.key_entities,
    });
    await saveTopics(topics, opts.tenantSlug, baseDir);

    const cost = computeRunCost(usage);
    console.log(
      JSON.stringify({
        stage: "complete",
        topicId: next.id,
        postId: post.id,
        costUsd: cost.totalUsd,
        score: judge.parsed.weighted_total,
      })
    );
  } catch (err) {
    await sendErrorEmail(env, tenant, now, currentStage, (err as Error).message);
    throw err;
  }
}

async function sendErrorEmail(
  env: NodeJS.ProcessEnv,
  tenant: TenantConfig,
  now: Date,
  stage: string,
  message: string
): Promise<void> {
  try {
    const html = await render(
      React.createElement(ErrorMail, {
        date: now.toISOString().slice(0, 10),
        stage,
        message,
        runUrl:
          env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
            ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
            : undefined,
      })
    );
    await sendEmail({
      apiKey: env.RESEND_API_KEY ?? "",
      from: tenant.email.from,
      to: tenant.email.to,
      replyTo: tenant.email.reply_to,
      subject: `[${tenant.brand.name}] Pipeline-fout op ${now.toISOString().slice(0, 10)}`,
      html,
    });
  } catch {
    // niets we kunnen doen
  }
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function nextMondayIso(d: Date): string {
  const next = new Date(d);
  const dow = next.getUTCDay();
  const diff = (8 - dow) % 7 || 7;
  next.setUTCDate(next.getUTCDate() + diff);
  next.setUTCHours(4, 15, 0, 0);
  return next.toISOString();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  if (!tenantArg) throw new Error("Usage: orchestrator.ts --tenant=<slug>");
  const slug = tenantArg.split("=")[1]!;
  runPipeline({ tenantSlug: slug }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
