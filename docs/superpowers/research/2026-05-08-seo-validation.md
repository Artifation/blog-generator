# SEO Validation Research — 2026-05-08

**Doel:** valideer of de blog-generator architectuur en de SEO-extensions roadmap aansluiten op 2026 best practices. Vier parallelle research-agents met web-search/web-fetch hebben elk een eigen lens onderzocht. Dit document consolideert de bevindingen, koppelt ze aan onze concrete implementatie, en lijst aanpassingen in volgorde van impact.

**Methodologie:** vier independent research-runs op 2026-05-08, elk vereist verse web-sources (geen training-data-only antwoorden). Bronnen-tellling: 50+ unieke URLs vanaf 2025-2026, gewogen op autoriteit (Google Search Central, Ahrefs/Semrush data-studies, NL/EU overheid, vakliteratuur).

---

## Executive samenvatting

| Categorie | Aantal | Voorbeelden |
|---|---|---|
| ✅ Validated (geen actie) | 12 | multi-agent pipeline, reflection-loop, originality-25%, hard-fail rules, NL/EU bronnen-restrictie, internal-link density, anchor-distributie principes, reverse-linker parameters, pillar-cluster patroon |
| ⚠️ Adjust (kleine aanpassing) | 9 | H2 chunk-size, TL;DR structuur, image-format AVIF, hero-image attrs, FAQPage drop, IndexNow doc, AI-detection provider, banlist refresh, intent-aware word count |
| ❌ Gap (nieuwe taak) | 7 | Person schema, schema-rubric-signal, inline named-citations, CWV monitoring, AI-crawler robots.txt, editorial review log (Article 50), GSC-cannibalization vervroegen |

Conclusie: **fundament is solide**, maar 16 concrete aanpassingen nodig om volledig op 2026 niveau te zijn. Helft daarvan zit al in de bestaande SEO-extensions roadmap (Phases 2-9) en hoeft alleen scope-correctie. De andere helft zijn nieuwe items.

---

## Bron 1 — Technical SEO + schema markup

### Schema markup priority 2026

| Type | Status 2026 | Effect |
|------|-------------|--------|
| `BlogPosting` / `Article` | actief aanbevolen | Top Stories, Google News eligibility |
| `BreadcrumbList` | actief aanbevolen | sitelinks in SERP |
| `HowTo` | actief aanbevolen | +20% CTR op recipe/guide |
| `Organization` / `Person` | actief aanbevolen | E-E-A-T fundament, Knowledge Panel |
| `FAQPage` | **gedeprecieerd voor marketing blogs** | alleen nog voor gov/health |
| `Product` | alleen e-commerce | — |

JSON-LD is de officiële Google-voorkeur in 2026. Microdata is dood voor nieuwe implementaties.

