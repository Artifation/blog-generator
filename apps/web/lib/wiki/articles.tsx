/**
 * Wiki article registry. Each article is a JSX component so we can use
 * Callouts, Steps, code-blocks etc. without parsing markdown at runtime.
 * The categories drive the sidebar grouping.
 */
import * as React from "react";
import {
  Article,
  Callout,
  Bullet,
  Steps,
  Step,
  Codeblock,
  Glossary,
  GlossaryEntry,
  SpecTable,
  StatGrid,
  Stat,
  HeroNumber,
  Checklist,
  Check,
  Compare,
  ComparePane,
  KeyValue,
  Pill,
  Quote,
  Toc,
} from "./ui";

export type WikiCategory =
  | "starten"
  | "blueprint"
  | "seo"
  | "rubric"
  | "schrijven"
  | "data"
  | "termen";

export interface WikiArticleMeta {
  slug: string;
  title: string;
  category: WikiCategory;
  summary: string;
  readMinutes: number;
  /** Vrije tags voor "gerelateerde artikelen". Default: zelfde categorie. */
  tags?: string[];
  /** Expliciete lijst van slugs die als "gerelateerd" tonen — override van tag/categorie-logic. */
  related?: string[];
  /** ISO-datum "YYYY-MM-DD" of menselijke string. Valt terug op WIKI_DEFAULT_UPDATED. */
  updated?: string;
}

export interface WikiArticle extends WikiArticleMeta {
  body: React.ReactNode;
}

/** Default "laatst bijgewerkt"-label voor artikelen zonder eigen `updated`. */
export const WIKI_DEFAULT_UPDATED = "mei 2026";

export const CATEGORY_LABEL: Record<WikiCategory, string> = {
  starten: "Aan de slag",
  blueprint: "Perfecte blog — blauwdruk",
  seo: "SEO basics",
  rubric: "Kwaliteits-rubric",
  schrijven: "Brand voice & schrijven",
  data: "GSC & DataForSEO",
  termen: "Termen-glossary",
};

