import { describe, expect, it, vi } from "vitest";
import { runRepurposerLinkedIn, runRepurposerNewsletter, runRepurposerXThread } from "@/agents/repurposer";
import type { LLMProvider } from "@/llm/types";
import { resolveAgentModel } from "@/llm/client";

// full_text must be >=800 chars — pad with realistic content
const LINKEDIN_FULL_TEXT =
  "AI in HR is geen modegril meer — het is bedrijfskritisch.\n\n" +
  "Hier zijn 3 lessen die we leerden bij MKB-bedrijven die het écht goed doen.\n\n" +
  "1. Begin klein. Automatiseer eerst CV-screening. Dat is meetbaar en snel te bewijzen bij de directie.\n\n" +
  "2. Documenteer beslissingen. AVG vereist dat je kunt uitleggen waarom iemand is afgewezen. Zorg dat jouw AI-tool daarvoor een audit-trail biedt.\n\n" +
  "3. Train je team in prompt-skills. Niet in tool-knoppen — die veranderen toch. De vaardigheid om goed te instrueren is duurzamer.\n\n" +
  "Wat wij zien bij klanten: de bedrijven die het goed doen beginnen niet met de technologie, maar met de vraag: welk probleem lossen we op?\n\n" +
  "Dat klinkt simpel. Maar 80% van de MKB-bedrijven slaat deze stap over.\n\n" +
  "Wil je weten welke tools werken voor jouw team? In onze nieuwste blog staan concrete stappen, inclusief welke vragen je aan je leverancier moet stellen.\n\n" +
  "Link in comments.";

const linkedInResp = JSON.stringify({
  hook_first_200: "AI in HR is geen modegril meer — het is bedrijfskritisch. Hier zijn 3 lessen die we leerden bij MKB-bedrijven die het écht goed doen.",
  full_text: LINKEDIN_FULL_TEXT,
  cta: "Wat is jouw eerste stap met AI in HR? Deel het in de comments.",
});

// body_html must be >=500 chars
const NEWSLETTER_BODY_HTML =
  "<p>Hi,</p>" +
  "<p>De afgelopen maanden zagen we MKB-bedrijven worstelen met AI in HR — sommigen succesvol, anderen niet. Het verschil zat bijna nooit in de technologie.</p>" +
  "<p>Eén concreet voorbeeld: een bouwbedrijf van 80 medewerkers automatiseerde CV-screening en bespaarde 12 uur per week. Maar pas nadat ze AVG-proof werkten en hun team hadden getraind op prompt-skills in plaats van tool-knoppen.</p>" +
  "<p>In ons nieuwe artikel zetten we drie patronen uiteen die structureel werken, plus één aanpak die er verleidelijk uitziet maar keer op keer mislukt.</p>" +
  "<p><a href='https://artifation.nl/ai-in-hr-mkb/'>Lees het volledige artikel →</a></p>" +
  "<p>Groet,<br>Julian</p>";

const newsletterResp = JSON.stringify({
  subject_line: "AI in HR voor MKB: drie lessen",
  preheader: "Praktische stappen die we leerden bij Nederlandse MKB-bedrijven",
  body_html: NEWSLETTER_BODY_HTML,
  cta_url: "https://artifation.nl/ai-in-hr-mkb/",
});

const xthreadResp = JSON.stringify({
  tweets: [
    "AI in HR voor MKB. Het is geen sci-fi meer. Drie patronen die werken (en één dat absoluut niet werkt).",
    "1. Begin met CV-screening. Daar is de tijdwinst direct meetbaar.",
    "2. Documenteer welke beslissingen AI maakt. AVG vereist het, en je leert ervan.",
    "3. Train je team in prompt-skills, niet in tool-knoppen.",
    "Wat NIET werkt: AI als black-box neerzetten en hopen dat HR het oppakt.",
    "Lees het volledige stappenplan: https://artifation.nl/ai-in-hr-mkb/",
  ],
  blog_link_tweet_index: 5,
});

const makeProvider = (text: string): LLMProvider => ({
  name: "anthropic",
  call: vi.fn(async () => ({ text, inputTokens: 1, outputTokens: 1, model: "claude-sonnet-4-6", provider: "anthropic" as const })),
});

const INPUT = {
  blog: { title: "AI in HR voor MKB", tldr: "AI helpt MKB-HR.", url: "https://artifation.nl/ai-in-hr-mkb/", target_keyword: "AI in HR", pillar: "ai-per-afdeling" },
  brand_voice: "informeel-direct",
};

describe("runRepurposerLinkedIn", () => {
  it("returns valid LinkedIn post structure", async () => {
    const r = await runRepurposerLinkedIn(INPUT, { provider: makeProvider(linkedInResp), model: resolveAgentModel("repurposer"), sleepImpl: () => Promise.resolve() });
    expect(r.parsed.hook_first_200.length).toBeLessThanOrEqual(400);
    expect(r.parsed.full_text.length).toBeGreaterThanOrEqual(800);
    expect(r.parsed.cta.length).toBeGreaterThan(10);
  });
});

describe("runRepurposerNewsletter", () => {
  it("returns valid newsletter structure", async () => {
    const r = await runRepurposerNewsletter(INPUT, { provider: makeProvider(newsletterResp), model: resolveAgentModel("repurposer"), sleepImpl: () => Promise.resolve() });
    expect(r.parsed.subject_line.length).toBeLessThanOrEqual(100);
    expect(r.parsed.body_html).toContain("<p>");
    expect(r.parsed.cta_url).toBe("https://artifation.nl/ai-in-hr-mkb/");
  });
});

describe("runRepurposerXThread", () => {
  it("returns 5-9 tweets with link-tweet index", async () => {
    const r = await runRepurposerXThread(INPUT, { provider: makeProvider(xthreadResp), model: resolveAgentModel("repurposer"), sleepImpl: () => Promise.resolve() });
    expect(r.parsed.tweets.length).toBeGreaterThanOrEqual(5);
    expect(r.parsed.tweets.length).toBeLessThanOrEqual(9);
    expect(r.parsed.blog_link_tweet_index).toBeLessThan(r.parsed.tweets.length);
    r.parsed.tweets.forEach((t) => expect(t.length).toBeLessThanOrEqual(280));
  });
});