**Bronnen:**
- [Google Search Central — Structured Data](https://developers.google.com/search/docs/appearance/structured-data)
- [Digital Applied — Schema 2026](https://digitalapplied.com/blog/structured-data-seo-2026-rich-results-guide)
- [GreenSERP Schema Guide 2026](https://greenserp.com/high-impact-schema-seo-guide)

### Core Web Vitals 2026

| Metric | Good | Notes |
|--------|------|-------|
| LCP | < 2,5s | hero image eager+fetchpriority="high" |
| INP (sinds 03-2024) | < 200ms | vervangt FID |
| CLS | < 0,1 | layout shift |

CWV is geen directe ranking factor maar tiebreaker in competitieve niches. Sites met alle 3 "good" hebben 24% hogere conversie ([source](https://corewebvitals.io/core-web-vitals)). Positie 1 scoort 10% vaker "good" dan positie 9.

### Image SEO 2026

**Format-hiërarchie:** AVIF (50% kleiner dan JPEG, >90% browser support) → WebP (fallback) → JPEG. Gebruik `<picture>` element. Sharp ondersteunt AVIF native (`sharp().avif()`).

**Hero image kritisch:** `loading="eager" fetchpriority="high"`. Lazy-load op hero = directe LCP penalty.

**EXIF stripping:** privacy + bytes, geen ranking factor maar GDPR-relevant.

### IndexNow status 2026

- **Google: NIET geadopteerd** (4+ jaar na launch). Officiële reden: bestaande infra + spam-zorg
- **Wel actief:** Bing, Yandex, Naver, Seznam, Yep
- 5+ miljard URL submissions/dag in 2026 (vs 3.5B in 2024), 17% van Bing klikken via IndexNow
- Voor Google: combineer XML sitemap + GSC Indexing API

### Robots.txt — AI crawlers 2026

Zes user-agents om te besluiten in 2026: `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `Meta-ExternalAgent`. Anthropic heeft 3 aparte crawlers (training/search/user-fetch); ClaudeBot blokkeren blokkeert NIET search-variant.

**Strategisch:** trainings-crawlers (Cat 1) blokkeren naar keuze; search/retrieval-crawlers (Cat 2) toelaten voor AI-zichtbaarheid. `Google-Extended` en `Applebot-Extended` blokkeren training zonder search-impact.

---

## Bron 2 — On-page content structure

### Word count 2026 — intent-driven

| Intent | Sweet spot |
|---|---|
| Informational (how-to, what-is) | 1.500-2.500w (+ 2.000+ in competitieve niches) |
| Transactional / commercial | 400-800w (productpagina van 400w verslaat 2.000w blog bij intent-match) |

**AIO-factor:** posts >2.900w krijgen gemiddeld 5.1 AIO-citaties vs 3.2 voor <800w. Maar structuur > volume. Een 800w post met goede H2-formatting verslaat 3.000w met slechte structuur.

### H2 chunking — 200-300w per H2

| Niveau | Lengte |
|---|---|
| H2 (macro chunks) | 300-800w, ideaal 200-300w voor passage indexing |
| H3 (micro chunks) | 100-200w |
| Heading frequentie | elke 200-300w een heading |

36% van featured snippets komt uit H2/H3. Headings als vragen formuleren = 2.2x meer kans op snippet. Direct na H3 een 40-60w antwoordblok plaatsen verhoogt PAA-extractie significant.

**NVIDIA chunking research:** 100-300w per chunk is optimaal voor LLM-extractie.

### TL;DR — 40-60w direct antwoord

- AIO-extractie sweet spot: 40-60w direct na heading
- 44% van AIO-citaties komt uit eerste 30% van tekst
- Pagina's met TL;DR + bullets worden vaker geciteerd
- Gemiddelde AIO-respons: 157w; 99% < 328w

### Internal linking 2026

| Vuistregel | Range |
|---|---|
| Per 1.000w | 2-5 interne links |
| Voor 2.000w post | 5-10 links |
| Voor korter (~750w) | 3-5 links |

**Zyppy-studie (23M links):** sweet spot rond 45-50 links per pagina; >50 = traffic daling. Hard limit 150 links (Google crawlt daarboven niet volledig).

**Distributie:** spread > top-loaded.

### Anchor-text distributie 2026 (% range)

| Type | Aanbevolen |
|---|---|
| Branded | 35-45% |
| Partial match | 15-30% |
| Exact match | **5-15%** (kritiek: SpamBrain 3.0 devalueert dominant exact-match) |
| Generic / naked URL | 10-20% |
| Topical / semantic | 10-15% |

Ahrefs: positie-1-pagina's hebben gemiddeld 13% exact-match anchors.

### Reading level (Flesch-NL / Douma)

| Score | Niveau | B2B target |
|---|---|---|
| 60-70 | HAVO/VWO | algemeen B2B |
| 50-60 | HBO/WO | technische niches |
| 30-50 | academisch | expert audiences only |

Google gebruikt Flesch-Kincaid niet direct als ranking signaal (J. Mueller). Indirect via dwell time / bounce rate.

**Aanbeveling MKB-publiek:** Flesch-Douma 55-65.

### Reverse internal linking

Geen industrie-norm voor frequentie/aantal — dit is implementatiekeuze. Onze parameters (weekly, max 1 link per oude post, 50 candidates, 14d window, exclude pillar) zijn conservatief en veilig. **Bonus:** pillar pages gebruiken als link-*senders* (niet ontvangers) is de waarde van het bi-directionele cluster-model.

---

## Bron 3 — AIO, E-E-A-T, AI-content

### AI Overviews status 2026

- 48% van US searches (vs 31% feb 2025)
- 46-61% organische CTR-reductie voor AIO-queries
- Zero-click 56% → 69% (mei 2024 → mei 2025)
- B2B Tech 82% AIO-saturatie

**Wat WEL geciteerd wordt in AIO:**

| Signal | Effect |
|---|---|
| Article + BreadcrumbList schema | 2.3x AIO citation |
| HowTo schema | 2.8x |
| Inline named citations (auteur/onderzoeksinstituut) | 2.1x |
| ≥3 unieke datapunten | 4x |
| Domain authority (top 1%) | vangt 47% van alle citaties |
| Eerste 30% van tekst | 44% van citaties komt hier vandaan |
| >2.500w | 1.6x vs <800w |

### E-E-A-T 2026

- Geen directe ranking factor; correleert ~8% van ranking weight (24% voor YMYL)
- **Author entity is meest engineerable signaal** in 2026 (per [LeadGen Economy](https://www.leadgen-economy.com/blog/eeat-author-entity-verification-ai-overviews/))
- Vereist: benoemde auteur per post, eigen bio-pagina, `Person` schema, byline gelinkt aan bio
- Anonieme blog = structureel benadeeld

### Helpful Content System 2026

- Geïntegreerd in core algoritme sinds maart 2024 (geen aparte update meer)
- Maart 2026 core update: AI content farms verloren tot 80% visibility; pagina's met proprietary data wonnen 15-25%
- Google: "we don't care if content is AI or human; we care about quality" (J. Mueller, nov 2025)
- Bestraft: scaled content abuse (massa zonder review), trending-topics zonder diepgang, fake freshness

### AI-content stance

Google detecteert AI mogelijk maar gebruikt het NIET als ranking signal. Detection-tools (Originality.ai, GPTZero) zijn alleen voor publishers.

**Detection accuracy 2026:**

| Tool | Strength | Weakness |
|---|---|---|
| GPTZero | 99.3% controlled benchmark, 100% recall GPT-5 | 18% real-world false positive rate |
| Originality.ai | 96.7% recall RAID benchmark, beter op parafrasering | 31.7% recall GPT-5 mini (mist nieuwe modellen) |

**Verdict:** dual-use als dashboard-signaal, NOOIT als auto-blokkade.

### Originaliteit als differentiator

Information Gain — hoeveel nieuwe kennis een pagina toevoegt — is sinds maart 2026 "de dominante content-quality evaluator." Strategie: contrarian + data = citation-magnet voor AIO.

**Bronnen:**
- [Semrush AI Overviews Study 2025](https://www.semrush.com/blog/semrush-ai-overviews-study/)
- [1000 AIO Citations Analyzed](https://www.digitalapplied.com/blog/we-analyzed-1000-ai-overviews-citation-pattern-study)
- [Seer Interactive AIO CTR sept 2025](https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-september-2025-update)
- [End of Commodity Content 2026 — NEURONwriter](https://neuronwriter.com/end-of-commodity-content-high-friction-seo-2026/)

---

## Bron 4 — NL B2B + cannibalization + AI Act

### NL B2B SEO

- Frankwatching, Marketingfacts blijven primaire NL vakplatformen
- Searchlab.nl (nieuw, datagedreven) groeit als autoriteitsplatform
- AIComplianceHub.nl + teacher4ai.net opgekomen post-2024 voor MKB-AI-niche

### Authority sources voor MKB-AI compliance

**Kern (verplicht in researcher-prompt):**
1. Autoriteit Persoonsgegevens (AP) — toezichthouder AI Act NL
2. RVO.nl — subsidies + MKB-AI
3. Rijksoverheid.nl — kabinetsbesluiten AI-toezicht (apr 2026)
4. Europese Commissie — Draft Code of Practice AI Content (jan-mrt 2026)
5. Digitaleoverheid.nl — consultatie Uitvoeringswet AI-verordening

**Aanvullend:** NLdigital, KvK, Frankwatching, Marketingfacts, Emerce, AIComplianceHub.nl, teacher4ai.net.

### Cannibalization detection

Tekst-only (slug/title overlap) heeft ~70% recall obvious cases, ~40% recall semantische overlap. GSC-data is industrie-standaard 2026: query-page pairs over 90-180d lookback.

**Trigger om GSC vooruit te halen:** zodra 3 pillars elk ≥10 clusterposts hebben, ontstaan semantische overlaps die tekst-filter mist.

### Pillar-cluster 2026

- 8-20 supportingpages per pillar (effectief min 6, optimum 10-15)
- Linking: bidirectioneel verplicht (cluster→pillar contextueel; pillar→cluster met beschrijvende anchor)
- 40% hogere groei na 12+ maanden consistente publicatie

### EU AI Act — Article 50 (kracht per 2 augustus 2026)

- Disclosure verplicht voor AI-gegenereerde content "over zaken van publiek belang"
- **Editorial responsibility exception:** geen disclosure als (1) echte menselijke review, (2) rechtspersoon redactionele verantwoordelijkheid draagt, (3) gedocumenteerd is met reviewer-ID + datum
- Onze workflow (draft → redacteur → publicatie) valt onder de exception MITS we logging toevoegen
- Voor commerciële B2B-blogs (AI-tools, afdelings-implementaties) is "publiek belang" juridisch onuitgekristalliseerd — documenteren = goedkope verzekering

**Bronnen:**
- [Article 50 EU AI Act](https://artificialintelligenceact.eu/article/50/)
- [Code of Practice AI-Generated Content](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)
- [Report AI & Algorithms NL March 2026 — AP](https://www.autoriteitpersoonsgegevens.nl/en/documents/report-ai-algorithms-netherlands-march-2026)
- [AIComplianceHub.nl — EU AI Act voor NL bedrijven](https://www.aicompliancehub.nl/eu-ai-act)

---

## Validatie tegen onze implementatie

### ✅ Behouden zonder wijziging

| Element | Status | Bevestigend bewijs |
|---|---|---|
| Multi-agent pipeline (7 rollen + reflection-loop) | ✅ | "Anti scaled-content-abuse" bij elke core update bevestigd |
| Quality rubric: originality 25% zwaarste LLM-dim | ✅ | Maart 2026 core update: pagina's met proprietary data +15-25% |
| Hard fail: originality<6 of fabricated_claim | ✅ | Voorkomt Google's #1 strafbare patroon |
| Hard fail: banlist_hits_per_1000_words > 3 | ✅ | Anti-cliché correlate met low-quality |
| Originaliteits-eis (rekenvoorbeeld/NL-casus/contrarian) | ✅ | AIO-studie: ≥3 datapunten = 4x citation |
| Internal-link density (≥3 voor 750-1500w) | ✅ | 2-5 per 1.000w = consensus |
| Anchor-distributie principe (Strategist bepaalt mix) | ✅ | SpamBrain 3.0 oordeelt context, niet alleen anchor |
| Reverse internal-linker parameters (weekly, max 1/post, 14d window, exclude pillars) | ✅ | Conservatief en veilig |
| Reading-level Phase 2 prioritering | ✅ | Geen direct ranking factor, indirect via dwell time |
| Researcher's NL/EU-only bron-restrictie | ✅ | NL B2B differentiator |
| Pillar-cluster + weights tot 1.0 | ✅ | 40% hogere groei na 12mnd |
| Editorial review (draft naar redactie) | ✅ | Voldoet aan Article 50 exception (mits logging) |

### ⚠️ Aanpassen — bestaande implementatie

| # | Element | Huidig | Naar | Impact |
|---|---|---|---|---|
| A1 | H2 chunk woordtelling (Strategist) | 134-167w | **200-300w** per chunk | featured snippets + passage indexing |
| A2 | TL;DR samenvatting (Writer) | 134w blok | one-liner + **40-60w direct antwoord** + optionele 134w verdieping | AIO-extractie sweet spot |
| A3 | Word count target | flat 750-1500 | **intent-split**: informational ≥1500w, commercial 750-1000 | content matcht intent |
| A4 | Image format (Phase 4) | WebP primary | **AVIF primary**, WebP fallback | 50% kleiner dan JPEG |
| A5 | Hero image attrs (Phase 4) | uniform | hero = `loading="eager" fetchpriority="high"`, body = `loading="lazy"` | LCP-vriendelijk |
| A6 | Schema scope (Phase 3) | Article + FAQPage + Breadcrumb | **drop FAQPage** (gedeprecieerd voor marketing); add Person schema | E-E-A-T + ranking |
| A7 | IndexNow doc (Phase 5) | Bing/Yandex (impliciet) | **expliciet docen**: Google reageert NIET; via sitemap+GSC API voor Google | helderheid |
| A8 | AI-detection provider (Phase 2.3) | "Originality.ai of GPTZero" | **Originality.ai geprefereerd** (parafrasering) + dashboard-only (geen auto-blok) | accuratere detectie |
| A9 | Banlist update strategie | static lijst | maandelijks reviewen op nieuwe AI-clichés | toekomstbestendig |

### ❌ Nieuwe gaps — toevoegen aan roadmap

| # | Gap | Voorgestelde fase | Effort |
|---|---|---|---|
| G1 | **Person schema voor author bylines** (E-E-A-T meest engineerable signaal) | Phase 3 uitbreiding | S |
| G2 | **Schema-detectie als deterministisch rubric signal** (`computeDeterministicRubricSignals`) | Phase 3 uitbreiding | S |
| G3 | **Inline named-source citation enforcement** (writer prompt + rubric check) | Pipeline-aanpassing | S |
| G4 | **Core Web Vitals monitoring** (GSC CWV-rapport wekelijks + PageSpeed in publish-flow) | nieuwe Phase 10 | S |
| G5 | **AI-crawler robots.txt strategie** (GPTBot/ClaudeBot/Google-Extended/etc.) | nieuwe Phase 11 | S |
| G6 | **Editorial review logging** (Article 50 compliance, deadline 2 aug 2026) | nieuwe Phase 12 | S |
| G7 | **GSC-cannibalization vervroegen** van Phase 8 → na 30 posts | scope-shift | M |

### Aanvullend uit research (geen directe roadmap-item)

- **Domain authority is sterkste AIO-citatie correlator (+0.61)**. Traag te bouwen via consistent publiceren + externe links/PR. Geen automatiseerbare actie binnen onze pipeline.
- **Frequentie publicatie**: 1-2 cluster posts/week voor snelle autoriteitsopbouw. Onze cap is 4/week — kan blijven.
- **Topic clustering volume**: 8-20 supportingpages per pillar. Onze initiele topic-queue heeft 18 topics × 3 pillars = 6 per pillar — boundary-laag, niet ideaal. Aanbevolen: bij Phase 9 (topic-suggester) target 10-15 per pillar.

---

## Top-5 prioriteiten

In volgorde van impact-per-effort:

1. **G2 Schema-detectie in rubric + G1 Person schema** (S, hoge impact). 2.3-2.8x AIO citation lift. Beide kunnen samen in één Phase 3 sub-plan.
2. **A2 TL;DR herstructurering** (S, hoge impact). 40-60w direct antwoord pakt AIO-citaties; 44% van citaties komt uit eerste 30% tekst.
3. **G6 Editorial review logging** (S, juridische deadline 2 aug 2026). Goedkope verzekering voor Article 50 exception.
4. **A1+A3 H2 chunk-size + intent-aware word count** (S-M, breed effect). Brengt content in lijn met passage-indexing + intent-match consensus.
5. **A4+A5 Image-SEO upgrade** (S, technische kwaliteitsboost). AVIF + hero-image-attrs voorkomt LCP-penalty.

Daarna: G4 CWV monitoring (S), G5 AI-crawler robots.txt (S), G7 GSC vervroegen (M), G3 inline citations (S), A6 schema scope-fix in Phase 3, A8 AI-detection provider keuze.

---

## Conclusie

Het fundament — multi-agent met reflection-loop, originality-gewogen rubric, hard fails op originality + fact-check, NL/EU-only bronnen, pillar-cluster — is aangetoond aligned met 2026 best practice. Wat moet bijgesteld zijn vooral parameter-niveau aanpassingen (H2-grootte, TL;DR-blok, image-format) en een paar concrete schema/compliance-gaps. Niets in het ontwerp is structureel fout.

De roadmap (`2026-05-08-seo-extensions.md`) krijgt 9 nieuwe/aangepaste items in deze update; uitvoering blijft volgordelijk per phase.
