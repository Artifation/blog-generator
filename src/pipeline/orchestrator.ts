import * as React from "react";
import { render } from "@react-email/render";
import { loadTenant } from "@/config/loader";
import { loadTopics, saveTopics } from "@/config/topics";
import { selectNextTopic } from "./topicSelector.ts";
import { detectCannibalization } from "./cannibalization.ts";
import { fetchSitemapEntries } from "./sitemap.ts";
import { postProcessDraftHtml } from "./htmlPostProcess.ts";
import { computeDeterministicRubricSignals } from "./rubric.ts";
import { checkCitations, enrichSignalsWithCitationCheck } from "./citationCheck.ts";
import { detectAiContent } from "./aiDetection.ts";
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
import { createDraftPost, buildEditUrl, listRecentPosts } from "@/wordpress/posts";
import { buildYoastMeta } from "@/wordpress/yoastSeo";
import { pingIndexNow } from "./indexNow.ts";
import { buildAnchorHistory, loadCachedAnchorHistory, saveCachedAnchorHistory } from "./anchorTracker.ts";
import type { AnchorHistoryEntry } from "./anchorTracker.ts";
import { appendEditorialLogEntry } from "./editorialLog.ts";
import { sendEmail } from "@/email/resend";
import { Success } from "@/email/templates/Success";
import { Reject } from "@/email/templates/Reject";
import { CapReached } from "@/email/templates/CapReached";
import { ErrorMail } from "@/email/templates/Error";
import { Repurposed } from "@/email/templates/Repurposed";
import { runRepurposerLinkedIn, runRepurposerNewsletter, runRepurposerXThread } from "@/agents/repurposer";
import { buildAllSchemaJsonLd } from "./schemaGenerator.ts";
import { detectCannibalizationViaGsc } from "./cannibalizationGsc.ts";
import type { TenantConfig } from "@/config/tenant";

export interface OrchestratorOpts {
  tenantSlug: string;
  baseDir?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  fetchImpl?: typeof fetch;
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
    // Hostinger's WAF blokkeert GitHub Actions IP range op /sitemap*.xml endpoints
    // ondanks browser-UA. Switch naar WP REST API (authenticated via App Password)
    // — geeft dezelfde data (URL + slug per published post) zonder WAF-issue.
    const wpForSitemap = createWordpressClient({
      baseUrl: tenant.wordpress.base_url,
      user: requireEnv(env, tenant.wordpress.user_secret_ref),
      appPassword: requireEnv(env, tenant.wordpress.app_password_secret_ref),
    });
    const recentPosts = await listRecentPosts(wpForSitemap, 100);
    const sitemap = recentPosts.map((p) => ({ url: p.link, slug: p.slug }));
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

