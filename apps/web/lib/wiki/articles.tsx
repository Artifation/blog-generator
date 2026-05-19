/**
 * Wiki article registry. Each article is a JSX component so we can use
 * Callouts, Steps, code-blocks etc. without parsing markdown at runtime.
 * The categories drive the sidebar grouping.
 */
import * as React from "react";
import { Article, Callout, Bullet, Steps, Step, Codeblock, Definition, Glossary, GlossaryEntry } from "./ui";

export type WikiCategory = "starten" | "seo" | "rubric" | "schrijven" | "data" | "termen";

export interface WikiArticleMeta {
  slug: string;
  title: string;
  category: WikiCategory;
  summary: string;
  readMinutes: number;
}

export interface WikiArticle extends WikiArticleMeta {
  body: React.ReactNode;
}

export const CATEGORY_LABEL: Record<WikiCategory, string> = {
  starten: "Aan de slag",
  seo: "SEO basics",
  rubric: "Kwaliteits-rubric",
  schrijven: "Brand voice & schrijven",
  data: "GSC & DataForSEO",
  termen: "Termen-glossary",
};

export const CATEGORY_ORDER: WikiCategory[] = ["starten", "seo", "rubric", "schrijven", "data", "termen"];

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

        <div style={{ background: "var(--surface-2)", padding: 14, borderRadius: 8, margin: "12px 0" }}>
          <strong>Informational</strong> — "wat is X", "hoe werkt Y", "waarom doen mensen Z".<br/>
          <em>Wat de zoeker wil:</em> uitleg, achtergrond, context.<br/>
          <em>Content-type:</em> long-form gids (1500-2500 wd), met definities en voorbeelden.<br/>
          <em>CTA:</em> zacht — "lees ook", "praat met ons" — maar geen kopen.
        </div>
        <div style={{ background: "var(--surface-2)", padding: 14, borderRadius: 8, margin: "12px 0" }}>
          <strong>Commercial</strong> — "X vs Y", "beste X voor MKB", "alternatieven voor Z".<br/>
          <em>Wat de zoeker wil:</em> vergelijken, keuze maken.<br/>
          <em>Content-type:</em> middelmaat (750-1500 wd), vergelijkingstabel, pros/cons.<br/>
          <em>CTA:</em> medium — "probeer X", "boek demo", "krijg offerte".
        </div>
        <div style={{ background: "var(--surface-2)", padding: 14, borderRadius: 8, margin: "12px 0" }}>
          <strong>Transactional</strong> — "X kopen", "Y prijzen", "Z aanmelden".<br/>
          <em>Wat de zoeker wil:</em> direct converteren.<br/>
          <em>Content-type:</em> kort (500-1000 wd), prijzen + form bovenaan.<br/>
          <em>CTA:</em> hard — kopen-knop / contact-form prominent.
        </div>

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
        <Bullet>
          <li><strong>Author-bio</strong> onder elke post met LinkedIn-link. Standaard in deze tool.</li>
          <li><strong>Named sources</strong> in lopende tekst ("volgens RVO-data 2025") in plaats van anonieme links</li>
          <li><strong>Eigen casussen</strong> — origineel-anker in elke post</li>
          <li><strong>JSON-LD Person + Organization schema</strong> — zegt expliciet wie achter de site zit</li>
          <li><strong>KvK + BTW</strong> in de footer (Nederlands trust-signaal)</li>
        </Bullet>

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

        <Glossary>
          <GlossaryEntry term="semantic_completeness" short="weight 20%">
            Beantwoorden de H2-secties hun subvragen volledig? Zijn ze
            self-contained (200-300 wd per chunk)?
            <br/><br/>
            <strong>Verbeter:</strong> elk H2 begint met "wat is X" / "hoe doe
            je Y" / "waarom kies je Z". Antwoord in de eerste 2 zinnen, dan
            uitwerken.
          </GlossaryEntry>
          <GlossaryEntry term="originality" short="weight 25% — hard fail bij &lt;6">
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
        <div style={{ padding: 12, background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6, margin: "10px 0", fontSize: 13 }}>
          "Professioneel, vriendelijk, betrouwbaar, deskundig."
          <br/>
          <span style={{ color: "var(--muted)" }}>
            → 99% van alle B2B-sites past zich hier op. Geeft de writer geen sturing.
          </span>
        </div>

        <h2>Wat WEL werkt</h2>
        <div style={{ padding: 12, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 6, margin: "10px 0", fontSize: 13 }}>
          "Direct, expert, nuchter. Spreek de lezer aan met <strong>je</strong>.
          Geen marketingjargon. Onderbouw beweringen met concrete getallen of
          cases. Vermijd buzz-words als 'leverage' en 'unlock'. Begin paragraphs
          niet met 'echter' of 'tevens'. Gebruik korte zinnen voor punch."
          <br/>
          <span style={{ color: "var(--muted)" }}>
            → Concreet, doet de writer iets met.
          </span>
        </div>

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

  {
    slug: "glossary",
    category: "termen",
    title: "Termen-glossary",
    summary: "Alle SEO + tool-vakjargon op één pagina, kort uitgelegd.",
    readMinutes: 5,
    body: (
      <Article
        title="Termen-glossary"
        intro="Alle vakjargon dat je tegenkomt in deze tool of bij SEO in het algemeen, kort uitgelegd. Linkt naar dieper-uitleggende artikelen waar relevant."
      >
        <Glossary>
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
          <GlossaryEntry term="Content gap">
            Een onderwerp / keyword waar concurrenten of jouw eigen GSC-data
            laten zien dat er vraag is, maar waar jouw site geen artikel over
            heeft. De Suggest topics flow detecteert deze automatisch.
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
            0.5-2%. Boven 3% = stuffing-risico.
          </GlossaryEntry>
          <GlossaryEntry term="Keyword difficulty">
            Een schatting (0-100) van hoe moeilijk het is om voor een keyword
            te ranken. Hoger = meer authoritative concurrentie. DataForSEO en
            tools als Ahrefs leveren deze metric.
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
          <GlossaryEntry term="Originality anchor">
            Een concrete casus of voorbeeld dat de Researcher verzint of vindt,
            en die de Writer verplicht inline citeert. Verhindert generieke
            samenvattings-content.
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
    seo: [],
    rubric: [],
    schrijven: [],
    data: [],
    termen: [],
  };
  for (const a of ARTICLES) out[a.category].push(a);
  return out;
}
