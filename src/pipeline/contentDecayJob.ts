/**
 * Weekly content-decay monitoring job (GSC).
 *
 * Compares GSC data for the last 30 days against the preceding 30 days.
 * Flags pages where position degraded ≥2.0 places OR clicks dropped ≥30%.
 * Emails the top-10 decaying pages to the editorial team and writes a run log
 * to data/content-decay-runs/<tenant>/<date>.json.
 */
import * as React from "react";
import { render } from "@react-email/render";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTenant } from "@/config/loader";
import { querySearchConsole } from "@/integrations/searchConsole";
import { sendEmail } from "@/email/resend";
import { ContentDecayAlert } from "@/email/templates/ContentDecayAlert";
import type { ContentDecayItem } from "@/email/templates/ContentDecayAlert";

export interface ContentDecayJobOpts {
  tenantSlug: string;
  baseDir?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

interface PageMetrics {
  clicks: number;
  impressions: number;
  positionSum: number;
  positionCount: number;
}

interface DecayRunLog {
  run_at: string;
  tenant: string;
  period_now: { start: string; end: string };
  period_prev: { start: string; end: string };
  total_pages_analyzed: number;
  decaying_count: number;
  top_decaying: ContentDecayItem[];
  email_sent: boolean;
}

const POSITION_DECAY_THRESHOLD = 2.0;
const CLICKS_DECAY_RATIO = 0.3; // 30% drop
const TOP_N = 10;

function dateYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function offsetDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

function aggregateByPage(rows: { keys: string[]; clicks: number; impressions: number; position: number }[]): Map<string, PageMetrics> {
  const map = new Map<string, PageMetrics>();
  for (const row of rows) {
    // When dimensions=["page"] the page is at keys[0].
    // When dimensions=["query","page"] or mixed, page may be elsewhere — we use keys[0] for page-only queries.
    const page = row.keys[0] ?? "";
    if (!page) continue;
    const existing = map.get(page);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.positionSum += row.position;
      existing.positionCount += 1;
    } else {
      map.set(page, {
        clicks: row.clicks,
        impressions: row.impressions,
        positionSum: row.position,
        positionCount: 1,
      });
    }
  }
  return map;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export async function runContentDecayJob(opts: ContentDecayJobOpts): Promise<void> {
  const env = opts.env ?? process.env;
  const baseDir = opts.baseDir ?? "tenants";
  const now = opts.now ?? new Date();

  const tenant = await loadTenant(opts.tenantSlug, baseDir);
  const cfg = tenant.features.search_console;

  if (!cfg?.enabled) {
    console.log(JSON.stringify({ stage: "content-decay-skip", reason: "feature disabled" }));
    return;
  }

  // Period "now": last 30 days
  const nowEnd = dateYmd(offsetDays(now, -1));
  const nowStart = dateYmd(offsetDays(now, -30));

  // Period "prev": 30 days before "now" window
  const prevEnd = dateYmd(offsetDays(now, -31));
  const prevStart = dateYmd(offsetDays(now, -60));

  const gscOpts = { serviceAccountJson: requireEnv(env, "GSC_SERVICE_ACCOUNT_JSON") };

  let nowRows: Awaited<ReturnType<typeof querySearchConsole>>["rows"] = [];
  let prevRows: Awaited<ReturnType<typeof querySearchConsole>>["rows"] = [];

  try {
    const [nowResult, prevResult] = await Promise.all([
      querySearchConsole(gscOpts, {
        propertyUrl: cfg.property_url,
        startDate: nowStart,
        endDate: nowEnd,
        dimensions: ["page"],
        rowLimit: 25000,
      }),
      querySearchConsole(gscOpts, {
        propertyUrl: cfg.property_url,
        startDate: prevStart,
        endDate: prevEnd,
        dimensions: ["page"],
        rowLimit: 25000,
      }),
    ]);
    nowRows = nowResult.rows;
    prevRows = prevResult.rows;
  } catch (err) {
    console.log(JSON.stringify({ stage: "content-decay-gsc", warning: (err as Error).message }));
    return;
  }

  const nowMap = aggregateByPage(nowRows);
  const prevMap = aggregateByPage(prevRows);

  const decaying: ContentDecayItem[] = [];

  for (const [page, nowMetrics] of nowMap.entries()) {
    const prevMetrics = prevMap.get(page);
    if (!prevMetrics) continue; // new page, no comparison possible

    const positionNow = nowMetrics.positionCount > 0 ? nowMetrics.positionSum / nowMetrics.positionCount : 0;
    const positionPrev = prevMetrics.positionCount > 0 ? prevMetrics.positionSum / prevMetrics.positionCount : 0;

    const positionDelta = positionNow - positionPrev; // positive = worse (higher number = lower ranking)
    const clicksDelta = prevMetrics.clicks > 0
      ? (nowMetrics.clicks - prevMetrics.clicks) / prevMetrics.clicks
      : 0;

    const positionDecayed = positionDelta >= POSITION_DECAY_THRESHOLD;
    const clicksDecayed = clicksDelta <= -CLICKS_DECAY_RATIO;

    if (positionDecayed || clicksDecayed) {
      decaying.push({
        page,
        position_now: positionNow,
        position_prev: positionPrev,
        clicks_now: nowMetrics.clicks,
        clicks_prev: prevMetrics.clicks,
        impressions_now: nowMetrics.impressions,
      });
    }
  }

  // Sort by impressions desc, then take top N
  decaying.sort((a, b) => b.impressions_now - a.impressions_now);
  const topDecaying = decaying.slice(0, TOP_N);

  let emailSent = false;

  if (topDecaying.length > 0) {
    try {
      const resendKey = requireEnv(env, "RESEND_API_KEY");
      const html = await render(
        React.createElement(ContentDecayAlert, {
          tenant: opts.tenantSlug,
          date: dateYmd(now),
          decaying: topDecaying,
        })
      );
      await sendEmail({
        apiKey: resendKey,
        from: tenant.email.from,
        to: tenant.email.to,
        replyTo: tenant.email.reply_to,
        subject: `[${tenant.brand.name}] Content decay rapport ${dateYmd(now)}: ${topDecaying.length} pagina's`,
        html,
      });
      emailSent = true;
    } catch (err) {
      console.log(JSON.stringify({ stage: "content-decay-email", warning: (err as Error).message }));
    }
  }

  const log: DecayRunLog = {
    run_at: now.toISOString(),
    tenant: opts.tenantSlug,
    period_now: { start: nowStart, end: nowEnd },
    period_prev: { start: prevStart, end: prevEnd },
    total_pages_analyzed: nowMap.size,
    decaying_count: decaying.length,
    top_decaying: topDecaying,
    email_sent: emailSent,
  };

  await persistLog(baseDir, opts.tenantSlug, now, log);

  console.log(
    JSON.stringify({
      stage: "content-decay-complete",
      totalAnalyzed: nowMap.size,
      decayingCount: decaying.length,
      emailSent,
    })
  );
}

async function persistLog(
  baseDir: string,
  slug: string,
  now: Date,
  log: DecayRunLog
): Promise<void> {
  const dir = path.join(baseDir, "..", "data", "content-decay-runs", slug);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${dateYmd(now)}.json`);
  await writeFile(file, JSON.stringify(log, null, 2), "utf-8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tenantArg = process.argv.slice(2).find((a) => a.startsWith("--tenant="));
  if (!tenantArg) throw new Error("Usage: contentDecayJob.ts --tenant=<slug>");
  const slug = tenantArg.split("=")[1]!;
  runContentDecayJob({ tenantSlug: slug }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
