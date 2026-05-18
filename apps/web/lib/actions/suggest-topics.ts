"use server";

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { requireSite } from "~/lib/auth";
import { createProviderRegistry } from "@/llm/client";
import { runTopicSuggester } from "@/agents/topicSuggester";
import { querySearchConsole, type GscRow, type GscClientOpts } from "@/integrations/searchConsole";
import {
  findStrikingDistance,
  findRisingQueries,
  findUnmappedQueries,
} from "@/integrations/keywordOpportunities";
import { listTopicsForSite, createTopic } from "~/lib/topics";
import { revalidatePath } from "next/cache";

export interface TopicProposalView {
  id: string;
  title: string;
  pillarSlug: string;
  targetKeyword: string;
  intendedWordCount: number;
  intent: "informational" | "commercial" | "transactional";
  priority: number;
  rationale: string;
  source:
    | "competitor_sitemap"
    | "gsc_rising_query"
    | "gsc_striking_distance"
    | "gsc_unmapped_query"
    | "manual";
}

interface SearchConsoleFeature {
  enabled?: boolean;
  property_url?: string;
}

function readSearchConsoleFeature(features: Record<string, unknown>): SearchConsoleFeature | null {
  const sc = features.search_console;
  if (!sc || typeof sc !== "object") return null;
  return sc as SearchConsoleFeature;
}

function gscSnapshotPath(siteSlug: string): string {
  // Webapp cwd = apps/web; snapshots live at repo-root/data/gsc-snapshots
  return path.resolve(process.cwd(), "../../data/gsc-snapshots", `${siteSlug}.json`);
}

async function loadGscSnapshot(filePath: string): Promise<GscRow[]> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as GscRow[];
  } catch {
    return [];
  }
}

async function saveGscSnapshot(filePath: string, rows: GscRow[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(rows, null, 2), "utf-8");
}

function dateYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DiscoveredCandidate {
  source:
    | "competitor_sitemap"
    | "gsc_rising_query"
    | "gsc_striking_distance"
    | "gsc_unmapped_query"
    | "manual";
  query?: string;
  title?: string;
  rationale?: string;
}

/**
 * Try to discover GSC-based opportunities for this site. Silent fallback when:
 *   - search_console feature is disabled or missing property_url
 *   - GSC_SERVICE_ACCOUNT_JSON env is missing
 *   - the GSC call fails
 * Returns an empty list in any of those cases so the caller can fall back to
 * a manual seed.
 */
async function discoverGscOpportunities(
  siteSlug: string,
  features: Record<string, unknown>,
  existingTopics: { title: string; targetKeyword: string }[],
  env: NodeJS.ProcessEnv,
  siteGscJson?: string
): Promise<DiscoveredCandidate[]> {
  const sc = readSearchConsoleFeature(features);
  if (!sc?.enabled || !sc.property_url) return [];
  // Prefer per-site credential (stored in apiKeys.gscServiceAccountJson) so
  // each site can have its own GSC service account. Fall back to the global
  // env var for backwards compat with single-user local setups.
  const serviceAccountJson = siteGscJson?.trim() || env.GSC_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return [];

  try {
    const gscOpts: GscClientOpts = { serviceAccountJson };
    const now = new Date();
    const endDate = dateYmd(new Date(now.getTime() - 86_400_000));
    const startDate = dateYmd(new Date(now.getTime() - 30 * 86_400_000));

    const result = await querySearchConsole(gscOpts, {
      propertyUrl: sc.property_url,
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 1000,
    });

    const snapPath = gscSnapshotPath(siteSlug);
    const previous = await loadGscSnapshot(snapPath);

    const minImpressions = 50;
    const out: DiscoveredCandidate[] = [];

    for (const o of findStrikingDistance(result.rows, { minImpressions })) {
      out.push({
        source: "gsc_striking_distance",
        query: o.query,
        rationale: `Positie ${o.position.toFixed(1)} bij ${o.impressions} impressies — kans om page 1 te halen.`,
      });
    }

    for (const o of findUnmappedQueries(
      result.rows,
      existingTopics.map((t) => ({ target_keyword: t.targetKeyword, title: t.title })),
      { minImpressions }
    )) {
      out.push({
        source: "gsc_unmapped_query",
        query: o.query,
        rationale: `${o.impressions} impressies (positie ${o.position.toFixed(1)}) en geen bestaand topic dekt dit — content-gap.`,
      });
    }

    if (previous.length > 0) {
      for (const o of findRisingQueries(result.rows, previous, {
        minGrowth: 50,
        minGrowthPct: 50,
      })) {
        out.push({
          source: "gsc_rising_query",
          query: o.query,
          rationale: `Impressies +${o.growth} (${Number.isFinite(o.growthPct) ? o.growthPct.toFixed(0) + "%" : "nieuw"}) — stijgende interesse.`,
        });
      }
    }

    // Persist current snapshot so the next run can compute rising queries.
    await saveGscSnapshot(snapPath, result.rows).catch(() => {
      // snapshot persistence is best-effort; don't fail the action
    });

    return out;
  } catch {
    return [];
  }
}

