/**
 * GSC performance-snapshot writer.
 *
 * Voor elke gepubliceerde post: trek GSC-data (clicks/impressies/positie + top
 * queries) en schrijf naar data/gsc-snapshots/<tenant>/<date>.json. Snapshots
 * vormen de feiten-basis voor de feedback-loop die later topicSuggester +
 * writer-prompts gaat informeren ("welke posts presteren goed, welke verloren
 * positie, welke queries komen tot 1e pagina"). Dit module gokt niet en
 * interpreteert niet — het verzamelt alleen.
 *
 * Wordt aangeroepen door:
 *  - `scripts/gsc-snapshot.ts` weekly cron (alle tenants + alle posts)
 *  - direct vanuit `runForSite.ts` post-publish (baseline snapshot dag-0)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { querySearchConsole, type GscClientOpts } from "@/integrations/searchConsole";

export interface PublishedPostRef {
  url: string;            // Absolute URL inclusief https://
  published_at: string;   // ISO date, YYYY-MM-DD genoeg
  target_keyword: string;
  pillar?: string;
}

export interface PostPerformance {
  url: string;
  published_at: string;
  target_keyword: string;
  pillar?: string;
  days_live: number;
  last_30d: PerformanceWindow;
  all_time: PerformanceWindow;
  top_queries: TopQuery[];
}

interface PerformanceWindow {
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number;
}

interface TopQuery {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
}

export interface GscSnapshot {
  snapshot_date: string;          // YYYY-MM-DD
  tenant_slug: string;
  property_url: string;
  pulled_at_iso: string;
  posts: PostPerformance[];
  summary: {
    posts_with_data: number;
    posts_with_zero_impressions: number;
    total_clicks_last_30d: number;
    total_impressions_last_30d: number;
  };
}

export interface GscSnapshotOpts {
  tenantSlug: string;
  propertyUrl: string;            // e.g. "sc-domain:artifation.nl"
  posts: PublishedPostRef[];
  gsc: GscClientOpts;
  now?: Date;
  /** Override data-root (tests/sandbox); default "data". */
  dataDir?: string;
  /** Top-N queries per post (default 5). */
  topQueriesPerPost?: number;
  /** Days to look back for "last_30d" window (default 30). */
  windowDays?: number;
}

export interface GscSnapshotResult {
  snapshot: GscSnapshot;
  filePath: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function offsetDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

function emptyWindow(): PerformanceWindow {
  return { clicks: 0, impressions: 0, ctr: 0, avg_position: 0 };
}

export async function runGscSnapshot(opts: GscSnapshotOpts): Promise<GscSnapshotResult> {
  const now = opts.now ?? new Date();
  const dataDir = opts.dataDir ?? "data";
  const windowDays = opts.windowDays ?? 30;
  const topN = opts.topQueriesPerPost ?? 5;

  const endDate = ymd(offsetDays(now, -1)); // GSC heeft ~2-3 dagen lag, gisteren is safest
  const startDate30d = ymd(offsetDays(now, -1 - windowDays));
  // All-time window: vanaf de oudste publish-datum tot endDate. Maar GSC max
  // 16 maanden, dus cap.
  const oldestPublish = opts.posts.length > 0
    ? opts.posts.map((p) => p.published_at).sort()[0]!
    : startDate30d;
  const allTimeStart = oldestPublish < ymd(offsetDays(now, -480))
    ? ymd(offsetDays(now, -480))
    : oldestPublish;

  const performance: PostPerformance[] = [];

  for (const post of opts.posts) {
    const daysLive = Math.max(
      0,
      Math.floor((now.getTime() - new Date(post.published_at).getTime()) / 86_400_000)
    );

    // Last-30d totals voor deze specifieke URL
    let last30d = emptyWindow();
    try {
      const res = await querySearchConsole(opts.gsc, {
        propertyUrl: opts.propertyUrl,
        startDate: startDate30d,
        endDate,
        dimensions: ["page"],
        rowLimit: 1,
        filters: [{ dimension: "page", operator: "equals", expression: post.url }],
      });
      if (res.rows.length > 0) {
        const row = res.rows[0]!;
        last30d = {
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          avg_position: row.position,
        };
      }
    } catch (err) {
      console.warn(JSON.stringify({ stage: "gsc-snapshot", url: post.url, window: "30d", warning: (err as Error).message }));
    }

    // All-time-since-publish totals
    let allTime = emptyWindow();
    if (daysLive > 0) {
      try {
        const res = await querySearchConsole(opts.gsc, {
          propertyUrl: opts.propertyUrl,
          startDate: allTimeStart,
          endDate,
          dimensions: ["page"],
          rowLimit: 1,
          filters: [{ dimension: "page", operator: "equals", expression: post.url }],
        });
        if (res.rows.length > 0) {
          const row = res.rows[0]!;
          allTime = {
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            avg_position: row.position,
          };
        }
      } catch (err) {
        console.warn(JSON.stringify({ stage: "gsc-snapshot", url: post.url, window: "all", warning: (err as Error).message }));
      }
    }

    // Top queries voor deze URL — gefilterd op page, gegroepeerd op query
    let topQueries: TopQuery[] = [];
    try {
      const res = await querySearchConsole(opts.gsc, {
        propertyUrl: opts.propertyUrl,
        startDate: startDate30d,
        endDate,
        dimensions: ["query"],
        rowLimit: topN * 4,
        filters: [{ dimension: "page", operator: "equals", expression: post.url }],
      });
      topQueries = res.rows
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, topN)
        .map((r) => ({
          query: r.keys[0] ?? "",
          impressions: r.impressions,
          clicks: r.clicks,
          position: r.position,
        }));
    } catch (err) {
      console.warn(JSON.stringify({ stage: "gsc-snapshot", url: post.url, window: "top-queries", warning: (err as Error).message }));
    }

    performance.push({
      url: post.url,
      published_at: post.published_at,
      target_keyword: post.target_keyword,
      pillar: post.pillar,
      days_live: daysLive,
      last_30d: last30d,
      all_time: allTime,
      top_queries: topQueries,
    });
  }

  const snapshot: GscSnapshot = {
    snapshot_date: ymd(now),
    tenant_slug: opts.tenantSlug,
    property_url: opts.propertyUrl,
    pulled_at_iso: now.toISOString(),
    posts: performance,
    summary: {
      posts_with_data: performance.filter((p) => p.last_30d.impressions > 0).length,
      posts_with_zero_impressions: performance.filter((p) => p.last_30d.impressions === 0).length,
      total_clicks_last_30d: performance.reduce((s, p) => s + p.last_30d.clicks, 0),
      total_impressions_last_30d: performance.reduce((s, p) => s + p.last_30d.impressions, 0),
    },
  };

  const outDir = path.join(dataDir, "gsc-snapshots", opts.tenantSlug);
  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, `${snapshot.snapshot_date}.json`);
  await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf-8");

  return { snapshot, filePath };
}
