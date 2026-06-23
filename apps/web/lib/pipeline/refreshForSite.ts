/**
 * Refresh executor: closes the loop "publish → forget" by feeding a refresh
 * opportunity into the rewriter agent and storing the result as a new
 * pending_review draft. Records a post_refreshes row to (a) gate future
 * refreshes via cooldown, (b) preserve the before-snapshot for lift analysis.
 */
import { eq } from "drizzle-orm";

import { createProviderRegistry } from "@/llm/client";
import { runRewriter } from "@/agents/rewriter";
import { buildRewriterInputsFromOpportunity } from "@/pipeline/refreshDirectiveBuilder";
import { computeRunCost } from "@/pipeline/costTracker";
import type { RefreshOpportunity } from "@/pipeline/refreshOpportunities";

import type { Site, PublishedPost, Draft, PostRefresh } from "~/lib/db/schema";
import { createDraft } from "~/lib/drafts";
import { getDb } from "~/lib/db/client";
import { publishedPosts as publishedPostsTable } from "~/lib/db/schema";
import { createRefresh, markRefreshDrafted, markRefreshFailed } from "~/lib/refreshes";
import { recordError } from "~/lib/errors/store";

export interface RefreshForSiteDeps {
  /** Override the rewriter runner — tests pass a mock. */
  runRewriterImpl?: typeof runRewriter;
  /** Override draft creation — tests pass a mock. */
  createDraftImpl?: typeof createDraft;
  /** Override refresh row creation — tests pass a mock. */
  createRefreshImpl?: typeof createRefresh;
  /** Override completion markers — tests pass mocks. */
  markRefreshDraftedImpl?: typeof markRefreshDrafted;
  markRefreshFailedImpl?: typeof markRefreshFailed;
  /** Override published-post lookup — tests pass a mock. */
  loadPublishedPostImpl?: (id: string) => Promise<PublishedPost | null>;
  /** Skip provider-registry creation (tests). */
  skipProviderRegistry?: boolean;
}

export interface RefreshForSiteOpts {
  site: Site;
  opportunity: RefreshOpportunity;
}

export interface RefreshForSiteResult {
  refreshId: string;
  draftId: string;
  costUsd: number;
}

export async function refreshForSite(
  opts: RefreshForSiteOpts,
  deps: RefreshForSiteDeps = {}
): Promise<RefreshForSiteResult> {
  const { site, opportunity } = opts;
  const loadPost = deps.loadPublishedPostImpl ?? defaultLoadPublishedPost;
  const post = await loadPost(opportunity.publishedPostId);
  if (!post) {
    throw new Error(`Published post ${opportunity.publishedPostId} not found`);
  }
  if (post.siteId !== site.id) {
    throw new Error(
      `Published post ${post.id} belongs to site ${post.siteId}, not ${site.id}`
    );
  }

  const createRefreshFn = deps.createRefreshImpl ?? createRefresh;
  const refresh = await createRefreshFn({
    siteId: site.id,
    publishedPostId: post.id,
    category: opportunity.category,
    rationale: opportunity.rationale,
    beforeSnapshot: {
      clicks_30d: opportunity.signals.clicks_30d,
      impressions_30d: opportunity.signals.impressions_30d,
      avg_position: opportunity.signals.avg_position,
      top_queries: opportunity.signals.top_queries,
    },
  });

  const markDraftedFn = deps.markRefreshDraftedImpl ?? markRefreshDrafted;
  const markFailedFn = deps.markRefreshFailedImpl ?? markRefreshFailed;

  try {
    const { issues, fix_first } = buildRewriterInputsFromOpportunity(opportunity);

    let providerInst;
    if (deps.skipProviderRegistry) {
      providerInst = undefined as never;
    } else {
      const env = { ...process.env };
      if (site.apiKeys?.gemini) env.GEMINI_API_KEY = site.apiKeys.gemini;
      if (site.apiKeys?.anthropic) env.ANTHROPIC_API_KEY = site.apiKeys.anthropic;
      const providers = createProviderRegistry(env);
      const providerName = site.apiKeys?.gemini ? "gemini" : "anthropic";
      providerInst = providers.get(providerName);
    }

    const runRewriterFn = deps.runRewriterImpl ?? runRewriter;
    const res = await runRewriterFn(
      {
        html: post.contentHtml,
        target_keyword: post.targetKeyword,
        brand_voice: site.brandVoice,
        ban_list: site.banList,
        issues_to_address: issues,
        fix_first,
      },
      { provider: providerInst as Parameters<typeof runRewriter>[1]["provider"] }
    );

    const cost = computeRunCost([
      {
        provider: res.raw.provider,
        model: res.raw.model,
        inputTokens: res.raw.inputTokens,
        outputTokens: res.raw.outputTokens,
      },
    ]);

    const tldrPrefix = `[Refresh: ${opportunity.category.replace(/_/g, " ")}]`;
    const tldr = post.tldr ? `${tldrPrefix} ${post.tldr}` : tldrPrefix;

    const createDraftFn = deps.createDraftImpl ?? createDraft;
    const draft = await createDraftFn({
      siteId: site.id,
      topicId: null,
      runId: null,
      status: "pending_review",
      title: post.title,
      slug: post.slug,
      contentHtml: res.parsed.improved_html,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      tldr,
      imagePath: post.imagePath,
      imageAlt: post.imageAlt,
      hardFails: res.parsed.change_log.map((c) => `refresh-change: ${c}`),
      costUsd: cost.totalUsd,
    });

    await markDraftedFn(refresh.id, draft.id, cost.totalUsd);

    return {
      refreshId: refresh.id,
      draftId: draft.id,
      costUsd: cost.totalUsd,
    };
  } catch (err) {
    const errObj = err as Error;
    void recordError({
      siteId: site.id,
      source: "refresh",
      severity: "error",
      message: errObj.message,
      stack: errObj.stack,
      context: {
        refreshId: refresh.id,
        publishedPostId: post.id,
        publishedPostSlug: post.slug,
        category: opportunity.category,
        siteSlug: site.slug,
      },
    });
    await markFailedFn(refresh.id, errObj.message);
    throw err;
  }
}

async function defaultLoadPublishedPost(id: string): Promise<PublishedPost | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(publishedPostsTable)
    .where(eq(publishedPostsTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// Re-export types other callers may want
export type { Draft, PostRefresh };
