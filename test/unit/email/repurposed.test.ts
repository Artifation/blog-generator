import * as React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { Repurposed } from "@/email/templates/Repurposed";
import type { RepurposedProps } from "@/email/templates/Repurposed";

const LINKEDIN_FULL_TEXT =
  "AI in HR is geen modegril meer — het is bedrijfskritisch.\n\n" +
  "Hier zijn 3 lessen die we leerden bij MKB-bedrijven die het écht goed doen.\n\n" +
  "1. Begin klein. Automatiseer eerst CV-screening. Dat is meetbaar en snel te bewijzen bij de directie.\n\n" +
  "2. Documenteer beslissingen. AVG vereist dat je kunt uitleggen waarom iemand is afgewezen.\n\n" +
  "3. Train je team in prompt-skills. Niet in tool-knoppen — die veranderen toch.\n\n" +
  "Wil je weten welke tools werken voor jouw team? In onze nieuwste blog staan concrete stappen.\n\nLink in comments.";

const NEWSLETTER_BODY_HTML =
  "<p>Hi,</p>" +
  "<p>De afgelopen maanden zagen we MKB-bedrijven worstelen met AI in HR — sommigen succesvol, anderen niet.</p>" +
  "<p>Eén concreet voorbeeld: een bouwbedrijf van 80 medewerkers automatiseerde CV-screening en bespaarde 12 uur per week.</p>" +
  "<p><a href='https://artifation.nl/ai-in-hr-mkb/'>Lees het volledige artikel →</a></p>" +
  "<p>Groet,<br>Julian</p>";

const PROPS: RepurposedProps = {
  blogTitle: "AI in HR voor MKB",
  blogUrl: "https://artifation.nl/ai-in-hr-mkb/",
  linkedin: {
    hook_first_200: "AI in HR is geen modegril meer — het is bedrijfskritisch.",
    full_text: LINKEDIN_FULL_TEXT,
    cta: "Wat is jouw eerste stap met AI in HR? Deel het in de comments.",
  },
  newsletter: {
    subject_line: "AI in HR voor MKB: drie lessen",
    preheader: "Praktische stappen die we leerden bij Nederlandse MKB-bedrijven",
    body_html: NEWSLETTER_BODY_HTML,
    cta_url: "https://artifation.nl/ai-in-hr-mkb/",
  },
  xthread: {
    tweets: [
      "AI in HR voor MKB. Het is geen sci-fi meer. Drie patronen die werken.",
      "Begin met CV-screening. Daar is de tijdwinst direct meetbaar.",
      "Documenteer welke beslissingen AI maakt. AVG vereist het.",
      "Train je team in prompt-skills, niet in tool-knoppen.",
      "Lees het volledige stappenplan: https://artifation.nl/ai-in-hr-mkb/",
    ],
    blog_link_tweet_index: 4,
  },
};

describe("Repurposed email template", () => {
  it("renders without error and contains blog title", async () => {
    const html = await render(React.createElement(Repurposed, PROPS));
    expect(html).toContain("AI in HR voor MKB");
  });

  it("contains LinkedIn section with full_text", async () => {
    const html = await render(React.createElement(Repurposed, PROPS));
    expect(html).toContain("LinkedIn-post");
    expect(html).toContain("geen modegril meer");
  });

  it("contains newsletter section with subject line", async () => {
    const html = await render(React.createElement(Repurposed, PROPS));
    expect(html).toContain("Newsletter");
    expect(html).toContain("AI in HR voor MKB: drie lessen");
  });

  it("contains X-thread section with tweets", async () => {
    const html = await render(React.createElement(Repurposed, PROPS));
    expect(html).toContain("X-thread");
    // React-email inserts comment nodes: "1<!-- -->/<!-- -->5" — check tweet text instead
    expect(html).toContain("geen sci-fi meer");
  });

  it("contains link to original blog", async () => {
    const html = await render(React.createElement(Repurposed, PROPS));
    expect(html).toContain("https://artifation.nl/ai-in-hr-mkb/");
  });
});
