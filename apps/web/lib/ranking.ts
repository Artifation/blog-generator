import path from "node:path";
import { eq, and } from "drizzle-orm";
import {
  loadOrFetchPostHistory,
  computeHistorySummary,
  type PostHistoryCache,
  type HistorySummary,
} from "@/pipeline/gscPostHistory";
import { ensureSchema, getDb } from "./db/client";
import { postRefreshes, type Site, type PublishedPost } from "./db/schema";

export interface PostRankingResult {
  ok: true;
  history: PostHistoryCache;
  summary: HistorySummary;
  /** Refresh-trigger dates (ISO YYYY-MM-DD) for vertical markers on the sparkline. */
  refreshMarkers: { date: string; category: string }[];
}

export interface PostRankingSkip {
  ok: false;
  reason: "missing_gsc_credentials" | "no_property_url" | "error";
  message: string;
}

export interface GetPostRankingOpts {
  site: Site;
  post: PublishedPost;
  cacheDir?: string;
  now?: Date;
  forceRefresh?: boolean;
}

/**
 * Loads (or fetches) the 90d GSC time-series for a single post, plus all
 * refresh-trigger dates for that post so the sparkline can annotate them.
 */
export async function getPostRankingForSite(
  opts: GetPostRankingOpts
): Promise<PostRankingResult | PostRankingSkip> {
  const { site, post } = opts;
  const serviceAccountJson = site.apiKeys?.gscServiceAccountJson;
  if (!serviceAccountJson) {
    return {
      ok: false,
      reason: "missing_gsc_credentials",
      message: "Geen GSC service-account JSON ingesteld. Vul deze in onder Instellingen → API-keys.",
    };
  }

  const features = site.features as { search_console?: { property_url?: string } } | undefined;
  const propertyUrl =
    features?.search_console?.property_url?.trim() || `sc-domain:${site.domain}`;
  if (!propertyUrl) {
    return { ok: false, reason: "no_property_url", message: "Geen GSC property URL afleidbaar." };
  }

  const url = post.externalUrl ?? `https://${site.domain}/${post.slug}`;
  const cacheDir =
    opts.cacheDir ?? path.resolve(process.cwd(), "../../data/gsc-post-history");
  const now = opts.now ?? new Date();

  try {
    const history = await loadOrFetchPostHistory({
      cacheDir,
      siteSlug: site.slug,
      postId: post.id,
      url,
      propertyUrl,
      gsc: { serviceAccountJson },
      now,
      forceRefresh: opts.forceRefresh,
    });

    const summary = computeHistorySummary(history.days, now);

    await ensureSchema();
    const db = getDb();
    const refreshRows = await db
      .select()
      .from(postRefreshes)
      .where(
        and(
          eq(postRefreshes.siteId, site.id),
          eq(postRefreshes.publishedPostId, post.id)
        )
      );
    const refreshMarkers = refreshRows.map((r) => ({
      date: r.triggeredAt.slice(0, 10),
      category: r.category,
    }));

    return { ok: true, history, summary, refreshMarkers };
  } catch (err) {
    return { ok: false, reason: "error", message: (err as Error).message };
  }
}
