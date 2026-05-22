/**
 * Per-post 90d GSC time-series with file-based caching.
 *
 * Pulls daily clicks/impressions/CTR/position for a single URL from GSC
 * (`dimensions: ["date"]`) and the top-5 ranking queries
 * (`dimensions: ["query"]` filtered to the URL). Results are cached to
 * `<cacheDir>/<siteSlug>/<postId>.json` with a 6h TTL so repeat page-loads
 * don't hammer the GSC API.
 *
 * Used by the /published/[postId] ranking-panel and the /refreshes
 * effect-column. Caller injects gsc credentials so this module stays free
 * of env-coupling.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { querySearchConsole, type GscClientOpts } from "@/integrations/searchConsole";

export interface PostHistoryDay {
  date: string;          // YYYY-MM-DD
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PostHistoryQuery {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface PostHistoryCache {
  pulled_at_iso: string;
  url: string;
  days: PostHistoryDay[];
  topQueries: PostHistoryQuery[];
}

export interface LoadOrFetchOpts {
  cacheDir: string;
  siteSlug: string;
  postId: string;
  url: string;
  propertyUrl: string;
  gsc: GscClientOpts;
  /** Days of history to pull (default 90). */
  windowDays?: number;
  /** Top-N queries (default 5). */
  topN?: number;
  /** Override the time-now (tests). */
  now?: Date;
  /** Skip cache and refetch. */
  forceRefresh?: boolean;
  /** Cache TTL in hours (default 6). */
  ttlHours?: number;
}

const DEFAULT_WINDOW = 90;
const DEFAULT_TOP_N = 5;
const DEFAULT_TTL_HOURS = 6;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function offsetDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export async function loadOrFetchPostHistory(
  opts: LoadOrFetchOpts
): Promise<PostHistoryCache> {
  const now = opts.now ?? new Date();
  const ttlMs = (opts.ttlHours ?? DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
  const cacheFile = path.join(opts.cacheDir, opts.siteSlug, `${opts.postId}.json`);

  if (!opts.forceRefresh) {
    const cached = await readCache(cacheFile);
    if (cached) {
      const age = now.getTime() - new Date(cached.pulled_at_iso).getTime();
      if (age < ttlMs && cached.url === opts.url) {
        return cached;
      }
    }
  }

  const fresh = await fetchFromGsc(opts, now);
  await writeCache(cacheFile, fresh);
  return fresh;
}

async function readCache(file: string): Promise<PostHistoryCache | null> {
  try {
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw) as PostHistoryCache;
  } catch {
    return null;
  }
}

async function writeCache(file: string, data: PostHistoryCache): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

async function fetchFromGsc(opts: LoadOrFetchOpts, now: Date): Promise<PostHistoryCache> {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW;
  const topN = opts.topN ?? DEFAULT_TOP_N;
  const endDate = ymd(offsetDays(now, -1)); // yesterday — GSC lag
  const startDate = ymd(offsetDays(now, -1 - windowDays));

  // Daily series
  const dailyRes = await querySearchConsole(opts.gsc, {
    propertyUrl: opts.propertyUrl,
    startDate,
    endDate,
    dimensions: ["date"],
    rowLimit: windowDays + 10,
    filters: [{ dimension: "page", operator: "equals", expression: opts.url }],
  });

  const days: PostHistoryDay[] = dailyRes.rows
    .map((r) => ({
      date: r.keys[0] ?? "",
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }))
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top queries
  const queryRes = await querySearchConsole(opts.gsc, {
    propertyUrl: opts.propertyUrl,
    startDate,
    endDate,
    dimensions: ["query"],
    rowLimit: topN * 4,
    filters: [{ dimension: "page", operator: "equals", expression: opts.url }],
  });

  const topQueries: PostHistoryQuery[] = queryRes.rows
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, topN)
    .map((r) => ({
      query: r.keys[0] ?? "",
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
    }));

  return {
    pulled_at_iso: now.toISOString(),
    url: opts.url,
    days,
    topQueries,
  };
}

export interface HistorySummary {
  last7d: {
    clicks: number;
    impressions: number;
    avgPosition: number;
    avgCtr: number;
  };
  /** 7d window before the most recent 7d window (days 8-14 ago). Null when
   *  not enough data exists. */
  prior7d: {
    clicks: number;
    impressions: number;
    avgPosition: number;
    avgCtr: number;
  } | null;
  /** prior7d → last7d deltas. null when prior7d is null. */
  deltaVsPrior: {
    clicksDelta: number;
    impressionsDelta: number;
    /** Position delta: negative = improved (lower position number = better rank). */
    positionDelta: number;
    ctrDelta: number;
  } | null;
}

export function computeHistorySummary(days: PostHistoryDay[], now: Date): HistorySummary {
  const cutoffRecent = offsetDays(now, -7).toISOString().slice(0, 10);
  const cutoffPrior = offsetDays(now, -14).toISOString().slice(0, 10);

  const recent = days.filter((d) => d.date >= cutoffRecent);
  const prior = days.filter((d) => d.date >= cutoffPrior && d.date < cutoffRecent);

  const last7d = aggregate(recent);
  const prior7d = prior.length > 0 ? aggregate(prior) : null;

  const deltaVsPrior =
    prior7d != null
      ? {
          clicksDelta: last7d.clicks - prior7d.clicks,
          impressionsDelta: last7d.impressions - prior7d.impressions,
          positionDelta: last7d.avgPosition - prior7d.avgPosition,
          ctrDelta: last7d.avgCtr - prior7d.avgCtr,
        }
      : null;

  return { last7d, prior7d, deltaVsPrior };
}

function aggregate(days: PostHistoryDay[]): HistorySummary["last7d"] {
  if (days.length === 0) {
    return { clicks: 0, impressions: 0, avgPosition: 0, avgCtr: 0 };
  }
  const clicks = days.reduce((s, d) => s + d.clicks, 0);
  const impressions = days.reduce((s, d) => s + d.impressions, 0);
  // Weighted-average position by impressions when available, else flat avg
  const totalImpr = impressions;
  const avgPosition =
    totalImpr > 0
      ? days.reduce((s, d) => s + d.position * d.impressions, 0) / totalImpr
      : days.reduce((s, d) => s + d.position, 0) / days.length;
  const avgCtr = totalImpr > 0 ? clicks / totalImpr : 0;
  return { clicks, impressions, avgPosition, avgCtr };
}
