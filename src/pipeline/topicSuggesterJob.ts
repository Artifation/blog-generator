/**
 * Weekly topic-suggester job.
 *
 * Workflow:
 * 1. Load tenant config; skip if feature disabled.
 * 2. Expire old "proposed" topics (≥ expire_after_weeks old → "proposed_expired").
 * 3. Fetch competitor sitemaps + diff vs snapshot → candidate list A.
 * 4. Query GSC for rising queries (impressions >50, position >10) → candidate list B.
 * 5. Run topicSuggester agent to score + dedup candidates.
 * 6. Append proposals as "proposed" entries to topics.yaml.
 * 7. Email editorial team via TopicProposals template.
 * 8. Save topics.yaml + competitor snapshot (data/competitor-snapshots/<tenant>.json).
 */
import * as React from "react";
import { render } from "@react-email/render";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTenant } from "@/config/loader";
import { loadTopics, saveTopics } from "@/config/topics";
import type { Topic } from "@/config/topics";
import { fetchCompetitorSitemaps, diffNewEntries } from "@/integrations/competitorSitemaps";
import type { SitemapEntry } from "@/integrations/competitorSitemaps";
import { querySearchConsole } from "@/integrations/searchConsole";
import type { GscClientOpts, GscRow } from "@/integrations/searchConsole";
import {
  findStrikingDistance,
  findRisingQueries,
  findUnmappedQueries,
} from "@/integrations/keywordOpportunities";
import { runTopicSuggester } from "@/agents/topicSuggester";
import type { TopicProposal } from "@/agents/topicSuggester";
import { createProviderRegistry } from "@/llm/client";
import { sendEmail } from "@/email/resend";
import { TopicProposals } from "@/email/templates/TopicProposals";

export interface TopicSuggesterJobOpts {
  tenantSlug: string;
  baseDir?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

function dateYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function offsetDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function snapshotPath(baseDir: string, tenantSlug: string): string {
  return path.join(baseDir, "..", "data", "competitor-snapshots", `${tenantSlug}.json`);
}

function gscSnapshotPath(baseDir: string, tenantSlug: string): string {
  return path.join(baseDir, "..", "data", "gsc-snapshots", `${tenantSlug}.json`);
}

async function loadSnapshot(filePath: string): Promise<SitemapEntry[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as SitemapEntry[];
  } catch {
    return [];
  }
}

async function saveSnapshot(filePath: string, entries: SitemapEntry[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(entries, null, 2), "utf-8");
}

async function loadGscSnapshot(filePath: string): Promise<GscRow[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as GscRow[];
  } catch {
    return [];
  }
}

async function saveGscSnapshot(filePath: string, rows: GscRow[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(rows, null, 2), "utf-8");
}

