"use server";

import { scrapeWebsite } from "~/lib/scrape/website";
import { extractFromScrape, type Extraction } from "~/lib/scrape/extract";

export interface ScrapeResult {
  ok: true;
  finalUrl: string;
  extraction: Extraction;
}

export type ScrapeResponse = ScrapeResult | { ok: false; error: string };

export async function scrapeWebsiteAction(domainOrUrl: string): Promise<ScrapeResponse> {
  // Intentionally session-less: this runs during onboarding before an account
  // exists. The open-proxy / SSRF risk is contained inside scrapeWebsite, which
  // routes every fetch through the SSRF guard (lib/security/ssrf.ts) — non-
  // public targets and internal redirects are rejected.
  if (!domainOrUrl.trim()) {
    return { ok: false, error: "Voer eerst een domein in." };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Auto-invullen is uitgeschakeld omdat de server geen GEMINI_API_KEY heeft. Vraag je beheerder om die in te stellen.",
    };
  }

  const scraped = await scrapeWebsite(domainOrUrl);
  if (scraped.hasErrors || !scraped.text || scraped.text.length < 100) {
    return {
      ok: false,
      error:
        "Kon de site niet bereiken of er stond te weinig leesbare tekst op. Vul de velden zelf in.",
    };
  }

  try {
    const extraction = await extractFromScrape(scraped, apiKey);
    return { ok: true, finalUrl: scraped.finalUrl, extraction };
  } catch (err) {
    return {
      ok: false,
      error: `Extractie mislukte: ${(err as Error).message}`,
    };
  }
}
