/**
 * Send scraped website content to Gemini 2.5 Pro and extract:
 *   - brand voice (1–2 paragraphs)
 *   - suggested content pillars (3, with weights)
 *   - company short description
 *   - suggested ban list additions
 *
 * Uses Gemini 2.5 Pro for quality/price balance: ~2× cheaper than Sonnet
 * with comparable brand-voice nuance, 1M context (no truncation needed for
 * large homepages), and strong multilingual handling.
 *
 * Requires GEMINI_API_KEY in env. During onboarding the user hasn't
 * configured their own keys yet, so the SaaS-host's key is used.
 */

import { createGeminiProvider } from "@/llm/gemini";
import { z } from "zod";
import type { ScrapedSite } from "./website";

const ExtractionSchema = z.object({
  company_name: z.string().min(1).max(120),
  brand_voice: z.string().min(40).max(800),
  short_description: z.string().min(20).max(400),
  pillars: z
    .array(
      z.object({
        name: z.string().min(2).max(60),
        weight: z.number().min(0).max(1),
      })
    )
    .min(1)
    .max(5),
  ban_list_suggestions: z.array(z.string().min(2).max(60)).max(15),
  author_bio: z.string().max(500).optional().nullable(),
  detected_language: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/).optional().nullable(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const SYSTEM_PROMPT = `Je bent een brand-strategist die met één blik door de website van een bedrijf heen prikt en de essentie eruit haalt.

Op basis van de aangeleverde website-tekst extraheer je:

1. **company_name** — de bedrijfsnaam (zoals op de site weergegeven, niet de domeinnaam).
2. **brand_voice** — beschrijf in 2-4 zinnen hoe het bedrijf schrijft. Wees concreet: welke persoon (jij/u/wij), welke toon (formeel/informeel/expert/empathisch), welke woordkeuze, welke energie. Refereer aan wat je daadwerkelijk leest, geen generieke claims.
3. **short_description** — 1-2 zinnen over wat het bedrijf doet en voor wie.
4. **pillars** — 3 content pillars (max 5) waar een blog op deze site over zou schrijven. Geef elke pillar een korte naam (2-4 woorden) en een weight tussen 0 en 1 die optellen tot ongeveer 1.0. Baseer pillars op wat het bedrijf al doet, niet op generieke marketing-topics.
5. **ban_list_suggestions** — clichés die deze brand juist NIET zou gebruiken op basis van hun voice (bv. als ze informeel zijn: "geachte heer/mevrouw"; als ze concreet zijn: vage marketing-frasen). Max 8.
6. **author_bio** — als je een persoon achter de site kunt identificeren, een korte bio (1-2 zinnen). Anders null.
7. **detected_language** — BCP-47 code zoals "nl-NL" of "en-US" gebaseerd op de tekst.

**Belangrijk**:
- Antwoord ALLEEN met geldig JSON, geen wrappers, geen uitleg ervoor of erna.
- Schrijf brand_voice en short_description in dezelfde taal als de bron-website.
- Gok niet — als je iets niet zeker weet, kies dan de meest neutrale optie. Maar wees beslissend.`;

export async function extractFromScrape(
  scraped: ScrapedSite,
  apiKey: string
): Promise<Extraction> {
  const provider = createGeminiProvider(apiKey);

  const userPrompt = [
    `URL: ${scraped.finalUrl}`,
    scraped.title ? `Page title: ${scraped.title}` : "",
    scraped.description ? `Meta description: ${scraped.description}` : "",
    "",
    "--- Homepage content ---",
    scraped.text,
    scraped.aboutText
      ? ["", "--- About page content ---", scraped.aboutText].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await provider.call({
    model: "gemini-2.5-pro",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2000,
    temperature: 0.4,
  });

  // Strip markdown code fences if the model added them despite instructions.
  let text = res.text.trim();
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenceMatch) text = fenceMatch[1]!.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Modellrespons was geen geldig JSON: ${(err as Error).message}`);
  }

  const result = ExtractionSchema.parse(parsed);

  // Normalize pillar weights to sum to 1.0
  const total = result.pillars.reduce((s, p) => s + p.weight, 0);
  if (total > 0) {
    result.pillars = result.pillars.map((p) => ({ ...p, weight: p.weight / total }));
  }

  return result;
}