export const CATEGORY_ORDER: WikiCategory[] = [
  "starten",
  "blueprint",
  "seo",
  "schrijven",
  "rubric",
  "data",
  "termen",
];

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export const ARTICLES: WikiArticle[] = [
  {
    slug: "hoe-de-tool-werkt",
    category: "starten",
    title: "Hoe deze tool werkt",
    summary: "Van topic-idee tot gepubliceerde post — wat doet elke stap.",
    readMinutes: 4,
    body: (
      <Article
        title="Hoe deze tool werkt"
        intro="Een korte rondleiding: wat gebeurt er tussen 'ik heb een topic' en 'er staat een gepubliceerde blog op mijn site'."
      >
        <p>
          De tool is een <strong>multi-agent pipeline</strong>. Voor elke blog draait
          een keten van zeven specialistische AI-stappen, waar elke stap de
          output van de vorige scherper maakt. Het is geen "schrijf een
          blog"-prompt — het is een echte productie-flow.
        </p>

        <h2>De pipeline-stappen</h2>
        <Steps>
          <Step n={1} title="Researcher (Gemini met search grounding)">
            Zoekt live op Google naar feiten, statistieken en concurrenten rond
            het keyword. Resultaten worden gegrond op echte URL's (geen
            verzonnen bronnen).
          </Step>
          <Step n={2} title="Strategist (Anthropic Claude)">
            Maakt op basis van research een outline: H1, H2-secties, TL;DR,
            internal/external links, contrarian opinion-hint.
          </Step>
          <Step n={3} title="Writer (Claude)">
            Schrijft het hele artikel volgens de outline, brand voice en
            ban-list. Mag alleen statistieken gebruiken die uit research komen
            (no fabrication).
          </Step>
          <Step n={4} title="SEO Editor (Claude)">
            Polijst meta-title, meta-description, slug, alt-texts en interne
            links. Past het schrijfsel aan voor scanbaarheid.
          </Step>
          <Step n={5} title="Fact Checker (Claude)">
            Verifieert elke specifieke claim tegen de research key_facts. Cijfers
            zonder bron worden gevlagd.
          </Step>
          <Step n={6} title="Quality Judge (Claude)">
            Scoort de draft op 8 dimensies (zie de rubric-uitleg). Onder de
            threshold → rejected, anders publishable.
          </Step>
          <Step n={7} title="Image Prompter + Generator (Groq + Fal.ai)">
            Maakt een prompt voor de feature-image en genereert 'm. Optioneel:
            zonder Fal.ai krijgt de post geen image.
          </Step>
        </Steps>

        <Callout type="tip" title="Wat je zelf bepaalt">
          De pipeline volgt jouw <strong>brand voice</strong>, <strong>ban list</strong>{" "}
          en <strong>pillars</strong> uit de Settings. Hoe scherper die zijn, hoe minder
          generiek de output. Custom-instructions per topic sturen 'm nog
          specifieker.
        </Callout>

        <h2>Status van een topic</h2>
        <Bullet>
          <li><code>queued</code> — staat in de wachtrij, wordt gepakt door de volgende run</li>
          <li><code>in_progress</code> — pipeline draait</li>
          <li><code>published</code> — draft is goedgekeurd en op de site</li>
          <li><code>rejected</code> — quality score onder threshold, retry of bewerk</li>
          <li><code>cap_deferred</code> — week-cap bereikt, wacht tot volgende week</li>
          <li><code>cannibalization_skipped</code> — bestaand artikel ranking al voor dit keyword</li>
        </Bullet>
      </Article>
    ),
  },

  {
    slug: "blog-audit-uitleg",
    category: "starten",
    title: "De Blog-audit feature gebruiken",
    summary: "Plak je eigen blog, krijg een rubric-score en concrete fixes.",
    readMinutes: 3,
    body: (
      <Article
        title="De Blog-audit feature gebruiken"
        intro="Voor blogs die je zelf schreef (of door anderen liet schrijven) draait dezelfde quality-rubric als de pipeline. Inclusief SERP-vergelijking en herschrijf-voorstellen."
      >
        <h2>Wat je krijgt</h2>
        <Bullet>
          <li><strong>6 dimensie-scores</strong> + gewogen totaal</li>
          <li><strong>Fix-first lijst</strong> — 3-5 concrete acties in prioriteit</li>
          <li><strong>Issues</strong> met severity, quote uit je tekst en herschrijf-voorstel</li>
          <li><strong>Deterministische signalen</strong> — Flesch, banlist-hits, em-dashes, heading-structuur, zinslengte, passieve zinnen, leestijd</li>
          <li><strong>SERP-analyse</strong> (als DataForSEO ingesteld) — wat dekt de top-10 dat jij mist</li>
          <li><strong>Verbeterde versie</strong> — volledig herschreven blog, één klik kopiëren</li>
        </Bullet>

        <h2>De Toepassen-knop</h2>
        <p>
          Bij elke issue met een quote en herschrijf-voorstel staat naast{" "}
          <em>Kopieer</em> ook een blauwe <em>Toepassen</em>-knop. Eén klik
          vervangt het gequote stuk in je input-textarea door het voorstel.
          Werkt ook bij minimale whitespace-verschillen.
        </p>

        <Callout type="tip" title="Werkflow">
          Audit → fix de top-3 met Toepassen-knop → opnieuw audit. Tweede ronde
          scoort meestal 1-2 punten hoger. Daarna nog 1 ronde met de Verbeterde
          versie als basis voor finale polish.
        </Callout>
      </Article>
    ),
  },

  // ===========================================================================
  // BLUEPRINT — De perfecte blog in cijfers
  // ===========================================================================
  {
    slug: "perfecte-blog-blueprint",
    category: "blueprint",
    title: "De perfecte blog — blauwdruk in cijfers",
    summary:
      "Alle exacte targets voor woorden, koppen, meta-tags, links, snelheid en schema. Geen meningen, alleen getallen.",
    readMinutes: 11,
    body: (
      <Article
        title="De perfecte blog — blauwdruk in cijfers"
        intro="Dit is dé referentiepagina: élke parameter van een blog die ranked, in exacte getallen. Geen 'het hangt ervan af' — alleen ranges, drempels en concrete targets gebaseerd op SERP-analyses, Google's eigen documentatie en de helpful-content updates van 2023-2026."
      >
        <Toc
          items={[
            { href: "#tldr", label: "TL;DR — de 12 must-have cijfers" },
            { href: "#woorden", label: "Woordenaantal per intent" },
            { href: "#koppen", label: "Heading-structuur (H1, H2, H3)" },
            { href: "#meta", label: "Meta-tags + URL" },
            { href: "#openings", label: "Opening, TL;DR & directe antwoord" },
            { href: "#alinea", label: "Alinea-, zin- en leesbaarheidsgrenzen" },
            { href: "#keywords", label: "Keyword-plaatsing" },
            { href: "#links", label: "Interne + externe links" },
            { href: "#beeld", label: "Afbeeldingen & alt-text" },
            { href: "#schema", label: "Structured data (schema)" },
            { href: "#speed", label: "Core Web Vitals & mobile" },
            { href: "#eat", label: "E-E-A-T signalen op de pagina" },
            { href: "#checklist", label: "De definitieve checklist" },
          ]}
        />

        <h2 id="tldr">TL;DR — de 12 must-have cijfers</h2>
        <p>
          Een blog die anno 2026 in NL kan ranken voldoet aan deze 12 harde
          parameters. Mis er één en je dropt 5-15 posities; mis er drie en je
          haalt page 1 nooit.
        </p>

        <StatGrid>
          <Stat value="1500-2500" label="woorden" hint="informational long-form" />
          <Stat value="1" label="H1" hint="exact één per pagina" tone="warning" />
          <Stat value="5-10" label="H2-secties" hint="één per ~250-400 wd" />
          <Stat value="50-60" label="chars meta-title" hint="≤600px breedte" />
          <Stat value="140-160" label="chars meta-desc" hint="met CTA" />
          <Stat value="40-60" label="wd direct-answer" hint="boven de vouw, AIO-citeerbaar" />
          <Stat value="≤60" label="chars URL-slug" hint="≤5 woorden, kebab-case" />
          <Stat value="3-8" label="interne links" hint="naar relevante pillars" />
          <Stat value="2-4" label="externe links" hint="authoritative (gov, vakblad, studie)" />
          <Stat value="55-75" label="Flesch NL" hint="leesbaar voor breed publiek" />
          <Stat value="0.5-1.5%" label="keyword density" hint="↑3% = stuffing-risico" tone="warning" />
          <Stat value="<2.5s" label="LCP" hint="Core Web Vitals — good" tone="success" />
        </StatGrid>

        {/* ----------------------------- WOORDEN ----------------------------- */}
        <h2 id="woorden">1. Woordenaantal per intent</h2>
        <p>
          Het "ideale" woordenaantal hangt af van de <em>search intent</em>{" "}
          (informational, commercial, transactional) en de gemiddelde lengte
          van de top-10 SERP. Onder de range = je dekt het onderwerp niet;
          boven de range = padding die je Flesch en CTR ondermijnt.
        </p>

        <SpecTable
          caption="Woorden per intent-type"
          rows={[
            {
              label: "Informational long-form",
              value: "1500 - 2500 wd",
              why: "Standaard 'wat is X / hoe werkt Y'-gids; matcht top-10 NL SERP gemiddelde",
            },
            {
              label: "Pillar / cornerstone post",
              value: "3000 - 5000 wd",
              why: "Hub-pagina die naar 5-10 cluster-posts linkt",
            },
            {
              label: "Commercial / comparison",
              value: "1000 - 2000 wd",
              why: "Vergelijking, pros/cons, beslissingstabel — geen filler",
            },
            {
              label: "Transactional",
              value: "500 - 1000 wd",
              why: "Korter — koper wil prijs/CTA boven de vouw",
            },
            {
              label: "News / update",
              value: "400 - 800 wd",
              why: "Snel publiceren, freshness > diepgang",
            },
            {
              label: "How-to / tutorial",
              value: "1200 - 2200 wd",
              why: "Stap-voor-stap, screenshots tellen niet als wd",
            },
          ]}
        />

        <Callout type="warning" title="Filler-risico vanaf ~2500 wd">
          Boven de 2500 woorden voor één informational topic begint je dwell-
          time per woord te dalen. Google's quality classifier weegt
          completeness vs verbosity. Liever 1800 sterk dan 3500 met fluff.
        </Callout>

        {/* ----------------------------- KOPPEN ----------------------------- */}
        <h2 id="koppen">2. Heading-structuur (H1, H2, H3)</h2>
        <p>
          Headings zijn voor zowel lezers als voor Google's content-classifier
          de skeletkaart van je post. Eén foute heading-hiërarchie en je
          verliest featured-snippet kansen.
        </p>

        <SpecTable
          caption="Aantallen per heading-niveau"
          rows={[
            {
              label: <>H1 <Pill tone="danger">verplicht</Pill></>,
              value: "exact 1",
              why: "Eén per pagina. Bevat primary keyword. Niet identiek aan meta-title.",
            },
            {
              label: <>H2 <Pill>core</Pill></>,
              value: "5 - 10",
              why: "Eén H2 per ~250-400 wd. Drijft TOC + featured snippets.",
            },
            {
              label: <>H3 <Pill tone="muted">optioneel</Pill></>,
              value: "0 - 4 per H2",
              why: "Alleen als H2-sectie >400 wd. Niet voor dunne posts.",
            },
            {
              label: <>H4 <Pill tone="muted">zeldzaam</Pill></>,
              value: "0 - 2",
              why: "Alleen in technische / how-to. Anders skippen.",
            },
            {
              label: "Hiërarchie",
              value: "H1 → H2 → H3",
              why: "Nooit niveau overslaan. H1 → H3 zonder H2 = klassieke fout.",
            },
            {
              label: "Keyword in H2",
              value: "≥ 2 van de 5+",
              why: "Variaties / synoniemen, niet exact-match overal",
            },
            {
              label: "H2-lengte",
              value: "30 - 70 chars",
              why: "Boven 70 = sliding cut-off in TOC widgets",
            },
          ]}
        />

        <Compare>
          <ComparePane tone="good" label="Goed">
            <strong>H1:</strong> Personeelstekort oplossen met AI<br />
            <strong>H2:</strong> Wat is personeelstekort precies?<br />
            <strong>H2:</strong> Hoe AI repetitieve taken overneemt<br />
            <strong>H2:</strong> 3 voorbeelden uit het MKB<br />
            <strong>H3:</strong> Voorbeeld 1 — administratie<br />
            <strong>H3:</strong> Voorbeeld 2 — klantcontact<br />
            <strong>H2:</strong> Kosten en terugverdientijd<br />
            <strong>H2:</strong> Veelgestelde vragen
          </ComparePane>
          <ComparePane tone="bad" label="Fout">
            <strong>H1:</strong> Personeelstekort oplossen met AI<br />
            <strong>H1:</strong> Wat is personeelstekort?  <em>← 2e H1</em><br />
            <strong>H3:</strong> Hoe AI helpt  <em>← H2 overgeslagen</em><br />
            <strong>H2:</strong> Voorbeelden<br />
            <strong>H4:</strong> Voorbeeld 1  <em>← H3 overgeslagen</em><br />
            <strong>H2:</strong> Conclusie  <em>← 'conclusie' is ban-woord</em>
          </ComparePane>
        </Compare>

        {/* ----------------------------- META ----------------------------- */}
        <h2 id="meta">3. Meta-tags + URL</h2>
        <p>
          Meta-title is het sterkste on-page signaal voor ranking <em>én</em>{" "}
          CTR. Meta-description beïnvloedt CTR maar niet directe ranking.
        </p>

        <SpecTable
          caption="Meta-data targets"
          rows={[
            {
              label: "Meta-title (lengte)",
              value: "50 - 60 chars",
              why: "Boven 60 chars wordt afgekapt (~580-600 pixels)",
            },
            {
              label: "Meta-title (keyword positie)",
              value: "in eerste 30 chars",
              why: "Linkse positie = sterkere ranking-weighting",
            },
            {
              label: "Meta-title (uniek)",
              value: "100% uniek per pagina",
              why: "Duplicate titles → Google kiest zelf, vaak fout",
            },
            {
              label: "Meta-description",
              value: "140 - 160 chars",
              why: "Boven 158 chars cut-off in desktop SERP",
            },
            {
              label: "Meta-description (CTA)",
              value: "1 actie-zin",
              why: "'Ontdek hoe…', 'Lees waarom…', 'Bereken jouw…'",
            },
            {
              label: "URL-slug (lengte)",
              value: "≤ 60 chars",
              why: "Korter = beter onthouden + beter klikken",
            },
            {
              label: "URL-slug (woorden)",
              value: "3 - 5 woorden",
              why: "Match met primary keyword, geen stopwoorden",
            },
            {
              label: "URL-formaat",
              value: "kebab-case, lowercase",
              why: "Geen underscores, geen accenten, geen %20",
            },
          ]}
        />

        <Compare>
          <ComparePane tone="good" label="Goede meta">
            <strong>Title:</strong> AI voor MKB: 7 toepassingen die direct geld besparen
            <span style={{ color: "var(--muted)", fontSize: 11 }}> (58 chars ✓)</span>
            <br /><br />
            <strong>Desc:</strong> Ontdek welke AI-tools nu al renderen voor
            Nederlandse MKB-bedrijven. Concrete cases, prijzen, terugverdientijd.
            <span style={{ color: "var(--muted)", fontSize: 11 }}> (152 chars ✓)</span>
            <br /><br />
            <strong>Slug:</strong> /ai-voor-mkb-toepassingen
          </ComparePane>
          <ComparePane tone="bad" label="Slechte meta">
            <strong>Title:</strong> Alles over kunstmatige intelligentie en hoe je dat als ondernemer kunt gebruiken
            <span style={{ color: "var(--muted)", fontSize: 11 }}> (88 chars — afgekapt)</span>
            <br /><br />
            <strong>Desc:</strong> Welkom bij ons artikel.
            <span style={{ color: "var(--muted)", fontSize: 11 }}> (21 chars — Google schrijft zelf)</span>
            <br /><br />
            <strong>Slug:</strong> /blog/2026/05/alles-over-ai-voor-ondernemers-in-nederland-volledige-gids
          </ComparePane>
        </Compare>

        {/* --------------------------- OPENINGS --------------------------- */}
        <h2 id="openings">4. Opening, TL;DR & direct-answer</h2>
        <p>
          De eerste 100 woorden bepalen of de lezer blijft, of de
          featured-snippet wint, en of AI Overviews (AIO) je citeren.
        </p>

        <HeroNumber
          value="40 - 60 wd"
          label="Direct-answer-blok bovenaan"
          sub="Beantwoordt de hoofdvraag in 2-3 zinnen — AIO- én featured-snippet-bait"
        />

        <SpecTable
          caption="De openings-stack"
          rows={[
            {
              label: "Hook (eerste zin)",
              value: "≤ 20 wd",
              why: "Concrete claim of getal, geen 'in een wereld waar'",
            },
            {
              label: "Primary keyword positie",
              value: "in eerste 100 wd",
              why: "Bevestigt topical relevance aan crawler",
            },
            {
              label: "Direct-answer-blok",
              value: "40 - 60 wd",
              why: "Beste lengte voor featured snippet (paragraph type)",
            },
            {
              label: "TL;DR (optioneel)",
              value: "100 - 150 wd",
              why: "Onder direct-answer; samenvatting van H2's",
            },
            {
              label: "Eerste H2",
              value: "≤ 400 wd onder de vouw",
              why: "Lezer scrollt door als hij iets ziet",
            },
          ]}
        />

        <Callout type="tip" title="In deze tool">
          De Strategist genereert standaard drie lagen: een hook (one-liner),
          een 40-60w direct-answer (AIO-citeerbaar) en een 134w TL;DR. Bewerk
          ze in de draft als ze niet klinken naar jouw site.
        </Callout>

        {/* --------------------------- ALINEA --------------------------- */}
        <h2 id="alinea">5. Alinea-, zin- en leesbaarheidsgrenzen</h2>

        <SpecTable
          caption="Lees-microstructuur"
          rows={[
            {
              label: "Zinslengte (gemiddeld)",
              value: "12 - 18 wd",
              why: "Boven 22 wd: lezer verliest grip op syntax",
            },
            {
              label: "Lange zinnen (>25 wd)",
              value: "≤ 15% van totaal",
              why: "Mag, maar afwisselen met korte voor ritme",
            },
            {
              label: "Alinea-lengte",
              value: "2 - 4 zinnen",
              why: "Boven 100 wd / alinea = 'wall of text' op mobile",
            },
            {
              label: "Passieve zinnen",
              value: "≤ 10%",
              why: "Active voice = directer, sterker, korter",
            },
            {
              label: "Flesch NL score",
              value: "55 - 75",
              why: "55 = pittig maar leesbaar; 75 = breed publiek",
            },
            {
              label: "Em-dash gebruik (—)",
              value: "≤ 3 per 1000 wd",
              why: "GPT-tic; meer = directe AI-tell",
            },
            {
              label: "Bullets / lists",
              value: "min. 1 per H2-sectie",
              why: "Scanbaarheid + featured-snippet (list type)",
            },
            {
              label: "Bullet-lengte",
              value: "5 - 25 wd / bullet",
              why: "Eénduidig, geen sub-bullets in lopend artikel",
            },
          ]}
        />

        {/* --------------------------- KEYWORDS --------------------------- */}
        <h2 id="keywords">6. Keyword-plaatsing</h2>
        <p>
          Anno 2026 telt context veel zwaarder dan exact-match. Maar je
          primary keyword (+ 3-5 semantische varianten) moet wél op een
          handvol vaste plekken staan.
        </p>

        <Checklist>
          <Check title="Primary keyword in H1">
            Liefst in de eerste helft van de H1. Variant mag, exact-match niet
            verplicht.
          </Check>
          <Check title="Primary keyword in meta-title (eerste 30 chars)">
            De #1 plek waar Google + lezer 'm scanned.
          </Check>
          <Check title="Primary keyword in URL-slug">
            Match de exacte versie van het keyword.
          </Check>
          <Check title="Primary keyword in eerste 100 woorden">
            Voor crawler relevance + lezer-confirmation.
          </Check>
          <Check title="Primary keyword in ≥1 image alt-tag">
            Eén, niet alle — anders alt-stuffing.
          </Check>
          <Check title="Semantische varianten (LSI) in 2+ H2's">
            "AI voor MKB" → "kunstmatige intelligentie voor het MKB",
            "AI-tools voor kleine bedrijven".
          </Check>
          <Check title="Keyword density tussen 0.5% en 1.5%">
            Boven 2% triggert spam-classifier. Onder 0.3% mist relevance.
          </Check>
          <Check title="Geen exact-match-anchor-spam in interne links">
            Variatie houden; max 1 interne link met exact-match anchor.
          </Check>
        </Checklist>

        {/* ----------------------------- LINKS ----------------------------- */}
        <h2 id="links">7. Interne + externe links</h2>

        <SpecTable
          caption="Link-targets"
          rows={[
            {
              label: "Interne links (min.)",
              value: "≥ 3",
              why: "Vereist door deze tool's rubric; bouwt topical authority",
            },
            {
              label: "Interne links (sweet spot)",
              value: "5 - 8",
              why: "Verdeeld over de tekst, niet allemaal in conclusie",
            },
            {
              label: "Externe links (authoritative)",
              value: "2 - 4",
              why: "Gov-sites, vakblad, originele studies — verhoogt trust",
            },
            {
              label: "Anchor-text (beschrijvend)",
              value: "3 - 8 wd",
              why: "Niet 'klik hier' — geef context aan crawler + lezer",
            },
            {
              label: "Anchor-text (exact-match-ratio)",
              value: "≤ 30% van interne links",
              why: "Te veel exact-match = SpamBrain 3.0 pattern",
            },
            {
              label: "Outbound (nofollow ratio)",
              value: "noindex/nofollow alleen sponsored",
              why: "Authoriteit-links open laten = E-E-A-T-positief",
            },
            {
              label: "Eerste interne link",
              value: "binnen eerste 300 wd",
              why: "Crawler-pad opzetten + cluster-context signaal",
            },
          ]}
        />

        <Quote>
          Een blog zonder interne links is een wees-pagina. Google ziet 'm
          binnen, maar mist het cluster-signaal dat hem laat ranken.
        </Quote>

        {/* ---------------------------- BEELD ---------------------------- */}
        <h2 id="beeld">8. Afbeeldingen & alt-text</h2>

        <SpecTable
          caption="Image-specs"
          rows={[
            {
              label: "Aantal afbeeldingen",
              value: "1 per 300-500 wd",
              why: "Visueel ritme + meer ranking-anker voor image-search",
            },
            {
              label: "Feature-image (hero)",
              value: "1600 × 900 px",
              why: "16:9, OG-share compatible, scaled door Next.js",
            },
            {
              label: "Bestandsformaat",
              value: "WebP (fallback JPG)",
              why: "30-50% kleiner dan JPG bij gelijke kwaliteit",
            },
            {
              label: "Bestandsgrootte",
              value: "< 150 KB / afbeelding",
              why: "LCP < 2.5s blijft haalbaar op 4G",
            },
            {
              label: "Alt-tekst (lengte)",
              value: "8 - 16 wd",
              why: "Beschrijvend; geen 'image of …'",
            },
            {
              label: "Alt-tekst (keyword)",
              value: "1 alt bevat primary keyword",
              why: "Niet allemaal — anders alt-stuffing",
            },
            {
              label: "Filename",
              value: "kebab-case beschrijvend",
              why: "ai-voor-mkb-team-meeting.webp, niet IMG_4231.jpg",
            },
            {
              label: "Lazy loading",
              value: "verplicht behalve hero",
              why: "Native loading='lazy', hero='eager'",
            },
          ]}
        />

        {/* ---------------------------- SCHEMA ---------------------------- */}
        <h2 id="schema">9. Structured data (schema)</h2>
        <p>
          Zonder JSON-LD schema mis je rich snippets, sitelinks, author-cards
          en breadcrumbs in de SERP. De tool genereert deze automatisch, maar
          dit is wat erin moet staan.
        </p>

        <SpecTable
          caption="Verplichte JSON-LD blokken per blogpost"
          rows={[
            {
              label: "BlogPosting / Article",
              value: "verplicht",
              why: "headline, author, datePublished, dateModified, image, keywords",
            },
            {
              label: "BreadcrumbList",
              value: "verplicht",
              why: "Home → Categorie → Post — toont breadcrumb in SERP",
            },
            {
              label: "Person (auteur)",
              value: "verplicht",
              why: "name + sameAs (LinkedIn) + knowsAbout — E-E-A-T-anker",
            },
            {
              label: "Organization (publisher)",
              value: "verplicht",
              why: "name + logo + url — vereist voor rich snippets",
            },
            {
              label: "FAQPage",
              value: "optioneel",
              why: "Alleen als post ≥3 Q&A heeft; verlaagt CTR concurrenten",
            },
            {
              label: "HowTo",
              value: "optioneel",
              why: "Alleen voor stap-voor-stap tutorials met afbeeldingen",
            },
          ]}
        />

        <Codeblock>{`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "AI voor MKB: 7 toepassingen die direct geld besparen",
  "image": "https://artifation.nl/blog/ai-mkb-hero.webp",
  "author": {
    "@type": "Person",
    "name": "Julian Dunsbergen",
    "url": "https://artifation.nl/auteur/julian",
    "sameAs": ["https://linkedin.com/in/julian-dunsbergen"]
  },
  "publisher": {
    "@type": "Organization",
    "name": "Artifation",
    "logo": { "@type": "ImageObject", "url": "https://artifation.nl/logo.png" }
  },
  "datePublished": "2026-05-22",
  "dateModified": "2026-05-22",
  "keywords": ["AI voor MKB", "kunstmatige intelligentie MKB"]
}
</script>`}</Codeblock>

        <Callout type="success" title="Validatie">
          Test elke live pagina via{" "}
          <a
            href="https://search.google.com/test/rich-results"
            target="_blank"
            rel="noreferrer"
          >
            search.google.com/test/rich-results
          </a>{" "}
          en{" "}
          <a href="https://validator.schema.org" target="_blank" rel="noreferrer">
            validator.schema.org
          </a>
          . Geen warnings, geen errors.
        </Callout>

        {/* ---------------------------- SPEED ---------------------------- */}
        <h2 id="speed">10. Core Web Vitals & mobile</h2>
        <p>
          Sinds 2021 zijn Core Web Vitals een directe ranking-factor. In 2024
          verving INP (Interaction to Next Paint) de oude FID-metric.
        </p>

        <SpecTable
          caption="Core Web Vitals — Google 'good'-grenzen (75e percentiel)"
          rows={[
            {
              label: <>LCP <Pill>Largest Contentful Paint</Pill></>,
              value: "< 2.5s",
              why: "Hoofdcontent geladen — kritiek voor mobile-4G",
            },
            {
              label: <>INP <Pill>Interaction to Next Paint</Pill></>,
              value: "< 200ms",
              why: "Reactie op klik/tap — vervangt FID sinds maart 2024",
            },
            {
              label: <>CLS <Pill>Cumulative Layout Shift</Pill></>,
              value: "< 0.1",
              why: "Geen springende layouts — alle img/iframe-size gespecificeerd",
            },
            {
              label: "TTFB",
              value: "< 800ms",
              why: "Time to First Byte — server-side responsiviteit",
            },
            {
              label: "Mobile-friendly",
              value: "100%",
              why: "Mobile-first index sinds 2021 — alles op mobile gerendered",
            },
            {
              label: "Touch-target",
              value: "≥ 48 × 48 px",
              why: "Buttons / links niet te dicht bij elkaar",
            },
            {
              label: "Viewport meta",
              value: "verplicht",
              why: "<meta name='viewport' content='width=device-width'>",
            },
          ]}
        />

        {/* ----------------------------- EAT ----------------------------- */}
        <h2 id="eat">11. E-E-A-T signalen op de pagina</h2>
        <p>
          E-E-A-T (Experience, Expertise, Authoritativeness, Trust) is geen
          ranking-factor an sich, maar drijft veel andere signalen. Deze
          elementen móeten op de pagina staan:
        </p>

        <Checklist>
          <Check title="Author-byline met naam (geen 'Admin')">
            Boven of onder de post; klikbaar naar /auteur/ pagina.
          </Check>
          <Check title="Author-bio (40-100 wd) onder de post">
            Met expertise-bullet ("10 jaar AI-implementatie MKB").
          </Check>
          <Check title="LinkedIn-link bij author">
            Geneste sameAs in Person schema + zichtbare link.
          </Check>
          <Check title="Publicatiedatum + laatst-bewerkt-datum">
            Beide; vers gebakken content rankt 5-15% beter.
          </Check>
          <Check title="≥ 2 named sources in lopende tekst">
            "Volgens RVO-data 2025…" / "CBS rapporteert…"
          </Check>
          <Check title="≥ 1 originele invalshoek / casus / data">
            Niet samenvatten — uniek perspectief is hard fail-criterium in rubric.
          </Check>
          <Check title="Bedrijfsgegevens in footer">
            KvK + BTW + contact — NL trust-signaal.
          </Check>
          <Check title="HTTPS + geldig certificaat">
            Geen mixed-content warnings.
          </Check>
        </Checklist>

        {/* ---------------------------- CHECKLIST ---------------------------- */}
        <h2 id="checklist">12. De definitieve checklist</h2>
        <p>
          Print 'm uit, plak 'm naast je scherm. Geen post mag online zonder
          dat alle vakjes zijn afgevinkt.
        </p>

        <Checklist>
          <Check title="1× H1, met primary keyword, niet identiek aan meta-title">
            Exact één per pagina.
          </Check>
          <Check title="5-10 H2's, één per ~250-400 woorden">
            ≥2 H2's met keyword-variatie.
          </Check>
          <Check title="Meta-title 50-60 chars, keyword in eerste 30">
            Uniek vs alle andere paginas op je site.
          </Check>
          <Check title="Meta-description 140-160 chars, 1 CTA-zin">
            Geen lege beschrijving — Google schrijft anders zelf.
          </Check>
          <Check title="URL-slug ≤60 chars, ≤5 woorden, kebab-case">
            Geen datum, geen /blog/2026/05/-prefix.
          </Check>
          <Check title="Direct-answer-blok 40-60 wd boven de vouw">
            AIO + featured-snippet ammunitie.
          </Check>
          <Check title="Woordenaantal in range voor je intent">
            1500-2500 informational / 1000-2000 commercial / 500-1000 transactional.
          </Check>
          <Check title="Alinea's 2-4 zinnen, gemiddelde zin 12-18 wd">
            Flesch NL 55-75.
          </Check>
          <Check title="Keyword in H1, meta, URL, eerste 100 wd, ≥1 alt">
            Density 0.5-1.5%.
          </Check>
          <Check title="≥3 interne links + 2-4 externe authoritative links">
            Eerste interne link binnen 300 wd.
          </Check>
          <Check title="1 afbeelding per 300-500 wd, WebP, <150KB, alt-tag 8-16 wd">
            Hero 1600×900, lazy-load alle behalve hero.
          </Check>
          <Check title="JSON-LD: BlogPosting + BreadcrumbList + Person + Organization">
            Schema-validator 0 errors / 0 warnings.
          </Check>
          <Check title="LCP <2.5s / INP <200ms / CLS <0.1 op PageSpeed">
            Mobile + desktop beide groen.
          </Check>
          <Check title="Author-byline + bio + LinkedIn + publish + modified dates">
            E-E-A-T pakket compleet.
          </Check>
          <Check title="≥1 originele casus / data / contrarian invalshoek">
            Originality rubric ≥7 — anders hard fail.
          </Check>
          <Check title="Ban-list 0 hits, em-dashes ≤3 per 1000 wd">
            'Delve', 'leverage', 'in conclusion' = directe fail.
          </Check>
        </Checklist>

        <Callout type="success" title="Hoe deze tool dit afdwingt">
          Elk van de bovenstaande regels wordt automatisch gecontroleerd door
          de pipeline (Strategist + SEO Editor + Quality Judge + Fact Checker).
          Onder een gewogen rubric-totaal van 8.0 → status <code>rejected</code>.
          Boven 8.0 → status <code>publishable</code>. Je kunt zelf niets vergeten.
        </Callout>
      </Article>
    ),
  },

  // ===========================================================================
  // SEO basics — verdiepende artikelen
  // ===========================================================================
  {
    slug: "hoe-een-blog-rankt",
    category: "seo",
    title: "Hoe een blog rankt in Google",
    summary: "De factoren die echt tellen anno 2026.",
    readMinutes: 5,
    body: (
      <Article
        title="Hoe een blog rankt in Google"
        intro="Google ranked op honderden signalen, maar 95% van het verschil zit in een handvol fundamenten. Hier zijn ze, in volgorde van impact."
      >
        <h2>De vijf fundamenten</h2>

        <Steps>
          <Step n={1} title="Relevantie voor de search intent">
            Het belangrijkste signaal. Als iemand "wat is X" zoekt en jij geeft
            een productpagina, rank je nooit. Match je content op informational /
            commercial / transactional intent. Zie het artikel{" "}
            <em>Search intent</em>.
          </Step>
          <Step n={2} title="E-E-A-T">
            Experience, Expertise, Authority, Trust. Google wil weten dat de
            schrijver gekwalificeerd is. Author-bio + LinkedIn + named sources +
            consistent publiceren in 1 niche zijn de zichtbare signalen.
          </Step>
          <Step n={3} title="Originaliteit">
            Hoe meer eigen invalshoek, casus, data of contrarian opinion, hoe
            beter. Pure samenvattingen van bestaande content (= meeste AI-blogs)
            zakken na de helpful-content-update.
          </Step>
          <Step n={4} title="Structured data + technische signalen">
            JSON-LD schema (BlogPosting, BreadcrumbList, Person), heldere
            heading-hiërarchie, snelle laadtijd, mobile-friendly. Zonder dit
            mis je rich snippets en sitelinks.
          </Step>
          <Step n={5} title="Interne + externe links">
            Interne links bouwen topical authority en spreiden link equity.
            Externe links naar authoritative bronnen (gov, vakblad, originele
            studies) verhogen je trust-score.
          </Step>
        </Steps>

        <h2>Wat NIET (meer) werkt</h2>
        <Bullet>
          <li>Keyword stuffing — Google's BERT begrijpt context, density boven 3% is een rode vlag</li>
          <li>Volume om volume's wil — 1 sterke long-form post slaat 5 dunne posts</li>
          <li>Generieke AI-output zonder eigen invalshoek — sinds maart 2024 ge-devalueerd</li>
          <li>Exact-match anchor text overal — SpamBrain 3.0 ziet het pattern</li>
        </Bullet>

        <Callout type="info" title="De rubric volgt deze fundamenten">
          De 8 quality-dimensies waar de tool je posts op scoort komen direct
          uit deze SEO-fundamenten. Score hoog op originality + brand_voice +
          seo_meta + seo_schema = je vinkt de meeste vakjes af.
        </Callout>
      </Article>
    ),
  },

  {
    slug: "on-page-seo-checklist",
    category: "seo",
    title: "On-page SEO checklist (per post)",
    summary:
      "Concrete vinklijst van alles wat op de pagina zelf moet kloppen — title-tag tot alt-text.",
    readMinutes: 5,
    body: (
      <Article
        title="On-page SEO checklist (per post)"
        intro="Alles wat ON de pagina staat — meta-tags, koppen, content, links, images, schema. Off-page (backlinks, social) staat niet in deze lijst. Vink alles af per post."
      >
        <h2>Title-tag & meta</h2>
        <Checklist>
          <Check title="Meta-title 50-60 chars met primary keyword in eerste 30 chars" />
          <Check title="Meta-title is 100% uniek vs alle andere pagina's op je site" />
          <Check title="Meta-description 140-160 chars met 1 CTA-zin" />
          <Check title="URL-slug ≤60 chars, ≤5 woorden, kebab-case lowercase" />
          <Check title="Canonical URL gespecificeerd (self-referential bij standaard posts)" />
          <Check title="Open Graph: og:title, og:description, og:image, og:type='article'" />
          <Check title="Twitter Card: twitter:card='summary_large_image', twitter:title, twitter:image" />
        </Checklist>

        <h2>Content & koppen</h2>
        <Checklist>
          <Check title="Exact 1 H1, primary keyword erin, niet identiek aan meta-title" />
          <Check title="5-10 H2's, hiërarchie H1 → H2 → H3 niet doorbroken" />
          <Check title="≥2 H2's bevatten variaties van primary keyword" />
          <Check title="Direct-answer-blok 40-60 wd boven de vouw" />
          <Check title="Primary keyword in eerste 100 woorden" />
          <Check title="Keyword density tussen 0.5% en 1.5% (niet boven 2%)" />
          <Check title="≥1 bullet/list per H2-sectie voor scanbaarheid + featured snippets" />
        </Checklist>

        <h2>Links</h2>
        <Checklist>
          <Check title="≥3 interne links naar relevante pillar/cluster posts" />
          <Check title="Eerste interne link binnen eerste 300 wd" />
          <Check title="2-4 externe links naar authoritative bronnen (gov, vakblad, originele studie)" />
          <Check title="Anchor-text 3-8 wd beschrijvend, niet 'klik hier'" />
          <Check title="Exact-match anchor-ratio ≤30% van alle interne links" />
        </Checklist>

        <h2>Afbeeldingen</h2>
        <Checklist>
          <Check title="≥1 afbeelding per 300-500 wd, hero verplicht" />
          <Check title="Hero 1600×900, WebP-formaat, <150KB" />
          <Check title="Filename in kebab-case beschrijvend (niet IMG_4231)" />
          <Check title="Alt-tekst 8-16 wd beschrijvend, geen 'image of…'" />
          <Check title="1 (niet alle) alt-tekst bevat primary keyword" />
          <Check title="Lazy loading aan voor alle images behalve hero" />
          <Check title="Width + height attributes gespecificeerd (voorkomt CLS)" />
        </Checklist>

        <h2>Structured data (JSON-LD)</h2>
        <Checklist>
          <Check title="BlogPosting schema met headline, author, datePublished, dateModified, image" />
          <Check title="BreadcrumbList schema (Home → Categorie → Post)" />
          <Check title="Person schema voor author met sameAs (LinkedIn) en knowsAbout" />
          <Check title="Organization schema voor publisher met logo" />
          <Check title="Schema-validator: 0 errors, 0 warnings op live pagina" />
        </Checklist>

        <h2>E-E-A-T</h2>
        <Checklist>
          <Check title="Author-byline boven of onder de post (niet 'Admin')" />
          <Check title="Author-bio 40-100 wd onderaan met expertise-bullet + LinkedIn-link" />
          <Check title="Publicatiedatum + laatst-bewerkt-datum zichtbaar" />
          <Check title="≥2 named sources in lopende tekst" />
          <Check title="≥1 originele invalshoek / casus / data" />
        </Checklist>

        <h2>Technisch</h2>
        <Checklist>
          <Check title="HTTPS + geldig certificaat, geen mixed-content warnings" />
          <Check title="LCP <2.5s op mobile + desktop (PageSpeed Insights)" />
          <Check title="INP <200ms" />
          <Check title="CLS <0.1" />
          <Check title="Viewport meta-tag aanwezig" />
          <Check title="Lang-attribuut op html-tag ('nl')" />
        </Checklist>

        <Callout type="success" title="Audit deze checklist automatisch">
          De Blog-audit feature in deze tool checkt 90% van deze items
          automatisch wanneer je je live blog-URL of HTML invoert. De rest
          (Open Graph, og:image, Twitter Card) check je in de page-source met
          een browser-extensie zoals MozBar of via{" "}
          <a href="https://www.opengraph.xyz" target="_blank" rel="noreferrer">
            opengraph.xyz
          </a>
          .
        </Callout>
      </Article>
    ),
  },

  {
    slug: "search-intent",
    category: "seo",
    title: "Search intent: informational, commercial, transactional",
    summary: "Welke intent achter een keyword zit, en waarom verkeerd matchen je het ranken kost.",
    readMinutes: 4,
    body: (
      <Article
        title="Search intent: informational, commercial, transactional"
        intro="Google ranked steeds meer op intent dan op exact-match keyword. Snap de drie soorten en je vermijdt de #1 reden waarom blogs niet ranken."
      >
        <h2>De drie soorten</h2>

        <SpecTable
          rows={[
            {
              label: <>Informational <Pill tone="primary">long</Pill></>,
              value: "1500 - 2500 wd",
              why: '"wat is X", "hoe werkt Y", "waarom Z" — uitleg-content',
            },
            {
              label: <>Commercial <Pill tone="warning">medium</Pill></>,
              value: "1000 - 2000 wd",
              why: '"X vs Y", "beste X voor MKB" — vergelijken & kiezen',
            },
            {
              label: <>Transactional <Pill tone="success">kort</Pill></>,
              value: "500 - 1000 wd",
              why: '"X kopen", "Y prijzen" — direct converteren',
            },
            {
              label: <>Navigational <Pill tone="muted">brand</Pill></>,
              value: "n.v.t.",
              why: '"Artifation login", "tool naam" — niet relevant voor blog',
            },
          ]}
        />

        <Compare>
          <ComparePane tone="good" label="Goed gematcht">
            <strong>Keyword:</strong> "wat kost een SEO-audit"<br />
            <strong>Intent:</strong> informational<br />
            <strong>Content:</strong> 1800wd gids met prijs-ranges,
            scope-vergelijking, voorbeelden van wat erin zit. Zachte CTA
            onderaan ("praat met ons").
          </ComparePane>
          <ComparePane tone="bad" label="Slecht gematcht">
            <strong>Keyword:</strong> "wat kost een SEO-audit"<br />
            <strong>Intent:</strong> informational<br />
            <strong>Content:</strong> productpagina met "vanaf €X, bestel nu"
            zonder context.<br />
            <em>Resultaat:</em> Google rankt 'm niet — mismatch.
          </ComparePane>
        </Compare>

        <h2>Hoe bepaal je de intent?</h2>
        <Bullet>
          <li>Zoek het keyword in incognito-modus op Google</li>
          <li>Kijk welke <strong>type pagina's</strong> in de top-10 staan</li>
          <li>Veel blogs/Wikipedia/gov? → informational</li>
          <li>Veel "best of" / vergelijkingen? → commercial</li>
          <li>Veel product/category-pagina's? → transactional</li>
        </Bullet>

        <Callout type="warning" title="De #1 ranking-fout">
          Een commercial-keyword targeten met een informational artikel (of
          omgekeerd). Google rankt je niet omdat je content niet matcht wat de
          zoeker wilde. Check eerst de SERP, dan schrijf je.
        </Callout>

        <p>
          In deze tool kies je de intent expliciet bij elk topic. Strategist
          past de outline daarop aan: meer of minder H2-secties, andere CTA-stijl,
          andere woordlimieten.
        </p>
      </Article>
    ),
  },

  {
    slug: "e-e-a-t",
    category: "seo",
    title: "E-E-A-T: Experience, Expertise, Authority, Trust",
    summary: "Google's manier om vakkundige content te onderscheiden van pulp.",
    readMinutes: 4,
    body: (
      <Article
        title="E-E-A-T: Experience, Expertise, Authority, Trust"
        intro="Een framework dat Google gebruikt om te beoordelen of een pagina geschreven is door iemand die er écht verstand van heeft. Het is geen ranking-factor an sich, maar drijft veel andere signalen."
      >
        <h2>De vier letters</h2>

        <Glossary>
          <GlossaryEntry term="Experience" short="ervaring">
            <strong>Eerste-hands ervaring</strong>. Heb je het zelf gedaan? Met
            klanten? Bewijzen: concrete cases, foto's van het werk, eigen data,
            uitspraken als "in mijn project zag ik X".
          </GlossaryEntry>
          <GlossaryEntry term="Expertise" short="vakkundigheid">
            Formele expertise. CV, opleiding, certificaten, jaren werkervaring.
            Een advocaat die over juridische zaken schrijft scoort hier hoger
            dan een marketeer over dezelfde zaken.
          </GlossaryEntry>
          <GlossaryEntry term="Authoritativeness" short="autoriteit">
            Wat anderen over jou zeggen. Inbound links van vakbladen, citaties
            in andere blogs, vermeldingen in Wikipedia. Niet zelf te beïnvloeden
            zonder PR/outreach.
          </GlossaryEntry>
          <GlossaryEntry term="Trust" short="betrouwbaarheid">
            HTTPS, geen typfouten, transparante author-info, opzeg-info bij
            commerce, KvK/BTW in de footer. Trust is de basis — zonder trust
            tellen E + E + A nauwelijks.
          </GlossaryEntry>
        </Glossary>

        <h2>Hoe scoor je hoger?</h2>
        <Checklist>
          <Check title="Author-bio onder elke post met LinkedIn-link">
            Standaard in deze tool.
          </Check>
          <Check title="Named sources in lopende tekst">
            "volgens RVO-data 2025" — niet anonieme links.
          </Check>
          <Check title="Eigen casussen — origineel-anker per post">
            Concrete €-bedragen, uren, klantvoorbeelden.
          </Check>
          <Check title="JSON-LD Person + Organization schema">
            Expliciet maken wie achter de site zit.
          </Check>
          <Check title="KvK + BTW in de footer">
            Nederlands trust-signaal — vereist voor B2B.
          </Check>
          <Check title="Pagina /auteur/<naam>">
            Dedicated author-pagina met bio, expertise, alle posts van die auteur.
          </Check>
        </Checklist>

        <Callout type="tip" title="In deze tool">
          Vul je <strong>Author bio + LinkedIn</strong> in onder Settings →
          Auteur. Dat veld verschijnt in de byline én in het JSON-LD Person
          schema. Twee E-E-A-T-vinkjes met één veldje.
        </Callout>
      </Article>
    ),
  },

  {
    slug: "structured-data-schema",
    category: "seo",
    title: "Structured data (JSON-LD schema)",
    summary: "Wat is schema, welke types tellen voor blogs, en waarom score je 0/10 zonder.",
    readMinutes: 5,
    body: (
      <Article
        title="Structured data (JSON-LD schema)"
        intro="Structured data is machine-leesbare metadata die je in je page-source plakt. Google gebruikt het om rich snippets, knowledge panels en sitelinks te genereren — en als ranking-hint."
      >
        <h2>Wat is JSON-LD?</h2>
        <p>
          Een <strong>JSON-blok</strong> dat je in je HTML-page zet via{" "}
          <code>&lt;script type="application/ld+json"&gt;</code>. Het is
          onzichtbaar voor lezers maar Google leest het uit. Sinds 2017 is
          JSON-LD het aanbevolen format (eerder: microdata, RDFa).
        </p>

        <Codeblock>{`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "Personeelstekort oplossen met AI",
  "author": {
    "@type": "Person",
    "name": "Julian Dunsbergen"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Artifation"
  },
  "datePublished": "2026-05-19"
}
</script>`}</Codeblock>

        <h2>De relevante schema-types voor blogs</h2>
        <Glossary>
          <GlossaryEntry term="BlogPosting" short="of Article">
            Basis-schema voor elke blogpost. Bevat headline, author, publisher,
            datePublished, image, keywords. <strong>Verplicht</strong> als je
            wil dat Google je posts als blogs herkent (date in SERP, author-card).
          </GlossaryEntry>
          <GlossaryEntry term="BreadcrumbList" short="kruimelpad">
            De navigatie-padaanduiding: Home → Categorie → Post. Maakt dat
            Google een breadcrumb-display geeft in de SERP in plaats van de
            kale URL. Korte winst, hoge zichtbaarheid.
          </GlossaryEntry>
          <GlossaryEntry term="Person" short="auteur">
            Zit als <code>author</code> property genest in BlogPosting. Geeft
            Google de naam, bio, LinkedIn-URL van de schrijver. E-E-A-T-signaal.
          </GlossaryEntry>
          <GlossaryEntry term="Organization" short="publisher">
            Zit als <code>publisher</code> property genest. Bedrijfsnaam +
            logo + URL. Vereist voor sommige rich snippets.
          </GlossaryEntry>
          <GlossaryEntry term="FAQPage" short="optioneel">
            Voor blogs met een FAQ-block: maakt dat Google een uitklap-FAQ in
            de SERP toont. Verlaagt CTR voor concurrenten (de zoeker krijgt
            antwoord zonder te klikken — maar als jij het bent is dat oké).
          </GlossaryEntry>
          <GlossaryEntry term="HowTo" short="tutorials">
            Voor stap-voor-stap tutorials. Vereist afbeeldingen per stap.
            Triggert tutorial-snippet in de SERP.
          </GlossaryEntry>
        </Glossary>

        <h2>In deze tool</h2>
        <p>
          De pipeline bouwt automatisch BlogPosting + BreadcrumbList (met
          genest Person + Organization) voor elke draft. De{" "}
          <strong>built-in CMS render-page</strong> injecteert ze als{" "}
          <code>&lt;script type="application/ld+json"&gt;</code> in de page-head.
        </p>
        <Callout type="success" title="Validatie">
          Test je live pagina via{" "}
          <a href="https://search.google.com/test/rich-results" target="_blank" rel="noreferrer">
            search.google.com/test/rich-results
          </a>
          . Als BlogPosting + BreadcrumbList ✓ tonen, ben je goed.
        </Callout>
      </Article>
    ),
  },

  {
    slug: "featured-snippets",
    category: "seo",
    title: "Featured snippets: positie 0 winnen",
    summary:
      "De antwoord-box bovenaan Google. Vier formats, vier strikte formules om 'm te pakken.",
    readMinutes: 5,
    body: (
      <Article
        title="Featured snippets: positie 0 winnen"
        intro="De featured snippet is de geel-gerande box bovenaan ongeveer 12% van alle informational SERPs in NL. Hij genereert ~2× de CTR van organische positie 1. En je kunt 'm bewust targeten."
      >
        <h2>De vier formats</h2>

        <SpecTable
          caption="Featured-snippet formats + exacte targets"
          rows={[
            {
              label: <>Paragraph <Pill>~70% van snippets</Pill></>,
              value: "40 - 60 wd",
              why: "Direct-answer-blok onder de H2 die de vraag stelt",
            },
            {
              label: <>List (ordered) <Pill>~15%</Pill></>,
              value: "5 - 8 items",
              why: '"5 stappen om X te doen" — gebruik <ol>',
            },
            {
              label: <>List (unordered) <Pill>~10%</Pill></>,
              value: "5 - 10 items",
              why: '"redenen waarom X" — gebruik <ul>',
            },
            {
              label: <>Table <Pill>~5%</Pill></>,
              value: "3 - 8 rijen × 2-3 kol",
              why: '"prijs X vs Y", "kenmerken vergelijken" — gebruik <table>',
            },
          ]}
        />

        <h2>De paragraph-snippet formule</h2>
        <p>
          70% van alle snippets is een paragraph-format. Deze formule wint 'm:
        </p>

        <Compare>
          <ComparePane tone="good" label="Winnt snippet">
            <strong>H2:</strong> Wat is SEO?<br />
            <em>SEO (Search Engine Optimization) is het proces om je website
            zo te optimaliseren dat hij hoger ranked in zoekmachines zoals
            Google. Het bestaat uit drie pijlers: on-page (content + tags),
            off-page (backlinks + autoriteit) en technische SEO (snelheid +
            crawlability).</em><br />
            <span style={{ color: "var(--muted)", fontSize: 11 }}>
              (47 wd ✓ — paragraph format, definitie met opsomming binnen 1 alinea)
            </span>
          </ComparePane>
          <ComparePane tone="bad" label="Mist snippet">
            <strong>H2:</strong> SEO uitgelegd<br />
            <em>SEO is iets waar veel mensen mee bezig zijn omdat het belangrijk
            is voor websites. In dit artikel gaan we kijken wat het precies is
            en waarom je het zou willen doen…</em><br />
            <span style={{ color: "var(--muted)", fontSize: 11 }}>
              (35 wd, maar fluff — Google pakt 't niet als definitie)
            </span>
          </ComparePane>
        </Compare>

        <h2>De vijf snippet-regels</h2>
        <Steps>
          <Step n={1} title="H2 stelt expliciet de vraag">
            "Wat is X?" / "Hoe doe je Y?" / "Waarom Z?". Niet "X uitgelegd".
          </Step>
          <Step n={2} title="Direct onder de H2 begint het antwoord">
            Geen intro-zin, geen "voordat we daar in duiken". Antwoord direct.
          </Step>
          <Step n={3} title="40-60 woorden voor paragraph">
            Onder 40 = te dun. Boven 60 = afgekapt of niet gepakt.
          </Step>
          <Step n={4} title="Definitie-pattern: 'X is …'">
            Bij "wat is"-vragen: begin met "[Keyword] is [korte definitie]."
          </Step>
          <Step n={5} title="Bestaande snippet checken">
            Zoek het keyword. Is er al een snippet? Maak 'm 5-10% beter
            (concreter, recenter, accurater).
          </Step>
        </Steps>

        <Callout type="tip" title="People Also Ask (PAA)">
          Onder de snippet staan vaak 4 PAA-vragen. Beantwoord ze als H3's
          in je eigen post (40-60 wd elk). Dat triggert sub-snippets én
          versterkt topical-coverage.
        </Callout>
      </Article>
    ),
  },

  {
    slug: "aio-llm-citations",
    category: "seo",
    title: "AI Overviews & LLM-citaties winnen",
    summary:
      "Hoe ChatGPT, Google AI Overviews en Perplexity beslissen wíé ze citeren — en hoe je dat naar jouw site stuurt.",
    readMinutes: 6,
    body: (
      <Article
        title="AI Overviews & LLM-citaties winnen"
        intro="Sinds 2024 is een groeiend deel van Google's resultaten een AI Overview (AIO). ChatGPT, Perplexity en Claude verwijzen ook actief naar webbronnen. De factoren die LLM's gebruiken om iemand te citeren overlappen 70% met traditionele SEO — en 30% is nieuw."
      >
        <h2>Wat is er anders aan LLM-SEO?</h2>
        <p>
          Klassieke SEO = "rank op page 1 zodat iemand klikt". LLM-SEO =
          "wees de bron die het AI-antwoord citeert". De click komt soms wel,
          soms niet — maar je merknaam wordt genoemd in een antwoord dat de
          gebruiker leest.
        </p>

        <SpecTable
          caption="Wat LLM's belangrijk vinden bij citatie"
          rows={[
            {
              label: "Direct-answer-blokken",
              value: "40-80 wd",
              why: "Makkelijk samen te vatten en te citeren — LLM-citation-bait",
            },
            {
              label: "Heading-vraag → antwoord-pattern",
              value: "Q&A-structuur",
              why: "Crawler kan 1-op-1 vraag → antwoord chunken",
            },
            {
              label: "Concrete getallen",
              value: "% / € / aantal",
              why: "LLM's citeren liever cijfers dan vage beweringen",
            },
            {
              label: "Named sources",
              value: "min. 2 per post",
              why: "Verhoogt vertrouwen — LLM checkt vaak triangulatie",
            },
            {
              label: "Auteur-attributie",
              value: "Person schema + bio",
              why: "ChatGPT en Perplexity citeren bij voorkeur auteur-name",
            },
            {
              label: "Recente datum",
              value: "<12 mnd voor evergreen, <3 mnd voor news",
              why: "LLM filtert stale content harder dan klassiek Google",
            },
            {
              label: "Schema-rijkheid",
              value: "BlogPosting + Person + ClaimReview",
              why: "Geeft de LLM-crawler structured handles voor extractie",
            },
            {
              label: "Lijst-items met label",
              value: "<li><strong>X:</strong> uitleg</li>",
              why: "Definieerbaar; LLM pakt 'X' als entity",
            },
          ]}
        />

        <h2>llms.txt — de nieuwe robots.txt</h2>
        <p>
          Sinds 2024 hanteren OpenAI, Anthropic en Google een nieuwe standaard:
          een <code>/llms.txt</code>-bestand in je root waarin je expliciet
          maakt welke content LLMs mogen indexeren en hoe de site gestructureerd
          is. Een minimaal voorbeeld:
        </p>

        <Codeblock>{`# Artifation
> AI-implementatie voor het Nederlandse MKB.

## Blog
- [AI voor MKB — 7 toepassingen](/blog/ai-voor-mkb-toepassingen): praktische gids met cases en ROI-berekening
- [Personeelstekort en AI](/blog/personeelstekort-ai): hoe AI de personeelskrapte invult

## Auteur
- Julian Dunsbergen — AI-consultant, 10+ jaar ervaring MKB-implementaties
`}</Codeblock>

        <h2>Schrijf-pattern: definition-first paragraphs</h2>
        <p>
          LLM's chunken artikelen in paragrafen, niet zinnen. Een paragraaf die
          begint met een heldere definitie ("X is …") wordt 5-10× vaker gekozen
          dan een verhalend openings-zin.
        </p>

        <Compare>
          <ComparePane tone="good" label="LLM-vriendelijk">
            "Helpful Content Update is een Google-algoritme-update sinds
            augustus 2022 die content devalueert die 'voor zoekmachines, niet
            voor mensen' is geschreven. Het richt zich primair op schaalbare
            AI-content zonder eigen invalshoek of expertise."
          </ComparePane>
          <ComparePane tone="bad" label="LLM negeert">
            "Het Helpful Content Update-verhaal is best interessant als je er
            even naar kijkt. Veel mensen vroegen zich af waarom Google dit nu
            ineens deed, en eigenlijk zit daar een logisch verhaal achter…"
          </ComparePane>
        </Compare>

        <Callout type="tip" title="De LLM-citation-stack">
          Open een H2 met een vraag, beantwoord 'm in 40-60 wd direct-answer-
          formaat, plak er een concreet getal in, en attribueer naar een
          named source. Die ene paragraaf is dan tegelijk featured-snippet-
          bait, AIO-bait én PAA-bait.
        </Callout>
      </Article>
    ),
  },

  {
    slug: "interne-linkbuilding",
    category: "seo",
    title: "Interne linkbuilding: pillars & clusters",
    summary:
      "Hoe je interne links inzet om topical authority op te bouwen — pillar-cluster model concreet uitgelegd.",
    readMinutes: 5,
    body: (
      <Article
        title="Interne linkbuilding: pillars & clusters"
        intro="Interne links zijn anno 2026 belangrijker dan externe voor de meeste sites. Ze bouwen topical authority, spreiden link equity en helpen Google begrijpen waar jouw site over gaat."
      >
        <h2>Het pillar-cluster model</h2>
        <p>
          Eén dik <strong>pillar-artikel</strong> (3000-5000 wd) over een
          hoofdonderwerp, gelinkt naar 5-10 <strong>cluster-posts</strong>{" "}
          (1500-2500 wd) die elk een sub-onderwerp diep behandelen. Alle
          cluster-posts linken terug naar de pillar.
        </p>

        <HeroNumber
          value="1 pillar + 5-10 clusters"
          label="Per topical-area"
          sub="Geeft Google een duidelijk hub-spoke signaal van expertise"
        />

        <SpecTable
          caption="Link-aantallen per post-type"
          rows={[
            { label: "Pillar → outbound interne", value: "10 - 25", why: "naar elke cluster + naar gerelateerde pillars" },
            { label: "Cluster → naar pillar", value: "1 - 2", why: "bovenaan + onderaan (logische plek)" },
            { label: "Cluster → naar andere clusters", value: "2 - 5", why: "binnen dezelfde topical-area" },
            { label: "Cluster → naar andere pillars", value: "1 - 2", why: "naar gerelateerde hubs voor cross-pollination" },
            { label: "Eerste interne link", value: "< 300 wd", why: "vroeg in tekst = crawler ziet 'm zeker" },
            { label: "Anchor-text exact-match", value: "≤ 30% van interne links", why: "te veel = SpamBrain pattern" },
          ]}
        />

        <h2>De anchor-text mix</h2>
        <Bullet>
          <li><strong>Exact-match</strong> (10-30%) — "AI voor MKB" als de target ook over AI voor MKB gaat</li>
          <li><strong>Partial-match</strong> (30-50%) — "AI-toepassingen in het midden- en kleinbedrijf"</li>
          <li><strong>Branded</strong> (10-20%) — "ons artikel over X" / "onze gids"</li>
          <li><strong>Generic</strong> (5-15%) — "lees hier meer" — vermijd, maar mag mondjesmaat</li>
          <li><strong>Long-form</strong> (10-25%) — "hoe Nederlandse MKB-bedrijven hun productiviteit verhoogden met AI"</li>
        </Bullet>

        <Callout type="warning" title="Wees-pagina's">
          Een pagina zonder inkomende interne links (= "orphan page") wordt
          door Google semi-onzichtbaar behandeld. Check elke 3 maanden je
          sitemap vs Search Console om orphans op te sporen.
        </Callout>

        <h2>Concrete actiestappen</h2>
        <Steps>
          <Step n={1} title="Identificeer je top-3 pillars">
            Voor Artifation bijvoorbeeld: "AI voor MKB", "Personeelskrapte
            oplossen", "Procesautomatisering".
          </Step>
          <Step n={2} title="Schrijf eerst de cluster-posts (5-10)">
            Elk een diep sub-onderwerp. Doe dit eerst — anders heb je niks om
            naar te linken vanuit de pillar.
          </Step>
          <Step n={3} title="Schrijf de pillar last">
            Pillar = de hub die alles bij elkaar bindt. Linkt naar elke cluster.
          </Step>
          <Step n={4} title="Update cluster-posts met links naar pillar">
            2 links per cluster naar pillar: één bovenin als "lees ook onze
            volledige gids X", één in context bij relevante H2.
          </Step>
          <Step n={5} title="Bouw cross-links tussen clusters">
            Elke cluster linkt naar 2-3 verwante clusters in dezelfde area.
          </Step>
        </Steps>
      </Article>
    ),
  },

  {
    slug: "core-web-vitals",
    category: "seo",
    title: "Core Web Vitals — LCP, INP, CLS",
    summary:
      "De drie Google-snelheidsmetrics die direct meetellen voor ranking. Met exacte targets.",
    readMinutes: 5,
    body: (
      <Article
        title="Core Web Vitals — LCP, INP, CLS"
        intro="Sinds 2021 zijn Core Web Vitals (CWV) een directe ranking-factor. In maart 2024 verving INP de oude FID-metric. Onder de 'good'-grenzen blijven is geen luxe; het is een minimum-eis."
      >
        <StatGrid>
          <Stat value="< 2.5s" label="LCP" hint="Largest Contentful Paint" tone="success" />
          <Stat value="< 200ms" label="INP" hint="Interaction to Next Paint" tone="success" />
          <Stat value="< 0.1" label="CLS" hint="Cumulative Layout Shift" tone="success" />
        </StatGrid>

        <h2>De drie metrics uitgelegd</h2>

        <Glossary>
          <GlossaryEntry term="LCP" short="Largest Contentful Paint">
            Tijd tot het grootste content-element zichtbaar is (meestal de
            hero-image of een grote heading).<br /><br />
            <strong>Good:</strong> &lt;2.5s · <strong>Needs improvement:</strong>{" "}
            2.5-4.0s · <strong>Poor:</strong> &gt;4.0s<br />
            <strong>Fix:</strong> hero-image preloaden, WebP gebruiken, CDN
            inzetten, lazy-load alleen op niet-hero images.
          </GlossaryEntry>
          <GlossaryEntry term="INP" short="Interaction to Next Paint, sinds maart 2024">
            Tijd tussen een gebruikersinteractie (klik, tap, key) en de
            volgende paint. Vervangt FID.<br /><br />
            <strong>Good:</strong> &lt;200ms · <strong>Needs improvement:</strong>{" "}
            200-500ms · <strong>Poor:</strong> &gt;500ms<br />
            <strong>Fix:</strong> JavaScript-bundle splitsen, third-party
            scripts uitstellen (async/defer), event-handlers debouncen.
          </GlossaryEntry>
          <GlossaryEntry term="CLS" short="Cumulative Layout Shift">
            Hoeveelheid layout-shift tijdens het laden. Een springende layout
            (image laadt en duwt tekst weg) krijgt een hoge CLS.<br /><br />
            <strong>Good:</strong> &lt;0.1 · <strong>Needs improvement:</strong>{" "}
            0.1-0.25 · <strong>Poor:</strong> &gt;0.25<br />
            <strong>Fix:</strong> width + height op alle &lt;img&gt;,
            font-display: optional, aspect-ratio CSS op embeds.
          </GlossaryEntry>
        </Glossary>

        <h2>Bonus-metrics (geen ranking maar wel UX)</h2>
        <SpecTable
          rows={[
            { label: "TTFB", value: "< 800ms", why: "Time to First Byte — server-responsiveness" },
            { label: "FCP", value: "< 1.8s", why: "First Contentful Paint — eerste pixel geladen" },
            { label: "Total Blocking Time", value: "< 200ms", why: "Tijd dat main-thread geblokkeerd is" },
            { label: "Speed Index", value: "< 3.4s", why: "Hoe snel visuele content gerendered wordt" },
          ]}
        />

        <h2>Tools om te meten</h2>
        <Bullet>
          <li>
            <a href="https://pagespeed.web.dev" target="_blank" rel="noreferrer">
              PageSpeed Insights
            </a>
            {" "}— Google's tool, geeft real-user metrics + lab-data
          </li>
          <li>
            <a
              href="https://search.google.com/search-console/core-web-vitals"
              target="_blank"
              rel="noreferrer"
            >
              Core Web Vitals report in GSC
            </a>
            {" "}— sitebrede health
          </li>
          <li>Chrome DevTools → Lighthouse — lab-test individuele pages</li>
          <li>web.dev/measure — quick check</li>
        </Bullet>

        <Callout type="tip" title="75e percentiel telt">
          Google evalueert CWV op het 75e percentiel van real-user data over
          28 dagen. 75% van je users moet onder de "good"-grenzen vallen.
          Je 50th percentile (mediaan) kan zelfs lager liggen — focus op de
          tail.
        </Callout>
      </Article>
    ),
  },

  {
    slug: "content-refresh",
    category: "seo",
    title: "Content refresh: oude posts updaten",
    summary:
      "Wanneer en hoe je bestaande posts ververst voor een ranking-boost — vaak met grotere ROI dan nieuwe content.",
    readMinutes: 4,
    body: (
      <Article
        title="Content refresh: oude posts updaten"
        intro="Een bestaande post die op positie 12 staat updaten levert vaak meer trafficopname dan een nieuwe post schrijven. Google houdt van freshness, en jij hebt al de history + interne links."
      >
        <h2>Welke posts refreshen?</h2>
        <Checklist>
          <Check title="Posts op positie 4-15 in GSC met >100 impressies/maand">
            "Striking distance" — kleine refresh kan ze op page 1 tillen.
          </Check>
          <Check title="Posts ouder dan 12 maanden over evergreen topics">
            Freshness-signaal updaten zelfs als content nog klopt.
          </Check>
          <Check title="Posts met dalende CTR de afgelopen 3 maanden">
            Meta-title + meta-description herzien.
          </Check>
          <Check title="Posts over keywords waarvan SERP-intent gewijzigd is">
            Vergelijk je content met huidige top-10 — match je nog?
          </Check>
        </Checklist>

        <h2>Wat is "echte" refresh vs cosmetisch?</h2>

        <Compare>
          <ComparePane tone="good" label="Echte refresh">
            <Bullet>
              <li>≥30% van content vervangen of toegevoegd</li>
              <li>Nieuwe stats / cases / cijfers</li>
              <li>1-2 nieuwe H2-secties</li>
              <li>Meta-title & description herschreven</li>
              <li>Datum bovenaan en in schema bijgewerkt</li>
              <li>Internal links naar 1-2 nieuwere posts toegevoegd</li>
            </Bullet>
          </ComparePane>
          <ComparePane tone="bad" label="Cosmetisch (werkt niet)">
            <Bullet>
              <li>Alleen de datum aanpassen ("dateModified bumpen")</li>
              <li>Een paar woorden vervangen ("verbeteren" → "optimaliseren")</li>
              <li>Een nieuwe alinea aan het eind plakken</li>
              <li>Google ziet 't en negeert 't — freshness-signal blijft uit</li>
            </Bullet>
          </ComparePane>
        </Compare>

        <h2>Refresh-cadans per content-type</h2>
        <SpecTable
          rows={[
            { label: "Pillar-pages", value: "elke 6 maanden", why: "Hub — moet altijd up-to-date zijn" },
            { label: "Top 20 trafficposts", value: "elke 9 maanden", why: "Hoogste ROI per uur werk" },
            { label: "Long-tail evergreens", value: "elke 18-24 maanden", why: "Lage onderhouds-prioriteit" },
            { label: "News / time-bound", value: "1× refresh dan rust", why: "Niet evergreen, refresh helpt nauwelijks" },
            { label: "Statistiek-heavy posts", value: "elke 12 maanden", why: "Cijfers verouderen — credibility-risico" },
          ]}
        />

        <Callout type="success" title="Concrete refresh-flow">
          1. Open de Blog-audit feature met de live URL. 2. Bekijk de
          rubric-score + SERP-gap analyse. 3. Klik "Verbeterde versie" voor
          een herschreven concept. 4. Cherry-pick wat klopt. 5. Update
          datePublished + dateModified, niet alleen de laatste. 6. Re-submit
          de URL via Google Search Console (URL-inspection → request indexing).
        </Callout>
      </Article>
    ),
  },

  {
    slug: "rubric-uitgelegd",
    category: "rubric",
    title: "De 8 quality-dimensies uitgelegd",
    summary: "Wat elke score betekent, wat een hoge/lage waarde aangeeft, en hoe te verbeteren.",
    readMinutes: 6,
    body: (
      <Article
        title="De 8 quality-dimensies uitgelegd"
        intro="De Quality Judge scoort elke draft op 8 onafhankelijke dimensies. Deze pagina legt elk uit, met praktische fixes als je laag scoort."
      >
        <p>
          De <strong>gewogen totaalscore</strong> bepaalt of een post wordt
          gepubliceerd. Drempel is ingesteld onder Settings → Kwaliteit &
          cadans (default 8.0). Onder die drempel: status wordt{" "}
          <code>rejected</code>.
        </p>

        <KeyValue
          rows={[
            { k: "semantic_completeness", v: "weight 20%" },
            { k: "originality", v: "weight 25% · hard fail < 6" },
            { k: "anti_ai_cliche", v: "weight 15%" },
            { k: "fact_check", v: "weight 15%" },
            { k: "seo_meta", v: "weight 5%" },
            { k: "seo_schema", v: "weight 5%" },
            { k: "brand_voice", v: "weight 10%" },
            { k: "readability", v: "weight 5%" },
          ]}
        />

        <Glossary>
          <GlossaryEntry term="semantic_completeness" short="weight 20%">
            Beantwoorden de H2-secties hun subvragen volledig? Zijn ze
            self-contained (200-300 wd per chunk)?
            <br/><br/>
            <strong>Verbeter:</strong> elk H2 begint met "wat is X" / "hoe doe
            je Y" / "waarom kies je Z". Antwoord in de eerste 2 zinnen, dan
            uitwerken.
          </GlossaryEntry>
          <GlossaryEntry term="originality" short="weight 25% — hard fail bij <6">
            Eigen invalshoek / casus / contrarian opinion / verzonnen voorbeeld
            uit research's originality_anchor. Pure samenvatting van bestaande
            content scoort laag.
            <br/><br/>
            <strong>Verbeter:</strong> één concreet voorbeeld uit MKB / klant /
            eigen project per post. Een rekenvoorbeeld telt ook (€-bedragen,
            uren).
          </GlossaryEntry>
          <GlossaryEntry term="anti_ai_cliche" short="weight 15%">
            Geen "delve", "leverage", "moreover", "in conclusion", em-dash-spam,
            "in een wereld waar". Gemeten via deterministic banlist-hits per
            1000 woorden.
            <br/><br/>
            <strong>Verbeter:</strong> draai de Audit, kijk welke clichés
            gemarkeerd zijn, vervang ze. De default ban-list is uitgebreid.
          </GlossaryEntry>
          <GlossaryEntry term="fact_check" short="weight 15%">
            Verdict van de Fact Checker agent. 10/10 als alle specifieke
            statistieken/cijfers verifieerbaar zijn via research.key_facts.
            0/10 bij verzonnen cijfers.
            <br/><br/>
            <strong>Verbeter:</strong> de writer mag NOOIT cijfers verzinnen.
            Bij twijfel: vager schrijven ("een groeiend aantal" ipv "47%").
            Als research te weinig opleverde — handmatig topic herstarten.
          </GlossaryEntry>
          <GlossaryEntry term="seo_meta" short="weight 5%">
            Meta-title, meta-description, slug, alt-texts en ≥3 internal links
            present + kwaliteit.
            <br/><br/>
            <strong>Verbeter:</strong> meta-title 50-60 chars met keyword,
            meta-description 140-160 chars met CTA, slug = short kebab-case.
          </GlossaryEntry>
          <GlossaryEntry term="seo_schema" short="weight 5%">
            Aanwezigheid van BlogPosting (of Article) + BreadcrumbList +
            Person JSON-LD schemas in de HTML.
            <br/><br/>
            <strong>Verbeter:</strong> de tool bouwt deze automatisch. Als je
            0/10 ziet: dat was een bug die in PR #11 is opgelost.
          </GlossaryEntry>
          <GlossaryEntry term="brand_voice" short="weight 10%">
            Match met de brand_voice die je in Settings beschreef. Persona,
            toon, energie, woordkeuze.
            <br/><br/>
            <strong>Verbeter:</strong> brand voice in Settings concreter
            beschrijven (specifieke voorbeelden, persona, ban-woorden). Vage
            voice = vage output.
          </GlossaryEntry>
          <GlossaryEntry term="readability" short="weight 5%">
            Flesch NL score (NL leesbaarheidsmetric). Zinslengte-mix,
            paragraaf-mix, jargon-niveau.
            <br/><br/>
            <strong>Verbeter:</strong> gemiddelde zinslengte 12-15 wd. Hooguit
            20% boven 18 wd. Mix 1-zin paragrafen met langere. Vervang jargon
            ("implementeert" → "zet in").
          </GlossaryEntry>
        </Glossary>

        <Callout type="info" title="Berekening">
          Weighted total = 0.20 · semantic + 0.25 · originality + 0.15 ·
          cliché + 0.15 · fact_check + 0.05 · seo_meta + 0.05 · seo_schema +
          0.10 · brand_voice + 0.05 · readability
        </Callout>
      </Article>
    ),
  },

  // ===========================================================================
  // Schrijven — brand voice & schrijftechnieken
  // ===========================================================================
  {
    slug: "brand-voice-schrijven",
    category: "schrijven",
    title: "Brand voice scherper maken",
    summary: "Hoe je voice-veld in Settings je output dramatisch beter maakt.",
    readMinutes: 4,
    body: (
      <Article
        title="Brand voice scherper maken"
        intro="Brand voice is na de outline het sterkste signaal voor de writer. Vage voice = vage output. Concrete voice = posts die voelen alsof jij ze schreef."
      >
        <h2>Wat NIET werkt</h2>
        <Compare>
          <ComparePane tone="bad" label="Te generiek">
            "Professioneel, vriendelijk, betrouwbaar, deskundig."<br /><br />
            <span style={{ color: "var(--muted)", fontSize: 11 }}>
              99% van alle B2B-sites past zich hier op. Geeft de writer geen sturing.
            </span>
          </ComparePane>
          <ComparePane tone="good" label="Concreet bruikbaar">
            "Direct, expert, nuchter. Spreek de lezer aan met <strong>je</strong>.
            Geen marketingjargon. Onderbouw beweringen met concrete getallen of
            cases. Vermijd buzz-words als 'leverage' en 'unlock'. Begin paragraphs
            niet met 'echter' of 'tevens'. Gebruik korte zinnen voor punch."
          </ComparePane>
        </Compare>

        <h2>De vijf elementen van een goede voice</h2>
        <Steps>
          <Step n={1} title="Persona">
            Je / u / wij / ik. Kies één, blijf consistent. "Je" voor MKB +
            informeel, "u" voor juridisch / overheid, "wij" voor B2B-sales.
          </Step>
          <Step n={2} title="Toon">
            Direct / uitleggend / sceptisch / opbeurend. Geef ten minste 2-3
            adjectieven met een korte rationale.
          </Step>
          <Step n={3} title="Energie">
            Kalm vs urgent. Lange zinnen vs korte. Verwijs naar het ritme
            ("kort gevolgd door uitleg-zin").
          </Step>
          <Step n={4} title="Specifieke voorkeuren">
            "Begin niet met definities" / "geen 'tot slot'" / "altijd één
            concreet voorbeeld per H2" — schrijfregels.
          </Step>
          <Step n={5} title="Specifieke vermijdingen">
            Vakjargon dat klant verwart, of dingen die je zat bent. Vul ook de
            <strong> Ban list</strong> in voor harde verboden.
          </Step>
        </Steps>

        <Callout type="tip" title="Auto-fill werkt">
          De onboarding wizard heeft een <em>Vul mijn voice in op basis van mijn
          website</em>-knop. Die scrape't je homepage en stelt een voice voor.
          Goed startpunt, daarna handmatig scherp slijpen.
        </Callout>
      </Article>
    ),
  },

  {
    slug: "heading-hierarchie",
    category: "schrijven",
    title: "Heading-hiërarchie: H1 t/m H4",
    summary: "Hoe je koppen-structuur bouwt voor lezers, Google en featured snippets.",
    readMinutes: 4,
    body: (
      <Article
        title="Heading-hiërarchie: H1 t/m H4"
        intro="Headings zijn het skelet van je post. Verkeerd genest = featured-snippet kans weg + lezer raakt kwijt. Drie regels en je zit goed."
      >
        <h2>De drie regels</h2>
        <Steps>
          <Step n={1} title="Eén H1 per pagina">
            Bevat primary keyword, niet identiek aan meta-title (verschillende
            wording = je dekt 2 query-varianten).
          </Step>
          <Step n={2} title="Nooit niveau overslaan">
            H1 → H2 → H3 → H4. Geen H1 → H3, geen H2 → H4. Crawler raakt
            verward, screen-readers ook.
          </Step>
          <Step n={3} title="Heading-tekst staat in de TOC">
            Schrijf headings zoals ze in een inhoudsopgave staan: zelfstandig
            leesbaar, geen "in deze sectie kijken we naar…".
          </Step>
        </Steps>

        <h2>Heading-aantallen per post-type</h2>
        <SpecTable
          rows={[
            { label: "Long-form informational (1500-2500 wd)", value: "1 H1 · 5-10 H2 · 0-4 H3/H2", why: "Standaard scanning + featured-snippet bait" },
            { label: "Pillar (3000-5000 wd)", value: "1 H1 · 10-15 H2 · 2-4 H3/H2", why: "Mini-hoofdstuk per H2 — uitgebreid" },
            { label: "Commercial / comparison", value: "1 H1 · 4-7 H2 · 0-2 H3", why: "Compact, snel tot beslissing" },
            { label: "How-to / tutorial", value: "1 H1 · 5-10 H2 · 1-3 H3", why: "Eén H2 per stap + sub-stappen als H3" },
            { label: "News / update", value: "1 H1 · 2-4 H2", why: "Bondig — geen diepe nesting" },
          ]}
        />

        <h2>Headings als featured-snippet wapen</h2>
        <p>
          Headings die expliciet een vraag stellen ("Wat is X?", "Hoe doe je Y?")
          en direct onder de heading een 40-60 wd antwoord geven winnen
          featured snippets. Maak van elke H2 een vraag → antwoord-pattern.
        </p>

        <Compare>
          <ComparePane tone="good" label="Wint snippet">
            <strong>H2:</strong> Wat kost een SEO-audit?<br />
            <em>Een SEO-audit kost in Nederland tussen €750 en €4.500,
            afhankelijk van site-grootte en scope. Een basis-audit voor een
            site met &lt;100 pages duurt 2-3 dagen werk; een diepe technische
            audit met content-recommendations 5-10 dagen.</em>
          </ComparePane>
          <ComparePane tone="bad" label="Mist snippet">
            <strong>H2:</strong> SEO-audit kosten<br />
            <em>De kosten van een SEO-audit zijn een onderwerp dat
            ondernemers vaak verwart. Laten we eens kijken naar wat erbij
            komt kijken en welke factoren een rol spelen…</em>
          </ComparePane>
        </Compare>

        <Callout type="warning" title="Skip nooit H2 → H4">
          Een veelgemaakte fout: een H4 gebruiken voor visuele variatie
          ("kleiner kopje") zonder dat er een H3 boven staat. Dit doorbreekt
          de hiërarchie en kost je toegankelijkheid-score (WCAG) én
          snippet-kansen.
        </Callout>
      </Article>
    ),
  },

  {
    slug: "meta-tags-schrijven",
    category: "schrijven",
    title: "Meta-title en meta-description schrijven",
    summary:
      "De #1 plek waar SEO en copywriting samenkomen. Formules + voorbeelden voor 60-character titles en CTR-vriendelijke descriptions.",
    readMinutes: 5,
    body: (
      <Article
        title="Meta-title en meta-description schrijven"
        intro="De meta-title bepaalt grotendeels of je rankt; de meta-description bepaalt grotendeels of er geklikt wordt. Twee tags, twee verschillende doelen, twee verschillende formules."
      >
        <h2>Meta-title — de formule</h2>

        <SpecTable
          rows={[
            { label: "Lengte", value: "50 - 60 chars", why: "Boven 60 chars cut-off (~600px desktop)" },
            { label: "Primary keyword", value: "in eerste 30 chars", why: "Linker-positie = sterkere ranking-weighting" },
            { label: "Modifier", value: "1 power-woord", why: "'gids', 'checklist', '7', 'in 2026', 'voorbeelden'" },
            { label: "Brand", value: "optioneel achteraan", why: "' | Artifation' = ~12 chars — overweeg" },
            { label: "Uniek vs site", value: "100%", why: "Duplicates → Google kiest zelf, vaak verkeerd" },
            { label: "Patroon", value: "[Keyword]: [voordeel/modifier]", why: "Klassiek en bewezen" },
          ]}
        />

        <Compare>
          <ComparePane tone="good" label="Goed (~58 chars)">
            <strong>AI voor MKB: 7 toepassingen die direct geld besparen</strong>
            <br /><br />
            <span style={{ color: "var(--muted)", fontSize: 11 }}>
              Keyword vooraan • getal als modifier • voordeel in tweede helft
            </span>
          </ComparePane>
          <ComparePane tone="bad" label="Slecht (88 chars, vague)">
            Alles over kunstmatige intelligentie en hoe je dat als ondernemer kunt gebruiken
            <br /><br />
            <span style={{ color: "var(--muted)", fontSize: 11 }}>
              Te lang • keyword in midden • geen modifier • klinkt als clickbait
            </span>
          </ComparePane>
        </Compare>

        <h2>Meta-description — de formule</h2>

        <SpecTable
          rows={[
            { label: "Lengte", value: "140 - 160 chars", why: "Boven 158 cut-off in desktop SERP (mobile soms 120)" },
            { label: "Structuur", value: "claim + bewijs + CTA", why: "3 zinnen of 1 lange zin met komma's" },
            { label: "Primary keyword", value: "≥1 keer", why: "Bold-weergave in SERP = visueel signaal" },
            { label: "CTA-woord", value: "1 actie", why: "'Ontdek', 'Lees', 'Bereken', 'Vergelijk'" },
            { label: "Lege description", value: "vermijd", why: "Google schrijft 'm anders zelf — kwaliteit varieert" },
          ]}
        />

        <Compare>
          <ComparePane tone="good" label="Goed (~152 chars)">
            <em>Ontdek welke AI-tools nu al renderen voor Nederlandse
            MKB-bedrijven. 7 concrete cases met prijzen, terugverdientijd
            en implementatie-tijd.</em>
          </ComparePane>
          <ComparePane tone="bad" label="Slecht">
            <em>Welkom op onze website. Lees ons artikel over AI.</em>
            <br /><br />
            <span style={{ color: "var(--muted)", fontSize: 11 }}>
              25 chars • geen specifics • geen CTA • Google schrijft zelf opnieuw
            </span>
          </ComparePane>
        </Compare>

        <h2>Power-woorden die werken</h2>
        <Bullet>
          <li><strong>Concreet:</strong> "checklist", "voorbeelden", "stappenplan", "template"</li>
          <li><strong>Getal:</strong> "7", "12", "in 5 min", "in 2026"</li>
          <li><strong>Voordeel:</strong> "die direct werken", "zonder gedoe", "voor MKB"</li>
          <li><strong>Schaarste:</strong> "anno 2026", "nieuw", "geüpdated"</li>
        </Bullet>

        <Callout type="warning" title="Wat je NIET moet doen">
          Geen all-caps. Geen 5+ emoji's. Geen "BESTE!!" met uitroeptekens.
          Geen vage zinnen als "lees alles wat je moet weten". Google's
          rewriter pakt 't dan over en jij verliest controle.
        </Callout>
      </Article>
    ),
  },

  {
    slug: "anti-ai-cliches",
    category: "schrijven",
    title: "AI-clichés die je content om zeep helpen",
    summary: "Specifieke woorden waar Google's helpful-content classifier op pikt.",
    readMinutes: 3,
    body: (
      <Article
        title="AI-clichés die je content om zeep helpen"
        intro="Sinds maart 2024 devalueert Google content die té duidelijk AI-geschreven is. Een handvol woorden zijn zo'n bekende tell dat je het hard moet vermijden."
      >
        <h2>Worden hard gevlagd</h2>
        <Bullet>
          <li><code>delve into</code> — "diep duiken in". GPT-tic.</li>
          <li><code>leverage</code> — "gebruiken" werkt prima.</li>
          <li><code>moreover</code>, <code>furthermore</code>, <code>additionally</code> — formal-AI-talk.</li>
          <li><code>navigate the complexities</code> — niemand zegt dit.</li>
          <li><code>in conclusion</code>, <code>to sum up</code>, <code>tot slot</code>, <code>samenvattend</code> — eindpassage-clichés.</li>
          <li><code>in een wereld waar</code> — opening die direct AI verraadt.</li>
          <li><code>in de steeds veranderende wereld van</code> — idem.</li>
          <li><code>harness the power of</code> — buzz.</li>
          <li><code>notably</code>, <code>it's worth noting</code> — fluff.</li>
        </Bullet>

        <h2>Em-dash gebruik</h2>
        <p>
          GPT-modellen gebruiken em-dashes (<code>—</code>) overmatig. Default
          regel: <strong>max 3 per 1000 woorden</strong>. Vervang door komma's,
          dubbele punten of een nieuwe zin.
        </p>

        <Callout type="warning" title="Generieke openings">
          "Heb je je ooit afgevraagd waarom..." / "Stel je voor dat..." / "Het
          is geen geheim dat..." — allemaal AI-openings die geen lezer ooit
          schrijft. Open met een concrete claim of getal.
        </Callout>

        <p>
          Deze clichés zitten standaard in de tool's ban-list — de writer
          krijgt ze als verboden. Voeg in Settings → Brand voice → Ban list je
          eigen branche-specifieke clichés toe (vakjargon-clichés zijn bij
          elke industrie anders).
        </p>
      </Article>
    ),
  },

  // ===========================================================================
  // DATA — GSC + DataForSEO
  // ===========================================================================
  {
    slug: "gsc-vs-dataforseo",
    category: "data",
    title: "GSC vs DataForSEO — welke wanneer",
    summary: "Twee datakanalen die verschillende dingen meten. Beide aanvullend.",
    readMinutes: 4,
    body: (
      <Article
        title="GSC vs DataForSEO — welke wanneer"
        intro="Google Search Console (gratis) en DataForSEO (betaald) meten verschillende kanten van SEO. Geen vervangingen voor elkaar — combineer ze."
      >
        <h2>Wat ze meten</h2>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", margin: "12px 0" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: 8 }}></th>
              <th style={{ textAlign: "left", padding: 8 }}>GSC</th>
              <th style={{ textAlign: "left", padding: 8 }}>DataForSEO</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: 8, fontWeight: 600 }}>Meet</td>
              <td style={{ padding: 8 }}>Wat jouw site doet in Google</td>
              <td style={{ padding: 8 }}>Wat de hele markt doet</td>
            </tr>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: 8, fontWeight: 600 }}>Kosten</td>
              <td style={{ padding: 8 }}>Gratis</td>
              <td style={{ padding: 8 }}>~$0.0075 per keyword call</td>
            </tr>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: 8, fontWeight: 600 }}>Werkt zonder traffic?</td>
              <td style={{ padding: 8 }}>Nee — cold start probleem</td>
              <td style={{ padding: 8 }}>Ja</td>
            </tr>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: 8, fontWeight: 600 }}>Sterk punt</td>
              <td style={{ padding: 8 }}>Echte clicks + impressies + positie</td>
              <td style={{ padding: 8 }}>Volume + difficulty + CPC per keyword</td>
            </tr>
          </tbody>
        </table>

        <h2>Wanneer welke</h2>
        <Bullet>
          <li><strong>Nieuwe site</strong> → DataForSEO (GSC heeft nog niks)</li>
          <li><strong>Site met traffic</strong> → GSC primair voor optimaliseren bestaande posts</li>
          <li><strong>Striking-distance optimaliseren</strong> → GSC ziet posities 8-20 met impressies; DFS ziet niet welke pages je hebt</li>
          <li><strong>Markt-volume validatie</strong> → DataForSEO ("is dit een echt keyword of 5 zoekopdrachten/maand?")</li>
          <li><strong>Difficulty check</strong> → DataForSEO ("kan ik hier überhaupt voor ranken?")</li>
          <li><strong>Content gap</strong> → beide: GSC voor onderwerpen waar je voor verschijnt zonder dat je een artikel hebt, DFS voor SERP-vergelijking</li>
        </Bullet>

        <Callout type="tip" title="Beide aanzetten = beste setup">
          De Suggest topics + Blog audit features gebruiken beide databronnen
          als ze ingesteld zijn. Je krijgt dan striking-distance signalen (GSC)
          plus SERP-gap analyse + keyword ideas met echte volumes (DFS).
        </Callout>
      </Article>
    ),
  },

  {
    slug: "keyword-research-praktisch",
    category: "data",
    title: "Keyword research praktisch",
    summary:
      "Hoe je in 30 minuten een lijst van 20 ranking-bare keywords vindt voor je site.",
    readMinutes: 5,
    body: (
      <Article
        title="Keyword research praktisch"
        intro="Keyword research voor blogs hoeft niet ingewikkeld te zijn. Hier is de 30-minuten flow die de meeste hand-getunede SEO-agencies ook gebruiken."
      >
        <h2>De drie filters die elk keyword moet doorstaan</h2>
        <SpecTable
          rows={[
            { label: "Volume", value: "100 - 5000 / maand (NL)", why: "Onder 100 = niet de moeite waard; boven 5000 = te competitief voor MKB" },
            { label: "Difficulty (DFS-score 0-100)", value: "≤ 40", why: "Boven 40 = top-10 domineerd door DR70+ sites" },
            { label: "Intent-match met je business", value: "informational / commercial", why: "Transactional alleen voor product/category pages — niet blog" },
            { label: "Niet al gerankt", value: "geen positie 1-5 op je site", why: "Anders cannibalization — bestaande post optimaliseren ipv nieuwe" },
            { label: "SERP-realistic", value: "geen brand-bias", why: "Als top-10 alleen Wikipedia+Wikipedia.nl is — vermijden" },
          ]}
        />

        <h2>De 30-minuten flow</h2>
        <Steps>
          <Step n={1} title="Seed lijst (5 min)">
            Schrijf 5-10 hoofd-thema's op die je business raakt. Voor
            Artifation bv: "AI MKB", "personeelstekort", "AI-implementatie".
          </Step>
          <Step n={2} title="Expand via DataForSEO Keyword Ideas (10 min)">
            Plak elk seed in de Suggest topics flow. Krijg per seed 30-100
            gerelateerde keywords met volume + difficulty.
          </Step>
          <Step n={3} title="Filter op de 3 criteria (5 min)">
            Sorteer op volume × (100 - difficulty). Houd top-30 over.
          </Step>
          <Step n={4} title="Check striking-distance in GSC (5 min)">
            Open GSC → Performance → filter op queries met positie 8-20.
            Mark ze als "high-priority refresh" ipv nieuwe content.
          </Step>
          <Step n={5} title="SERP-check de finale lijst (5 min)">
            Open je top-10 keywords in incognito. Check welke type pagina's
            ranken. Match je content-type? Anders schrappen.
          </Step>
        </Steps>

        <Callout type="tip" title="In deze tool">
          De <strong>Suggest topics</strong>-flow doet stap 1-4 automatisch.
          Je voert je pillar in, hij combineert GSC striking-distance + DFS
          keyword ideas + cannibalization-check + serp-realistic-filter en
          geeft je 10-20 voorgestelde topics terug. Stap 5 (SERP-check)
          blijft handwerk voor de borderline cases.
        </Callout>
      </Article>
    ),
  },

  // ===========================================================================
  // GLOSSARY (uitgebreid)
  // ===========================================================================
  {
    slug: "glossary",
    category: "termen",
    title: "Termen-glossary",
    summary: "Alle SEO + tool-vakjargon op één pagina, kort uitgelegd.",
    readMinutes: 7,
    body: (
      <Article
        title="Termen-glossary"
        intro="Alle vakjargon dat je tegenkomt in deze tool of bij SEO in het algemeen, kort uitgelegd. Linkt naar dieper-uitleggende artikelen waar relevant."
      >
        <Glossary>
          <GlossaryEntry term="AIO" short="AI Overview">
            Google's AI-gegenereerd antwoord-blok bovenaan steeds meer SERPs
            sinds 2024. Citeert 3-5 bronnen. Wint citaties = 40-60w
            direct-answer-blokken, named sources, BlogPosting schema.
          </GlossaryEntry>
          <GlossaryEntry term="Anchor text">
            De zichtbare tekst van een link. Goede anchors zijn beschrijvend
            ("AI-implementatie voor MKB") en passen bij de target-page. Vermijd
            "klik hier" (geen context voor Google).
          </GlossaryEntry>
          <GlossaryEntry term="Backlink">
            Een link van een andere site naar jouw site. Beste-kwaliteit
            backlinks komen van authoritative domains in jouw vakgebied.
            Belangrijke ranking-factor.
          </GlossaryEntry>
          <GlossaryEntry term="BlogPosting schema">
            JSON-LD structured-data-type voor blogposts. Bevat headline,
            author, datePublished, image, keywords. Geeft Google de "blog"-context.
          </GlossaryEntry>
          <GlossaryEntry term="BreadcrumbList schema">
            JSON-LD voor het kruimelpad (Home → Categorie → Post). Maakt dat
            Google in de SERP een breadcrumb toont in plaats van een kale URL.
          </GlossaryEntry>
          <GlossaryEntry term="Canonical URL">
            De "officiële" URL van een pagina, gemarkeerd met{" "}
            <code>&lt;link rel="canonical"&gt;</code>. Voorkomt duplicate-content
            problemen als dezelfde pagina via meerdere URL's bereikbaar is.
          </GlossaryEntry>
          <GlossaryEntry term="CLS" short="Cumulative Layout Shift">
            Core Web Vitals-metric. Score &lt;0.1 = "good". Meet of de layout
            tijdens het laden niet verspringt. Fix: width+height op img-tags,
            font-display: optional.
          </GlossaryEntry>
          <GlossaryEntry term="Content gap">
            Een onderwerp / keyword waar concurrenten of jouw eigen GSC-data
            laten zien dat er vraag is, maar waar jouw site geen artikel over
            heeft. De Suggest topics flow detecteert deze automatisch.
          </GlossaryEntry>
          <GlossaryEntry term="Core Web Vitals" short="CWV">
            Set van 3 Google-snelheidsmetrics: LCP (&lt;2.5s), INP (&lt;200ms),
            CLS (&lt;0.1). Sinds 2021 een directe ranking-factor.
          </GlossaryEntry>
          <GlossaryEntry term="Crawler">
            Een bot die websites doorloopt. Googlebot is het bekendst.
            Crawl-budget is hoeveel tijd Google aan jouw site besteedt — dunne
            content kan dit verspillen.
          </GlossaryEntry>
          <GlossaryEntry term="CPC" short="Cost-Per-Click">
            Wat adverteerders betalen voor een klik via Google Ads. Indicator
            van commerciële waarde — hoge CPC = high-intent commerciële keyword.
          </GlossaryEntry>
          <GlossaryEntry term="CTR" short="Click-Through Rate">
            Percentage gebruikers dat klikt op jouw resultaat in de SERP.
            Beïnvloed door meta-title + meta-description. Hoge CTR = positie-boost.
          </GlossaryEntry>
          <GlossaryEntry term="dateModified">
            JSON-LD property die aangeeft wanneer de post laatst bewerkt is.
            Verse modified-date = freshness-signaal. Update bij elke content-refresh.
          </GlossaryEntry>
          <GlossaryEntry term="E-E-A-T">
            Experience, Expertise, Authoritativeness, Trust. Google's framework
            om vakkundige content te onderscheiden van pulp. Zie het{" "}
            <em>E-E-A-T</em>-artikel.
          </GlossaryEntry>
          <GlossaryEntry term="Featured snippet">
            Het "antwoord-box" bovenaan sommige Google-resultaten. Wint posten
            die direct + bondig antwoord geven op de query. Schrijf een 40-60
            woord direct-answer-blok bovenaan je post.
          </GlossaryEntry>
          <GlossaryEntry term="Flesch NL">
            Nederlandse leesbaarheidsmetric (Flesch-Douma). Score 0-100, hoger
            = makkelijker. Target voor blogs: 55-75. Onder 55 = te complex,
            boven 80 = simpel maar mogelijk te oppervlakkig.
          </GlossaryEntry>
          <GlossaryEntry term="GSC" short="Google Search Console">
            Gratis Google-tool die laat zien hoe jouw site presteert in de
            zoekresultaten: queries, impressies, clicks, positie. Vereist
            domain-verificatie. Zie het <em>GSC vs DataForSEO</em>-artikel.
          </GlossaryEntry>
          <GlossaryEntry term="Hard fail">
            Een rubric-criterium dat zo fundamenteel is dat de post direct wordt
            afgekeurd ongeacht andere scores. Voorbeelden: originality &lt; 6,
            fact_check fail, banlist-hits &gt; 3 per 1000 wd.
          </GlossaryEntry>
          <GlossaryEntry term="Helpful Content Update">
            Google-algoritme-update sinds 2022 die "schaalbare AI-content
            zonder eigen invalshoek" actief devalueert. Drijvende kracht achter
            de originality-eis in deze tool.
          </GlossaryEntry>
          <GlossaryEntry term="INP" short="Interaction to Next Paint">
            Core Web Vitals-metric (sinds maart 2024, vervangt FID). Tijd
            tussen interactie en next paint. &lt;200ms = "good".
          </GlossaryEntry>
          <GlossaryEntry term="Internal link">
            Een link van de ene pagina op jouw site naar een andere pagina op
            jouw site. Bouwt topical authority en spreidt link-equity. Elke
            post in deze tool krijgt minimaal 3 internal links.
          </GlossaryEntry>
          <GlossaryEntry term="Intent (search intent)">
            Wat de zoeker eigenlijk wil: uitleg (informational), vergelijken
            (commercial), kopen (transactional). Mismatch met je content =
            geen ranking. Zie het <em>Search intent</em>-artikel.
          </GlossaryEntry>
          <GlossaryEntry term="JSON-LD">
            Het JavaScript Object Notation for Linked Data-formaat. De
            standaard manier om structured data in je page-source te zetten.
            Vervangt het oudere microdata-format.
          </GlossaryEntry>
          <GlossaryEntry term="Keyword density">
            Percentage van de tekst dat het focus-keyword bevat. Sweet spot
            0.5-1.5%. Boven 3% = stuffing-risico.
          </GlossaryEntry>
          <GlossaryEntry term="Keyword difficulty">
            Een schatting (0-100) van hoe moeilijk het is om voor een keyword
            te ranken. Hoger = meer authoritative concurrentie. DataForSEO en
            tools als Ahrefs leveren deze metric.
          </GlossaryEntry>
          <GlossaryEntry term="LCP" short="Largest Contentful Paint">
            Core Web Vitals-metric. Tijd tot het grootste element zichtbaar is.
            &lt;2.5s = "good". Fix: hero-image preloaden, WebP, CDN.
          </GlossaryEntry>
          <GlossaryEntry term="llms.txt">
            Sinds 2024: een /llms.txt-bestand in je website-root waarin je
            expliciet maakt welke content LLMs mogen indexeren. Nieuwe
            standaard zoals robots.txt voor crawlers.
          </GlossaryEntry>
          <GlossaryEntry term="Long-tail keyword">
            Een specifieke, vaak langere zoekterm met laag volume maar hoge
            intent ("ai voor advocatenkantoren mkb" vs "ai"). Makkelijker te
            ranken en converteert beter.
          </GlossaryEntry>
          <GlossaryEntry term="Meta description">
            De korte beschrijving die in de SERP onder je titel verschijnt.
            140-160 chars. Beïnvloedt CTR maar niet directe ranking.
          </GlossaryEntry>
          <GlossaryEntry term="Meta title">
            De titel die in de SERP toont. 50-60 chars. Belangrijkste meta-tag
            voor zowel ranking als CTR.
          </GlossaryEntry>
          <GlossaryEntry term="Open Graph" short="OG-tags">
            Meta-tags die bepalen hoe je page eruit ziet als-ie gedeeld wordt
            op social (Facebook, LinkedIn, X). og:title, og:description,
            og:image (1200×630 ideaal).
          </GlossaryEntry>
          <GlossaryEntry term="Originality anchor">
            Een concrete casus of voorbeeld dat de Researcher verzint of vindt,
            en die de Writer verplicht inline citeert. Verhindert generieke
            samenvattings-content.
          </GlossaryEntry>
          <GlossaryEntry term="Orphan page">
            Een pagina zonder inkomende interne links. Google ziet 'm via de
            sitemap maar behandelt 'm semi-onzichtbaar — geen cluster-signaal.
          </GlossaryEntry>
          <GlossaryEntry term="PAA" short="People Also Ask">
            De gerelateerde-vragen-accordeon onder featured snippets in de
            SERP. Beantwoord ze als H3 of FAQ in je post voor sub-snippet kans.
          </GlossaryEntry>
          <GlossaryEntry term="Person schema">
            JSON-LD type voor de auteur. Naast naam ook bio, LinkedIn-URL en
            knowsAbout-array (expertise-onderwerpen). Sterk E-E-A-T-signaal.
          </GlossaryEntry>
          <GlossaryEntry term="Pillar">
            Een hoofd-thema van je content. "AI voor MKB" zou een pillar zijn;
            individuele posts vallen onder pillars. Topic-suggester gebruikt
            pillars als seed.
          </GlossaryEntry>
          <GlossaryEntry term="Rich snippet">
            Een verrijkt zoekresultaat in de SERP — bv. een ster-rating, FAQ-
            uitklap, breadcrumb. Vereist correcte structured data.
          </GlossaryEntry>
          <GlossaryEntry term="Rubric">
            De scoring-matrix die de Quality Judge gebruikt: 8 dimensies, elk
            0-10, gewogen samengevoegd tot een totaalscore.
          </GlossaryEntry>
          <GlossaryEntry term="SERP" short="Search Engine Results Page">
            De pagina met zoekresultaten in Google. "Top-10 SERP" = de eerste
            10 organische resultaten.
          </GlossaryEntry>
          <GlossaryEntry term="Slug">
            Het deel van de URL na het domein dat een post identificeert.
            Korte kebab-case versie van de titel ("ai-voor-mkb" voor "AI voor
            MKB: alles wat je moet weten").
          </GlossaryEntry>
          <GlossaryEntry term="SpamBrain">
            Google's AI-systeem voor het detecteren van spam-patterns
            (link-schemes, exact-match-anchor-spam, doorway pages). Versie 3.0
            actief sinds 2024.
          </GlossaryEntry>
          <GlossaryEntry term="Striking distance">
            Queries waar je op positie 8-20 staat met decent impressies.
            "Bijna page 1" — kleine content-update kan ze omhoog tillen. GSC
            laat dit direct zien.
          </GlossaryEntry>
          <GlossaryEntry term="Structured data">
            Verzamelnaam voor JSON-LD, microdata of RDFa. Geeft pages
            machine-leesbare metadata. JSON-LD is anno 2026 de standaard.
          </GlossaryEntry>
          <GlossaryEntry term="TL;DR">
            "Too long; didn't read" — een korte samenvatting bovenaan een blog.
            De tool genereert drie lagen: one-liner (hook), 40-60w direct
            answer (AIO-citeerbaar), 134w summary.
          </GlossaryEntry>
          <GlossaryEntry term="TTFB" short="Time to First Byte">
            Tijd tussen request en eerste byte van het antwoord van de server.
            Indicator van server-snelheid. Target: &lt;800ms.
          </GlossaryEntry>
          <GlossaryEntry term="WebP">
            Image-formaat van Google. 30-50% kleiner dan JPG bij gelijke
            kwaliteit. Anno 2026 supported in alle moderne browsers — geen
            fallback nodig.
          </GlossaryEntry>
        </Glossary>
      </Article>
    ),
  },
];

export const ARTICLE_BY_SLUG: Record<string, WikiArticle> = Object.fromEntries(
  ARTICLES.map((a) => [a.slug, a])
);

export function articlesByCategory(): Record<WikiCategory, WikiArticle[]> {
  const out: Record<WikiCategory, WikiArticle[]> = {
    starten: [],
    blueprint: [],
    seo: [],
    rubric: [],
    schrijven: [],
    data: [],
    termen: [],
  };
  for (const a of ARTICLES) out[a.category].push(a);
  return out;
}
