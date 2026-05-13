import { checkCitations } from "./citationCheck.ts";
import type { ResearchOutput } from "@/agents/researcher";

export interface FilterResult {
  filtered: ResearchOutput;
  total: number;
  alive: number;
  dropped: number;
  deadUrls: string[];
}

// Verwijdert dode URLs uit external_authority_sources en key_facts vóór Strategist/Writer
// ze gebruiken. Voorkomt dat dead_external_link_count later het rubric tankt.
export async function filterDeadResearchUrls(
  research: ResearchOutput,
  fetchImpl?: typeof fetch,
  timeoutMs: number = 8000
): Promise<FilterResult> {
  const urls = [
    ...research.external_authority_sources.map((s) => s.url),
    ...research.key_facts.map((f) => f.source_url),
  ];
  const result = await checkCitations({ urls, fetchImpl, timeoutMs });
  const deadSet = new Set(result.dead.map((d) => d.url));

  const filtered: ResearchOutput = {
    ...research,
    external_authority_sources: research.external_authority_sources.filter(
      (s) => !deadSet.has(s.url)
    ),
    key_facts: research.key_facts.filter((f) => !deadSet.has(f.source_url)),
  };

  return {
    filtered,
    total: result.total,
    alive: result.alive,
    dropped: result.dead.length,
    deadUrls: result.dead.map((d) => d.url),
  };
}