export async function runTopicSuggesterJob(opts: TopicSuggesterJobOpts): Promise<void> {
  const env = opts.env ?? process.env;
  const baseDir = opts.baseDir ?? "tenants";
  const now = opts.now ?? new Date();

  // 1. Load tenant + check feature
  const tenant = await loadTenant(opts.tenantSlug, baseDir);
  const cfg = tenant.features.topic_suggester;

  if (!cfg.enabled) {
    console.log(JSON.stringify({ stage: "topic-suggester-skip", reason: "feature disabled" }));
    return;
  }

  // 2. Load topics + expire old proposals
  const topics = await loadTopics(opts.tenantSlug, baseDir);
  const expireMs = cfg.expire_after_weeks * 7 * 86_400_000;
  let expiredCount = 0;

  for (const topic of topics) {
    if (topic.status === "proposed" && topic.proposed_at) {
      const age = now.getTime() - new Date(topic.proposed_at).getTime();
      if (age >= expireMs) {
        topic.status = "proposed_expired";
        expiredCount++;
      }
    }
  }

  if (expiredCount > 0) {
    console.log(JSON.stringify({ stage: "topic-suggester-expire", expiredCount }));
  }

  // Build candidate list from existing (non-proposed/expired) topics for dedup
  const existingTopics = topics
    .filter((t) => !["proposed", "proposed_expired", "rejected"].includes(t.status))
    .map((t) => ({
      id: t.id,
      title: t.title,
      target_keyword: t.target_keyword,
      pillar: t.pillar,
      status: t.status,
    }));

  // 3. Fetch competitor sitemaps + diff
  const candidates: { source: string; title?: string; query?: string; rationale?: string }[] = [];
  let currentSnapshot: SitemapEntry[] = [];

  if (cfg.competitor_domains.length > 0) {
    try {
      const snapFile = snapshotPath(baseDir, opts.tenantSlug);
      const previousSnapshot = await loadSnapshot(snapFile);

      currentSnapshot = await fetchCompetitorSitemaps({
        domains: cfg.competitor_domains,
      });

      const newEntries = diffNewEntries({ current: currentSnapshot, previousSnapshot });

      for (const entry of newEntries) {
        candidates.push({
          source: "competitor_sitemap",
          title: entry.slug.replace(/-/g, " "),
          rationale: `Nieuw gepubliceerd door ${entry.competitor_domain}: ${entry.url}`,
        });
      }

      console.log(
        JSON.stringify({
          stage: "topic-suggester-sitemaps",
          domainsChecked: cfg.competitor_domains.length,
          newEntries: newEntries.length,
        })
      );
    } catch (err) {
      console.log(
        JSON.stringify({
          stage: "topic-suggester-sitemaps",
          warning: (err as Error).message,
        })
      );
    }
  }

  // 4. GSC opportunity discovery — striking-distance + unmapped + rising
  // (rising requires a previous-window snapshot; first run only emits striking
  // + unmapped, second run onwards also emits rising).
  const searchConsoleCfg = tenant.features.search_console;
  let currentGscRows: GscRow[] | null = null;

  if (searchConsoleCfg?.enabled && searchConsoleCfg.property_url) {
    try {
      const gscOpts: GscClientOpts = {
        serviceAccountJson: requireEnv(env, "GSC_SERVICE_ACCOUNT_JSON"),
      };

      const endDate = dateYmd(offsetDays(now, -1));
      const startDate = dateYmd(offsetDays(now, -30));

      const result = await querySearchConsole(gscOpts, {
        propertyUrl: searchConsoleCfg.property_url,
        startDate,
        endDate,
        dimensions: ["query"],
        rowLimit: 1000,
      });
      currentGscRows = result.rows;

      const previousGscRows = await loadGscSnapshot(gscSnapshotPath(baseDir, opts.tenantSlug));

      const minImpressions = 50;

      const striking = findStrikingDistance(result.rows, { minImpressions });
      for (const o of striking) {
        candidates.push({
          source: "gsc_striking_distance",
          query: o.query,
          rationale: `Positie ${o.position.toFixed(1)} bij ${o.impressions} impressies — kans om page 1 te halen.`,
        });
      }

      const unmapped = findUnmappedQueries(
        result.rows,
        existingTopics.map((t) => ({ target_keyword: t.target_keyword, title: t.title })),
        { minImpressions }
      );
      for (const o of unmapped) {
        candidates.push({
          source: "gsc_unmapped_query",
          query: o.query,
          rationale: `${o.impressions} impressies (positie ${o.position.toFixed(1)}) en geen bestaand topic dekt dit — content-gap.`,
        });
      }

      let risingCount = 0;
      if (previousGscRows.length > 0) {
        const rising = findRisingQueries(result.rows, previousGscRows, {
          minGrowth: 50,
          minGrowthPct: 50,
        });
        for (const o of rising) {
          candidates.push({
            source: "gsc_rising_query",
            query: o.query,
            rationale: `Impressies +${o.growth} (${Number.isFinite(o.growthPct) ? o.growthPct.toFixed(0) + "%" : "nieuw"}) — stijgende interesse.`,
          });
        }
        risingCount = rising.length;
      }

      console.log(
        JSON.stringify({
          stage: "topic-suggester-gsc",
          striking: striking.length,
          unmapped: unmapped.length,
          rising: risingCount,
        })
      );
    } catch (err) {
      console.log(
        JSON.stringify({
          stage: "topic-suggester-gsc",
          warning: (err as Error).message,
        })
      );
    }
  }

  // Persist competitor + GSC snapshots at every exit point so the next run has
  // a baseline for diff/rising detection. Topics are written by the caller.
  const persistSnapshots = async (): Promise<void> => {
    if (currentSnapshot.length > 0) {
      await saveSnapshot(snapshotPath(baseDir, opts.tenantSlug), currentSnapshot);
    }
    if (currentGscRows !== null && currentGscRows.length > 0) {
      await saveGscSnapshot(gscSnapshotPath(baseDir, opts.tenantSlug), currentGscRows);
    }
  };

  if (candidates.length === 0) {
    console.log(JSON.stringify({ stage: "topic-suggester-complete", reason: "no candidates" }));
    await saveTopics(topics, opts.tenantSlug, baseDir);
    await persistSnapshots();
    return;
  }

  // 5. Run topic-suggester agent
  const registry = createProviderRegistry(env);
  const model = (await import("@/llm/client")).resolveAgentModel("topicSuggester");
  const provider = registry.get(model.provider);

  let proposals: TopicProposal[] = [];

  try {
    const result = await runTopicSuggester(
      {
        existing_topics: existingTopics,
        candidates,
        pillars: tenant.pillars,
        max_n: cfg.max_proposals_per_week,
      },
      { provider }
    );
    proposals = result.parsed.proposals;
  } catch (err) {
    console.log(
      JSON.stringify({
        stage: "topic-suggester-agent",
        warning: (err as Error).message,
      })
    );
    await saveTopics(topics, opts.tenantSlug, baseDir);
    await persistSnapshots();
    return;
  }

  if (proposals.length === 0) {
    console.log(JSON.stringify({ stage: "topic-suggester-complete", proposals: 0 }));
    await saveTopics(topics, opts.tenantSlug, baseDir);
    await persistSnapshots();
    return;
  }

  // 6. Append proposals as "proposed" entries to topics.yaml
  const nowIso = now.toISOString();
  const newTopics: Topic[] = proposals.map((p) => ({
    id: p.id,
    title: p.title,
    pillar: p.pillar,
    target_keyword: p.target_keyword,
    intended_word_count: p.intended_word_count,
    status: "proposed" as const,
    priority: p.priority,
    intent: p.intent,
    proposed_at: nowIso,
    proposal_source: p.proposal_source,
    proposal_rationale: p.proposal_rationale,
  }));

  const updatedTopics = [...topics, ...newTopics];

  // 7. Email editorial team
  try {
    const resendKey = requireEnv(env, "RESEND_API_KEY");
    const html = await render(
      React.createElement(TopicProposals, {
        tenant: opts.tenantSlug,
        date: dateYmd(now),
        proposals,
      })
    );
    await sendEmail({
      apiKey: resendKey,
      from: tenant.email.from,
      to: tenant.email.to,
      replyTo: tenant.email.reply_to,
      subject: `[${tenant.brand.name}] ${proposals.length} nieuwe topic-voorstellen — ${dateYmd(now)}`,
      html,
    });
    console.log(JSON.stringify({ stage: "topic-suggester-email", sent: true, count: proposals.length }));
  } catch (err) {
    console.log(
      JSON.stringify({
        stage: "topic-suggester-email",
        warning: (err as Error).message,
      })
    );
  }

  // 8. Save topics.yaml + competitor snapshot + GSC snapshot
  await saveTopics(updatedTopics, opts.tenantSlug, baseDir);
  await persistSnapshots();

  console.log(
    JSON.stringify({
      stage: "topic-suggester-complete",
      proposals: proposals.length,
      expired: expiredCount,
    })
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tenantArg = process.argv.slice(2).find((a) => a.startsWith("--tenant="));
  if (!tenantArg) throw new Error("Usage: topicSuggesterJob.ts --tenant=<slug>");
  const slug = tenantArg.split("=")[1]!;
  runTopicSuggesterJob({ tenantSlug: slug }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
