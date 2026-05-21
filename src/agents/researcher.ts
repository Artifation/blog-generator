import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { LLMProvider } from "@/llm/types";
import { resolveAgentModel } from "@/llm/client";
import { RESEARCHER_SYSTEM_PROMPT } from "./prompts/researcher.ts";

// Limits zijn ruim gezet (was 400/500): LLM's tellen karakters slecht en
// faalden chronisch op originality_anchor.outcome > 400 ondanks expliciete
// instructie in de prompt. Een betekenisvolle narratieve outcome heeft
// makkelijk 600-700 chars. Te scherpe ondergrens zorgde voor harde Zod-failures
// + 3x retries + alsnog error; ruimer accepteren is goedkoper én geeft betere
// content. Boven 1000 wordt het wel een wall-of-text — daar trekken we de lijn.
export const OriginalityAnchorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("real_case"),
    source_url: z.string().url(),
    summary: z.string().min(60).max(900),
    what_makes_it_relevant: z.string().min(30).max(800),
  }),
  z.object({
    type: z.literal("hypothetical_scenario"),
    industry: z.string().min(3),
    region: z.string().min(2),
    situation: z.string().min(60).max(900),
    outcome: z.string().min(30).max(800),
  }),
]);
export type OriginalityAnchor = z.infer<typeof OriginalityAnchorSchema>;

export const ResearchOutputSchema = z.object({
  fan_out_subqueries: z.array(z.string()).min(3),
  key_entities: z.array(z.string()).min(3),
  internal_link_targets: z
    .array(z.object({ url: z.string().url(), anchor_suggestion: z.string(), why: z.string() }))
    .min(0),
  external_authority_sources: z
    .array(z.object({ url: z.string().url(), title: z.string(), why_authoritative: z.string() }))
    .min(0),
  key_facts: z.array(z.object({ claim: z.string(), source_url: z.string().url() })).min(0),
  competitor_serp_summary: z.string(),
  originality_anchor: OriginalityAnchorSchema.optional(),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

export interface ResearcherInput {
  target_keyword: string;
  topic_title: string;
  pillar: string;
  existing_site_urls: string[];
}

export interface ResearcherDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runResearcher(input: ResearcherInput, deps: ResearcherDeps) {
  const model = resolveAgentModel("researcher");
  const result = await runAgent(
    {
      provider: deps.provider,
      systemPrompt: RESEARCHER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: ResearchOutputSchema,
      useSearch: true,  // Gemini grounding → URIs uit live SERP, niet uit parametric memory
    },
    deps.sleepImpl
  );

  // Filter externe URLs tegen Gemini's grounding-metadata. Wat niet in de
  // grounded set zit is ofwel hallucinatie ofwel parametric-memory — beide
  // onbetrouwbaar. Interne site-URLs hoeven niet gegrond te zijn (komen uit
  // sitemap, niet uit Gemini's search).
  const grounded = result.raw.groundedUrls;
  if (grounded && grounded.length > 0) {
    const groundedSet = new Set(grounded);
    const isGrounded = (url: string): boolean =>
      groundedSet.has(url) || [...groundedSet].some((g) => sameHostAndPath(g, url));
    result.parsed.external_authority_sources = result.parsed.external_authority_sources.filter(
      (s) => isGrounded(s.url)
    );
    result.parsed.key_facts = result.parsed.key_facts.filter((f) => isGrounded(f.source_url));
  }

  return result;
}

// Twee URIs gelden als equivalent als host + path-prefix overeenkomen. Vangt
// trailing-slash / query-string / fragment verschillen op tussen wat de LLM
// citeert en wat in groundingChunks staat (Google voegt soms ?utm_source toe).
function sameHostAndPath(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    if (ua.host !== ub.host) return false;
    const pa = ua.pathname.replace(/\/$/, "");
    const pb = ub.pathname.replace(/\/$/, "");
    return pa === pb || pa.startsWith(pb) || pb.startsWith(pa);
  } catch {
    return false;
  }
}
