import { checkCitations } from "./citationCheck.ts";
import type { ResearchOutput } from "@/agents/researcher";

export interface FilterResult {
  filtered: ResearchOutput;
  total: number;
  alive: number;
  dropped: number;
  deadUrls: string[];
  unverifiedCount: number;
}

// Definitief-dood = de bron is echt weg. NL gov/finance-sites (RVO, AP, NBA, CBS) WAF'en
// vaak bot-requests met 403/429 ondanks browser-UA — die zijn waarschijnlijk NIET dood,
// alleen door anti-bot afgewezen. Timeouts idem (kunnen langzaam zijn maar wel alive).
// Alleen 404 en 410 zijn betrouwbare "weg"-signalen.
const DEFINITIVELY_DEAD_REASONS = /^status:(404|410)$/;

// Verwijdert ALLEEN definitief-dode URLs (404/410) uit external_authority_sources en key_facts
// vóór Strategist/Writer ze gebruiken. WAF-geblokte URLs (403/429/5xx/timeout) blijven —
// citationCheck post-write vangt ze alsnog op voor het rubric-signal.
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
  const definitivelyDead = result.dead.filter((d) => DEFINITIVELY_DEAD_REASONS.test(d.reason));
  const deadSet = new Set(definitivelyDead.map((d) => d.url));

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
    dropped: definitivelyDead.length,
    deadUrls: definitivelyDead.map((d) => d.url),
    unverifiedCount: result.dead.length - definitivelyDead.length,
  };
}