    if (tenant.features.search_console?.enabled) {
      try {
        const gscCheck = await detectCannibalizationViaGsc({
          gscOpts: { serviceAccountJson: requireEnv(env, "GSC_SERVICE_ACCOUNT_JSON") },
          propertyUrl: tenant.features.search_console.property_url,
          targetKeyword: next.target_keyword,
          now,
        });
        if (gscCheck.isCannibalized) {
          console.log(JSON.stringify({ stage: "gsc-cannibalization", competing: gscCheck.competingPages.length }));
          topics = markTopicStatus(topics, next.id, "cannibalization_skipped", now, { reject_reason: gscCheck.reason });
          await saveTopics(topics, opts.tenantSlug, baseDir);
          return;
        }
      } catch (err) {
        console.log(JSON.stringify({ stage: "gsc-cannibalization", warning: (err as Error).message }));
        // niet-fataal: pipeline gaat door met enkel tekst-only resultaat
      }
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

    // Build anchor history before Strategist to inform anchor diversity
    let anchorHistory: AnchorHistoryEntry[] = [];
    if (tenant.features.anchor_tracker?.enabled) {
      const publishedUrls = topics
        .filter((t) => t.status === "published" && t.wp_post_url)
        .map((t) => t.wp_post_url!);
      if (publishedUrls.length > 0) {
        const cacheFile = `data/anchor-history-${opts.tenantSlug}.json`;
        const ttlHours = tenant.features.anchor_tracker.cache_ttl_hours;
        const cached = await loadCachedAnchorHistory(cacheFile, ttlHours);
        if (cached) {
          anchorHistory = cached;
        } else {
          try {
            anchorHistory = await buildAnchorHistory({
              publishedPostUrls: publishedUrls,
              fetchImpl: opts.fetchImpl,
            });
            await saveCachedAnchorHistory(cacheFile, anchorHistory);
          } catch (err) {
            console.log(
              JSON.stringify({ stage: "anchor-tracker", warning: (err as Error).message })
            );
          }
        }
      }
    }

    currentStage = "strategist";
    const outline = await runStrategist(
      {
        research: research.parsed,
        brand_voice: tenant.brand.voice,
        target_keyword: next.target_keyword,
        intent: next.intent,
        intended_word_count_target: next.intended_word_count_target,
        ...(anchorHistory.length > 0 ? { anchor_history: anchorHistory } : {}),
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
        key_facts: research.parsed.key_facts,
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

    // Post-process: em-dashes, H3-nummering, bold-italic combos, markdown-asterisks.
    // Zie src/pipeline/htmlPostProcess.ts voor regels en redenen.
    seo.parsed.edited_html = postProcessDraftHtml(seo.parsed.edited_html);

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

    // Pre-build schema JSON-LD before Quality Judge zodat de seo_schema rubric-signal
    // het kan zien. We hebben de finale image-URL nog niet (image-gen komt later),
    // dus gebruiken we een placeholder URL die later vervangen wordt vóór WP-publish.
    const preJudgeSchemaJsonLd = buildAllSchemaJsonLd({
      tenant,
      topic: { pillar: next.pillar, target_keyword: next.target_keyword },
      post: {
        headline: outline.parsed.outline.h1_suggestion,
        description: outline.parsed.outline.tldr_one_liner,
        slug: seo.parsed.slug,
        url: `${tenant.wordpress.base_url}/${seo.parsed.slug}/`,
        datePublished: now.toISOString(),
        imageUrl: `${tenant.wordpress.base_url}/wp-content/uploads/${seo.parsed.slug}-placeholder.avif`,
        imageAlt: outline.parsed.outline.h1_suggestion,
      },
      keyEntities: research.parsed.key_entities,
    });
    const htmlForJudge = `${seo.parsed.edited_html}\n${preJudgeSchemaJsonLd}`;

    let signals = computeDeterministicRubricSignals({
      html: htmlForJudge,
      banList: tenant.brand.ban_list,
      targetKeyword: next.target_keyword,
      internalUrls: outline.parsed.outline.internal_links_to_inject.map((l) => l.url),
    });

    currentStage = "citationCheck";
    const citationUrls = [
      ...research.parsed.external_authority_sources.map((s) => s.url),
      ...outline.parsed.outline.external_links_to_cite,
    ];
    const citationResult = await checkCitations({
      urls: citationUrls,
      fetchImpl: opts.fetchImpl,
      timeoutMs: 5000,
    });
    signals = enrichSignalsWithCitationCheck(signals, citationResult);

    currentStage = "aiDetection";
    if (tenant.features.ai_detection.enabled) {
      try {
        const aiApiKey = env.GPTZERO_API_KEY ?? env.ORIGINALITY_API_KEY ?? "";
        const aiResult = await detectAiContent({
          text: seo.parsed.edited_html.replace(/<[^>]+>/g, " "),
          apiKey: aiApiKey,
          provider: tenant.features.ai_detection.provider,
          fetchImpl: opts.fetchImpl,
        });
        signals = { ...signals, ai_score_pct: aiResult.ai_score_pct };
      } catch (err) {
        console.warn(
          JSON.stringify({ stage: "aiDetection", warning: "AI detection failed, skipping", error: (err as Error).message })
        );
      }
    }

    currentStage = "qualityJudge";
    const judge = await runQualityJudge(
      {
        edited_html: htmlForJudge,
        target_keyword: next.target_keyword,
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
      meta: buildYoastMeta({
        title: seo.parsed.meta_title,
        description: seo.parsed.meta_description,
        focusKeyword: next.target_keyword,
        canonicalUrl: `${tenant.wordpress.base_url}/${seo.parsed.slug}/`,
      }),
    });

    // IndexNow ping — notifies Bing, Yandex, Naver, Seznam, Yep (not Google).
    // Failure is non-fatal: pipeline continues regardless.
    if (tenant.features.indexnow.enabled) {
      try {
        const indexNowKey = env[tenant.features.indexnow.key_secret_ref] ?? "";
        const host = new URL(tenant.wordpress.base_url).hostname;
        await pingIndexNow({
          host,
          key: indexNowKey,
          urlList: [`${tenant.wordpress.base_url}/${seo.parsed.slug}/`],
          fetchImpl: opts.fetchImpl,
        });
      } catch (err) {
        console.warn(
          JSON.stringify({
            stage: "indexNow",
            warning: "IndexNow ping failed, skipping",
            error: (err as Error).message,
          })
        );
      }
    }

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

    // Editorial review log — Article 50 EU AI Act audit trail.
    await appendEditorialLogEntry(
      {
        post_id: post.id,
        post_url: post.link,
        post_title: outline.parsed.outline.h1_suggestion,
        reviewer: tenant.author.name,
        approved_at: now.toISOString(),
        ai_models_used: [...new Set(usage.map((u) => u.model))],
        pipeline_version: env.GITHUB_SHA?.slice(0, 7) ?? "local",
        rubric_total: judge.parsed.weighted_total,
        topic_id: next.id,
      },
      { tenant_slug: opts.tenantSlug, baseDir, now }
    );

    // Repurpose stage — inline na success-email + editorial log.
    // Failure is non-fatal: warning gelogd, publish blijft success.
    if (tenant.features.repurposer?.enabled && (tenant.features.repurposer.formats ?? []).length > 0) {
      try {
        const blog = {
          title: outline.parsed.outline.h1_suggestion,
          tldr: outline.parsed.outline.tldr_one_liner,
          url: post.link,
          target_keyword: next.target_keyword,
          pillar: next.pillar,
        };
        const formats = tenant.features.repurposer.formats ?? [];
        const [linkedInResult, newsletterResult, xthreadResult] = await Promise.all([
          formats.includes("linkedin")
            ? runRepurposerLinkedIn({ blog, brand_voice: tenant.brand.voice }, { provider: providers.get("anthropic"), sleepImpl: sleep })
            : null,
          formats.includes("newsletter")
            ? runRepurposerNewsletter({ blog, brand_voice: tenant.brand.voice }, { provider: providers.get("anthropic"), sleepImpl: sleep })
            : null,
          formats.includes("xthread")
            ? runRepurposerXThread({ blog, brand_voice: tenant.brand.voice }, { provider: providers.get("anthropic"), sleepImpl: sleep })
            : null,
        ]);
        const repurposedHtml = await render(
          React.createElement(Repurposed, {
            blogTitle: blog.title,
            blogUrl: blog.url,
            linkedin: linkedInResult?.parsed ?? { hook_first_200: "", full_text: "", cta: "" },
            newsletter: newsletterResult?.parsed ?? { subject_line: "", preheader: "", body_html: "", cta_url: blog.url },
            xthread: xthreadResult?.parsed ?? { tweets: [], blog_link_tweet_index: 0 },
          })
        );
        await sendEmail({
          apiKey: requireEnv(env, "RESEND_API_KEY"),
          from: tenant.email.from,
          to: tenant.email.to,
          replyTo: tenant.email.reply_to,
          subject: `[${tenant.brand.name}] Repurposed: ${blog.title}`,
          html: repurposedHtml,
        });
      } catch (err) {
        console.log(JSON.stringify({ stage: "repurposer", warning: (err as Error).message }));
      }
    }

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
