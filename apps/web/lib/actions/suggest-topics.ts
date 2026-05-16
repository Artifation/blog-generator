"use server";

import { requireSite } from "~/lib/auth";
import { createProviderRegistry } from "@/llm/client";
import { runTopicSuggester } from "@/agents/topicSuggester";
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
}

export async function suggestTopicsAction(
  count = 5
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
        candidates: [
          {
            source: "manual",
            rationale: `Genereer ${count} nieuwe topic-voorstellen voor deze site, geïnspireerd op de brand voice en pillars. Variëren op intent en specificiteit. Voor ${site.name} — voice: ${site.brandVoice.slice(0, 400)}`,
          },
        ],
        pillars: site.pillars.map((p) => ({ id: p.slug, weight: p.weight })),
        max_n: count,
      },
      { provider: providers.get("gemini") }
    );

    const proposals: TopicProposalView[] = res.parsed.proposals.map((p) => ({
      id: p.id,
      title: p.title,
      pillarSlug: p.pillar,
      targetKeyword: p.target_keyword,
      intendedWordCount: p.intended_word_count,
      intent: p.intent,
      priority: p.priority,
      rationale: p.proposal_rationale,
    }));

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
