import path from "node:path";
import { eq, and, desc } from "drizzle-orm";
import { getDb, ensureSchema } from "./db/client";
import { postRefreshes, type PostRefresh, type NewPostRefresh } from "./db/schema";
import { newId } from "./db/ids";
import {
  deriveRefreshOpportunities,
  type RefreshOpportunity,
  type PublishedPostRef as OpportunityPublishedPostRef,
  type RefreshHistoryEntry,
} from "@/pipeline/refreshOpportunities";
import { loadLatestSnapshot } from "@/pipeline/gscPerformanceInsights";
import type { Site } from "./db/schema";
import { listPublishedPostsForSite } from "./drafts";

export interface ListRefreshOpportunitiesOpts {
  site: Site;
  /** Override data-dir (default: repo-root data/). */
  dataDir?: string;
  now?: Date;
}

export interface ListRefreshOpportunitiesResult {
  opportunities: RefreshOpportunity[];
  /** Whether a GSC snapshot was found and used for classification. */
  hasSnapshot: boolean;
  snapshotDate?: string;
  /** Map publishedPostId → most recent refresh row (for UI history badge). */
  recentRefreshes: Record<string, PostRefresh | undefined>;
}

/**
 * Combines GSC snapshot + publishedPosts + refresh history into the ranked
 * list the UI renders. Pure data-orchestration over the DB; no LLM calls.
 */
export async function listRefreshOpportunitiesForSite(
  opts: ListRefreshOpportunitiesOpts
): Promise<ListRefreshOpportunitiesResult> {
  await ensureSchema();
  const now = opts.now ?? new Date();
  const dataDir = opts.dataDir ?? path.resolve(process.cwd(), "../../data");

  const [published, refreshes] = await Promise.all([
    listPublishedPostsForSite(opts.site.id),
    listRefreshesForSite(opts.site.id),
  ]);

  const snapshot = await loadLatestSnapshot(opts.site.slug, dataDir).catch(() => null);

  const postRefs: OpportunityPublishedPostRef[] = published.map((p) => ({
    publishedPostId: p.id,
    url: p.externalUrl ?? `https://${opts.site.domain}/${p.slug}`,
    title: p.title,
    publishedAt: p.publishedAt,
    targetKeyword: p.targetKeyword,
    pillarSlug: p.pillarSlug,
    slug: p.slug,
  }));

  const history: RefreshHistoryEntry[] = refreshes.map((r) => ({
    publishedPostId: r.publishedPostId,
    triggeredAt: r.triggeredAt,
  }));

  const opportunities = deriveRefreshOpportunities({
    snapshot,
    publishedPosts: postRefs,
    refreshHistory: history,
    now,
  });

  const recentRefreshes: Record<string, PostRefresh | undefined> = {};
  for (const r of refreshes) {
    const cur = recentRefreshes[r.publishedPostId];
    if (!cur || r.triggeredAt > cur.triggeredAt) {
      recentRefreshes[r.publishedPostId] = r;
    }
  }

  return {
    opportunities,
    hasSnapshot: snapshot !== null,
    snapshotDate: snapshot?.snapshot_date,
    recentRefreshes,
  };
}

export async function listRefreshesForSite(siteId: string): Promise<PostRefresh[]> {
  await ensureSchema();
  const db = getDb();
  return db
    .select()
    .from(postRefreshes)
    .where(eq(postRefreshes.siteId, siteId))
    .orderBy(desc(postRefreshes.triggeredAt));
}

export async function getRefresh(id: string): Promise<PostRefresh | null> {
  await ensureSchema();
  const db = getDb();
  const rows = await db.select().from(postRefreshes).where(eq(postRefreshes.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface CreateRefreshInput {
  siteId: string;
  publishedPostId: string;
  category: PostRefresh["category"];
  rationale?: string;
  beforeSnapshot?: NewPostRefresh["beforeSnapshot"];
}

export async function createRefresh(input: CreateRefreshInput): Promise<PostRefresh> {
  await ensureSchema();
  const db = getDb();
  const id = newId("rfr");
  await db.insert(postRefreshes).values({
    id,
    siteId: input.siteId,
    publishedPostId: input.publishedPostId,
    category: input.category,
    status: "queued",
    rationale: input.rationale ?? null,
    beforeSnapshot: input.beforeSnapshot ?? null,
  });
  return (await getRefresh(id))!;
}

export async function markRefreshDrafted(
  id: string,
  draftId: string,
  costUsd: number | null
): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db
    .update(postRefreshes)
    .set({
      status: "drafted",
      draftId,
      completedAt: new Date().toISOString(),
      costUsd,
    })
    .where(eq(postRefreshes.id, id));
}

export async function markRefreshFailed(id: string, errorMessage: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db
    .update(postRefreshes)
    .set({
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage,
    })
    .where(eq(postRefreshes.id, id));
}

export async function getMostRecentRefreshForPost(
  siteId: string,
  publishedPostId: string
): Promise<PostRefresh | null> {
  await ensureSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(postRefreshes)
    .where(
      and(
        eq(postRefreshes.siteId, siteId),
        eq(postRefreshes.publishedPostId, publishedPostId)
      )
    )
    .orderBy(desc(postRefreshes.triggeredAt))
    .limit(1);
  return rows[0] ?? null;
}