export async function suggestTopicsAction(
  count = 5,
  customPrompt?: string
): Promise<{ ok: true; proposals: TopicProposalView[] } | { ok: false; error: string }> {
  const site = await requireSite();
  const key = site.apiKeys?.gemini ?? site.apiKeys?.anthropic;
  if (!key) {
    return { ok: false, error: "API-key ontbreekt — vul Gemini of Anthropic in onder Instellingen." };
  }
  if (site.pillars.length === 0) {
    return { ok: false, error: "Voeg eerst pillars toe in Instellingen." };
  }

  const env = { ...process.env };
  if (site.apiKeys?.gemini) env.GEMINI_API_KEY = site.apiKeys.gemini;
  if (site.apiKeys?.anthropic) env.ANTHROPIC_API_KEY = site.apiKeys.anthropic;
  if (site.apiKeys?.groq) env.GROQ_API_KEY = site.apiKeys.groq;
  const providers = createProviderRegistry(env);

  const existing = await listTopicsForSite(site.id);

  // Try GSC opportunity discovery; falls back silently to an empty list when
  // GSC isn't configured for this site (or no credential is present).
  const gscCandidates = await discoverGscOpportunities(
    site.slug,
    site.features ?? {},
    existing.map((t) => ({ title: t.title, targetKeyword: t.targetKeyword })),
    env,
    site.apiKeys?.gscServiceAccountJson
  );

  const candidates: DiscoveredCandidate[] = [...gscCandidates];

  // Always include a manual seed so the LLM has freedom to propose creative
  // topics even when GSC found something. Without this the suggester is
  // anchored entirely to existing search behavior, which misses net-new angles.
  // When the user provided a customPrompt, surface it prominently — it
  // overrides the default "any topic" framing.
  const userPrompt = customPrompt?.trim();
  candidates.push({
    source: "manual",
    rationale: userPrompt
      ? `GEBRUIKER-INSTRUCTIE (volg dit strikt): ${userPrompt}\n\nGenereer ${count} nieuwe topic-voorstellen voor ${site.name} op basis van deze instructie. Houd brand voice (${site.brandVoice.slice(0, 200)}) en pillars in acht.`
      : `Genereer ${count} nieuwe topic-voorstellen voor deze site, geïnspireerd op de brand voice en pillars. Variëer op intent en specificiteit. Voor ${site.name} — voice: ${site.brandVoice.slice(0, 400)}`,
  });

  // Lookup: proposal_source assigned by suggester → rationale text from our
  // discovery (so the UI can show "kans om page 1 te halen" instead of the
  // generic LLM-written rationale).
  const rationaleByQuery = new Map<string, string>();
  for (const c of gscCandidates) {
    if (c.query && c.rationale) rationaleByQuery.set(c.query.toLowerCase(), c.rationale);
  }

  try {
    const res = await runTopicSuggester(
      {
        existing_topics: existing.slice(0, 30).map((t) => ({
          id: t.id,
          title: t.title,
          target_keyword: t.targetKeyword,
          pillar: t.pillarSlug,
          status: t.status,
        })),
        candidates,
        pillars: site.pillars.map((p) => ({ id: p.slug, weight: p.weight })),
        max_n: count,
      },
      { provider: providers.get("gemini") }
    );

    const proposals: TopicProposalView[] = res.parsed.proposals.map((p) => {
      const discoveredRationale = rationaleByQuery.get(p.target_keyword.toLowerCase());
      return {
        id: p.id,
        title: p.title,
        pillarSlug: p.pillar,
        targetKeyword: p.target_keyword,
        intendedWordCount: p.intended_word_count,
        intent: p.intent,
        priority: p.priority,
        rationale: discoveredRationale
          ? `${discoveredRationale} — ${p.proposal_rationale}`
          : p.proposal_rationale,
        source: p.proposal_source,
      };
    });

    return { ok: true, proposals };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function acceptTopicProposalsAction(
  siteSlug: string,
  proposals: TopicProposalView[]
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const site = await requireSite();
  if (site.slug !== siteSlug) return { ok: false, error: "Site mismatch" };
  let created = 0;
  const validPillars = new Set(site.pillars.map((p) => p.slug));
  for (const p of proposals) {
    try {
      await createTopic({
        siteId: site.id,
        title: p.title,
        targetKeyword: p.targetKeyword,
        // If the model returned a pillar that doesn't exist, fall back to the first one
        pillarSlug: validPillars.has(p.pillarSlug) ? p.pillarSlug : site.pillars[0]!.slug,
        intent: p.intent,
        intendedWordCount: p.intendedWordCount,
        priority: p.priority,
        proposalSource: p.source,
        proposalRationale: p.rationale,
      });
      created++;
    } catch {
      // skip duplicates / errors silently
    }
  }
  revalidatePath("/topics");
  revalidatePath("/dashboard");
  return { ok: true, created };
}
