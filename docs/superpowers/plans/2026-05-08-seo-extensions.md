# SEO Extensions Implementation Plan

> **For agentic workers:** This is a **roadmap-level** plan. Each phase ships working software but is intentionally scoped at feature level (goal / files / approach / open questions) rather than line-by-line steps. Before executing a phase, generate a detailed sub-plan for that phase using `writing-plans` and run it via `executing-plans` or `subagent-driven-development`.

**Goal:** Layer 12 SEO and content-distribution extensions onto the existing multi-agent blog generator ([2026-05-08-seo-blog-generator.md](2026-05-08-seo-blog-generator.md)), prioritizing the reverse internal-linker.

**Architecture:** Three-tier expansion onto the existing pipeline:
- **(a) In-pipeline stages** added to the orchestrator (citation-fetcher, reading-level, AI-detection, schema generator, schema validator, image-SEO)
- **(b) Post-publish hooks** (IndexNow ping)
- **(c) Standalone scheduled jobs** (reverse internal-linker, anchor tracker, repurposer, search-console sync, topic-suggester)

**Tech stack additions:**
- `sharp` — image processing (WebP, srcset, EXIF strip)
- `googleapis` — Google Search Console API
- `node-html-parser` (or `cheerio`) — HTML parsing for internal-linker + anchor tracker
- `schema-dts` — TypeScript types for JSON-LD
- Originality.ai HTTP API (or GPTZero) — AI-detection
- Existing `runAgent` infra reused for new agents (internal-linker, repurposer, topic-suggester)

**Existing project context:**
- Codebase root: this repo
- Hoofdplan voltooid (Tasks 1-35); zie git log
- Bestaande architectuur: `src/agents/`, `src/pipeline/`, `src/image/`, `src/wordpress/`, `src/email/`, `src/llm/`
- Tenant config: `tenants/<slug>/config.yaml` (REPLACE_ME placeholders zijn intentioneel — niet automatisch invullen)

---

## Cross-cutting concerns (read before any phase)

### New env vars / GitHub secrets

| Var | Phase | Source |
|---|---|---|
| `GSC_SERVICE_ACCOUNT_JSON` | 8, 9 | Google Cloud service account met Search Console read access |
| `ORIGINALITY_API_KEY` | 2 | originality.ai (of GPTZero — keuze in §Open questions) |
| `INDEXNOW_KEY` | 5 | self-generated 32-char key, gehost als `https://artifation.nl/<key>.txt` |
| `LINKEDIN_PAGE_ACCESS_TOKEN` of `BUFFER_API_KEY` | 7 | LinkedIn/Buffer API |
| `RESEND_NEWSLETTER_AUDIENCE_ID` | 7 | Resend audiences (al beschikbaar) |
| `X_BEARER_TOKEN` | 7 | X/Twitter API (alleen als auto-post; manuele copy hoeft niet) |

### Dependencies tussen fases

```
Phase 1 (Reverse internal-linker) ─────────────────┐  independent
Phase 2 (Pre-publish guards)        ───┐            │
Phase 3 (Schema markup + validator) ───┤  modify    │
Phase 4 (Image-SEO)                 ───┤  orchestrator
Phase 5 (IndexNow)                  ───┤            │
Phase 6 (Anchor tracker)            ───┘            │
Phase 7 (Repurposer)                ──── sidecar    │
Phase 8 (Search Console)            ──── new module │
Phase 9 (Topic-suggester)           ──── depends on Phase 8
```

### Aanbevolen executie-volgorde

1. **Phase 1** eerst (gebruiker-prioriteit, niet-blokkerend, afzonderlijke workflow)
2. **Phase 2 + 3** (defensieve in-pipeline checks; voorkomen slechte content live)
3. **Phase 5** (quick-win, bredere indexering)
4. **Phase 4 + 6** (kwaliteits-verfijning)
5. **Phase 8** vóór Phase 9 (data-bron eerst)
6. **Phase 9** (vervangt grotendeels de handmatige `topics.yaml` curatie)
7. **Phase 7** als laatste (afhankelijk van content-volume; pas zinvol bij ≥5 gepubliceerde posts)

### Per-fase output

Elke fase eindigt met:
- Tests (unit + integration waar van toepassing) groen
- `tsc --noEmit` schoon
- Eén feature-flag-config in `tenants/artifation/config.yaml` zodat individuele fases per tenant toggle-baar zijn
- README-sectie geüpdatet

---

## Phase 1 — Reverse internal-linker (HIGH PRIORITY)

**Goal:** Wekelijkse job die nieuwe gepubliceerde posts identificeert en relevante oudere posts bewerkt om er naartoe te linken (anchor + 1-2 zinnen herschrijving rondom de link).

**Effort:** M (3-5 dagen)

**Files to add:**
- `src/agents/internalLinker.ts` — agent die per (oude post, nieuwe post)-paar bepaalt waar de link past
- `src/agents/prompts/internalLinker.ts` — system prompt
- `src/pipeline/internalLinkerJob.ts` — orchestrator van de job (verzamelt kandidaten, voert agent uit, push WP-updates)
- `src/wordpress/posts.ts` — uitbreiden met `updatePost(id, content)` (PATCH `/wp-json/wp/v2/posts/{id}`)
- `.github/workflows/weekly-internal-linker.yml` — cron `0 5 * * 1` (maandag 05:00 UTC)
- `test/unit/agents/internalLinker.test.ts`
- `test/unit/pipeline/internalLinkerJob.test.ts`

**Files to modify:**
- `src/wordpress/posts.ts` — voeg `getPost(id)` en `updatePost(id, content)` toe
- `tenants/<slug>/config.yaml` — schema-uitbreiding: `internal_linker.enabled: bool`, `internal_linker.max_links_per_run: int`, `internal_linker.lookback_posts: int`

**Approach:**
1. Job leest WP-sitemap of `/wp-json/wp/v2/posts?per_page=100&orderby=date` om alle published posts te krijgen.
2. Identificeer "nieuwe" posts: gepubliceerd in laatste 14 dagen.
3. Voor elke nieuwe post:
   - Bepaal target-keywords + entiteiten (uit Rank Math focus-keyword + meta).
   - Haal `lookback_posts` (default 50) oudere posts op.
   - Voor elke oudere post: agent krijgt (oude post HTML, nieuwe post titel + tldr + URL + focus-keyword) en outputs:
     ```json
     {
       "should_link": boolean,
       "link_placement": { "anchor_text": string, "context_before_50_chars": string, "context_after_50_chars": string, "rewritten_paragraph": string },
       "confidence": 0..1
     }
     ```
   - Filter op `confidence >= 0.7` en `should_link == true`.
4. Per oudere post: voer max 1 link-injectie uit (over-optimalisatie voorkomen — zie Phase 6).
5. Update WP via `updatePost(id, newHtml)`. Genereer `revision_note` voor in WP-revisie-history.
6. Output: state-file `data/internal-linker-runs/<date>.json` met log van wat is aangepast.

**Test strategy:**
- Unit test agent: gemockte LLM, valideer JSON output schema.
- Unit test job: mock WP-client (returns 5 fake posts), mock agent (returns predetermined link decisions), verify exact `updatePost` calls.
- Geen integration test met live WP — risico op data-corruptie bij live experimenteren.

**Open questions:**
- **HTML-replacement strategie**: directe string-replace op `context_before_50_chars + context_after_50_chars` is fragile. Alternatief: agent geeft volledige `rewritten_paragraph` terug en wij vervangen de hele paragraph. → Voorkeur: rewritten_paragraph aanpak. Vergt meer agent-tokens maar safer.
- **Idempotentie**: hoe voorkomen we dat dezelfde link 2x wordt toegevoegd bij re-run? → Track in state-file + check op anchor + URL bestaat al in oude post HTML.
- **Welke posts beschermen?**: pillar pages, product pages — niet aanraken. Markeer per-post via custom field of `internal_linker.exclude_post_ids` config.
- **Agent rol vs hardcoded**: kan een determine-relevance check ook deterministisch (cosine similarity op embeddings)? → Toevoegen als pre-filter; bespaart LLM-calls.

**Risico's:**
- WP-revisies kunnen exploderen bij wekelijkse runs. → Mitigation: alleen aanpassen als ≥1 link wordt toegevoegd.
- Verkeerde anchor → over-optimalisatie. → Mitigation: feed Phase 6's anchor-distribution-tracker als input naar de agent.

---

## Phase 2 — Pre-publish guards

**Goal:** Drie defensieve checks vóór WP-publish die slechte content stoppen: dode externe bronnen, te complex/te simpel taalniveau, en AI-gegenereerde-detectie.

**Effort:** S × 3 = ~3 dagen totaal

### 2.1 Citation-fetcher

**Files to add:**
- `src/pipeline/citationCheck.ts`
- `test/unit/pipeline/citationCheck.test.ts`

**Files to modify:**
- `src/pipeline/orchestrator.ts` — nieuwe stage tussen `factChecker` en `qualityJudge`

**Approach:** HEAD-request elke URL in `research.parsed.external_authority_sources` + `outline.external_links_to_cite`. Als `>20%` faalt of ≥1 200-OK URL serveert content die ≥80% afwijkt qua title/h1 van wat de Researcher claimde → flag als hard-fail input voor QualityJudge. Optioneel: bij flagged URLs de Researcher opnieuw aanroepen om vervangende bronnen te vinden (1 retry).

**Test strategy:** Mock `fetch`, test 200/404/redirect/timeout cases.

**Open questions:**
- On-topic check: full GET + Cheerio-parse van `<title>` en `<h1>`, embedding-similarity met claim? Of LLM-call? → LLM-call is simpler maar duurder. Voorstel: alleen LLM op de URLs die anders zouden falen.
- Timeout per request: 5s? Total budget: 60s?

### 2.2 Reading-level enforcer

**Files to add:**
- `src/pipeline/readingLevel.ts` — Flesch-NL berekening
- `test/unit/pipeline/readingLevel.test.ts`

**Files to modify:**
- `src/pipeline/rubric.ts` — voeg `flesch_nl_score` toe aan `RubricSignals`
- `src/agents/prompts/qualityJudge.ts` — gebruik in `readability` score
- `tenants/<slug>/config.yaml` — `reading_level_targets` per pillar (bv. `{ ai-per-afdeling: { min: 50, max: 70 }, ai-bewustwording: { min: 60, max: 80 } }`)

**Approach:** Implementeer Flesch-Reading-Ease aangepast voor NL (Douma-formule of Brouwer-formule):
```
Flesch-NL = 207 - 0.93 * (woorden/zinnen) - 77 * (lettergrepen/woorden)
```
Lettergreep-counting voor NL: vereenvoudigd via vowel-cluster heuristiek (geen externe lib nodig). Output range: 0-100, waar hoger = makkelijker.

**Test strategy:** Unit tests met bekende referentie-teksten (NU.nl artikel = ~70, juridische tekst = ~40).

**Open questions:**
- Lettergreep-counter exact genoeg? Alternatief: `syllable-count-nl` npm package. → Eerste implementatie heuristiek, swap als output onbetrouwbaar blijkt.

### 2.3 AI-detection guard

**Files to add:**
- `src/pipeline/aiDetection.ts`
- `test/unit/pipeline/aiDetection.test.ts`

**Files to modify:**
- `src/pipeline/orchestrator.ts` — stage vóór `qualityJudge`
- Tenant config: `ai_detection.threshold_max_ai_pct: 30` (default; hard-fail als overschreden)

**Approach:** POST naar Originality.ai of GPTZero. Originality.ai kost ~$0.01 per 1000 woorden — ~$0.015 per blog. Verdict: `human_score`, `ai_score`. Als `ai_score > threshold`: hard-fail voor QualityJudge.

**Test strategy:** Mock HTTP client, test threshold-branching.

**Open questions:**
- **Originality.ai vs GPTZero vs ZeroGPT**: Originality.ai heeft API + meest geadverteerd; GPTZero gratis tier 7500 woorden/dag. → Begin met GPTZero (gratis), upgrade als rate-limit raakt.
- Wat als detectie zelf hallucinatieert? Onze Writer is bewust geconfigureerd om niet-AI te lijken. Echte risico is overrejection. → Threshold conservatief op 30% pas evalueren na 5-10 echte runs.

---

## Phase 3 — Schema markup + Rich Results validator

**Goal:** Echte JSON-LD schema's genereren (Article, FAQPage, BreadcrumbList) ipv alleen string-namen, en valideren via Google's Rich Results endpoint.

**Effort:** S (1-2 dagen)

**Files to add:**
- `src/pipeline/schemaGenerator.ts` — bouwt JSON-LD object uit beschikbare data
- `src/pipeline/schemaValidator.ts` — POST naar Google Rich Results API
- `test/unit/pipeline/schemaGenerator.test.ts`
- `test/unit/pipeline/schemaValidator.test.ts`

**Files to modify:**
- `src/wordpress/rankMath.ts` — voeg `setSchema(postId, jsonLd)` toe (Rank Math accepteert custom JSON-LD via `rank_math_schema_BlogPosting` etc.)
- `src/pipeline/orchestrator.ts` — generate schema na SEO-editor, valideer vóór Rank Math push
- `src/agents/prompts/strategist.ts` — `schema_choices` blijft als hint, niet meer als output

**Approach:**
- Article (BlogPosting): `headline`, `description`, `author` (uit tenant), `datePublished`, `image`, `publisher`, `mainEntityOfPage` — ~10 verplichte velden, alle uit bestaande pipeline-state.
- FAQPage: alleen genereren als `outline.faq_block` ≥ 1 entry.
- BreadcrumbList: `Home > <pillar> > <post-title>` — pillar-naam uit tenant config.
- Validator: `https://searchconsole.googleapis.com/v1/urlTestingTools/richResults:run` of (publicly available) `https://search.google.com/test/rich-results?url=...`. Eerste vereist OAuth, tweede is web-only. → Begin met **lokale schema-validatie via `schema-dts` types + JSON-Schema check** (geen externe call); upgrade later naar Google's API als we GSC integratie hebben (Phase 8).

**Test strategy:**
- Unit-test elke schema-builder met fixture-input.
- Snapshot-test full JSON-LD output.

**Open questions:**
- Geneste schemas (Article met embedded Person voor author): Google accepteert + verkiest het. → Implementeer.
- HowTo schema voor stappenplan-blogs? → Out of scope v1; detection logica is broos.

---

## Phase 4 — Image-SEO

**Goal:** Geüploade afbeeldingen optimaliseren: WebP-conversie + srcset met meerdere breedtes, EXIF strippen, lazy-load attribuut in HTML.

**Effort:** S (1 dag)

**Files to modify:**
- `src/image/fal.ts` — na fetch van originele PNG: gebruik `sharp` om WebP + 3 breedtes te genereren (1024, 768, 480)
- `src/wordpress/media.ts` — upload nu *meerdere* media-items (origineel PNG voor backup + WebP varianten); WP regenereert standaard al thumbnails maar wij willen WebP afdwingen
- `src/pipeline/orchestrator.ts` — vervang `<img src="...">` placeholder in HTML door `<img src="..." srcset="..." loading="lazy" alt="...">`
- `package.json` — add `sharp`

**Files to add:**
- `src/image/optimize.ts` — nieuwe module met `optimizeForWeb(bytes): { webp1024, webp768, webp480, jpegFallback }`
- `test/unit/image/optimize.test.ts`

**Approach:**
- Gebruik `sharp` om WebP + size-varianten te genereren in-memory.
- Strip metadata met `.withMetadata({})` of `.withMetadata({ exif: {} })`.
- WP-upload: 4 media-uploads totaal (3 WebP + 1 JPEG fallback). Featured-image blijft 1024-WebP.
- Genereer `<picture>` element met fallback:
  ```html
  <picture>
    <source srcset="webp480 480w, webp768 768w, webp1024 1024w" type="image/webp">
    <img src="jpegFallback" alt="..." loading="lazy" width="1024" height="1024">
  </picture>
  ```
- `loading="lazy"` op alle `<img>` in body (al door WP gedaan vanaf 5.5, maar expliciet zetten).

**Test strategy:**
- Unit-test `optimizeForWeb`: input PNG, verify output formats + dimensions.
- Geen integration test met echt WP (privé-pluginset).

**Open questions:**
- Browser support: WebP is ~96% wereldwijd in 2026, geen issue.
- Storage cost: 4× zoveel media-items. WP shared hosting accepteert dat? → Verifieer met host. Bij krapte: alleen WebP + 1 JPEG fallback.

---

## Phase 5 — IndexNow / Bing / Yandex ping

**Goal:** Bij elke succesvolle WP-publish, ping IndexNow zodat Bing + Yandex direct indexeren. (Google heeft eigen Search Console — komt in Phase 8.)

**Effort:** S (halve dag)

**Files to add:**
- `src/pipeline/indexNow.ts`
- `test/unit/pipeline/indexNow.test.ts`
- `tenants/<slug>/.well-known/<INDEXNOW_KEY>.txt` (statisch op de site host)

**Files to modify:**
- `src/pipeline/orchestrator.ts` — nieuwe stage *na* Rank Math meta, vóór success-email
- Tenant config: `indexnow_key_secret_ref: INDEXNOW_KEY`

**Approach:**
- Genereer een 32-char hex key, host `https://artifation.nl/<key>.txt` met de key als enige inhoud (validatie-vereiste).
- POST naar `https://api.indexnow.org/indexnow`:
  ```json
  { "host": "artifation.nl", "key": "<key>", "keyLocation": "https://artifation.nl/<key>.txt", "urlList": ["https://artifation.nl/<slug>/"] }
  ```
- Faal niet-fataal: log error, ga door (success-email blijft uit).

**Test strategy:** Mock fetch, verify request body + non-fatal error handling.

**Open questions:**
- Key location hosting: handmatig in WP `/wp-content/` plaatsen, of via een aparte WP-page met die exacte slug? → Easiest: upload als WP-media item op `/wp-content/uploads/<key>.txt` en verwijs IndexNow erheen.

---

## Phase 6 — Anchor-text rotation tracker

**Goal:** Voorkomen dat één URL via 10 verschillende posts dezelfde exact-match anchor krijgt (over-optimalisatie risico).

**Effort:** S (1 dag)

**Files to add:**
- `src/pipeline/anchorTracker.ts`
- `test/unit/pipeline/anchorTracker.test.ts`

**Files to modify:**
- `src/pipeline/orchestrator.ts` — vóór Strategist: bouw `anchor_history` map; geef mee als input
- `src/agents/strategist.ts` — accepteer `anchor_history` input
- `src/agents/prompts/strategist.ts` — instrueer dat als URL X al ≥3 keer met exact-match anchor "Y" is gelinkt, kies een partial of semantic anchor

**Approach:**
1. Scrape WP-sitemap (al beschikbaar via Phase 0). Voor elke URL: GET de pagina, parse HTML, vind alle `<a href>` met interne URLs, log anchor-text.
2. Aggregeer per (target_URL, anchor_text)-paar: count.
3. Bouw `anchor_history`: `Record<targetUrl, { exactMatch: Record<anchor, count>, partial: Record<anchor, count> }>`.
4. Strategist krijgt deze map; system-prompt instrueert anchor-distribution-keuzes met dit als beperking.

**Test strategy:** Unit test parser met fixture HTML. Integration test: feed 10 fake "previously published" posts in, verifieer dat Strategist-prompt input aangepaste history bevat.

**Open questions:**
- Caching: deze pre-fetch kost 50× HTTP requests per pipeline-run. → Cache resultaat per dag in `data/anchor-history-<tenant>.json`.
- Drempel exact-match count: 3? 5? → Begin met 3, evalueer.

---

## Phase 7 — Repurposer (LinkedIn / Newsletter / X-thread)

**Goal:** Per gepubliceerde blog: genereer 3 kortere afgeleide content-stukken in andere voice + lengte.

**Effort:** M (3-4 dagen)

**Files to add:**
- `src/agents/repurposer.ts` — accepteert `(blog_html, target_format)` en outputs format-specifieke content
- `src/agents/prompts/repurposer.ts` — drie aparte prompts (linkedin, newsletter, xthread)
- `src/pipeline/repurposeJob.ts` — orchestrator
- `src/email/templates/Repurposed.tsx` — nieuwe email-template met 3 tabs
- `test/unit/agents/repurposer.test.ts`
- `.github/workflows/post-publish-repurpose.yml` (of in-pipeline na success — keuze hieronder)

**Files to modify:**
- `src/pipeline/orchestrator.ts` — als feature-flag aan: trigger repurpose-job na success (in-pipeline) of post-WP-cron (separate)
- Tenant config: `repurpose.targets: ["linkedin", "newsletter", "xthread"]`

**Approach (varianten):**
- **LinkedIn**: 1500-3000 chars, hook-zin eerste 200 chars, geen jargon, eindigt met vraag of CTA naar blog
- **Newsletter (Resend)**: 200-400 woorden, persoonlijke toon, CTA-link, "een nieuwe blog die je misschien interesseert"
- **X-thread**: 5-9 tweets, eerste tweet hook, laatste met blog-link, geen hashtag-spam (max 2)

Output JSON-schema per format. Repurposer is één agent met format-specifieke prompts (DRY ipv 3 aparte agents).

**Distributie-opties:**
1. **Pure preview**: agent draait, mailt redactie de 3 versies; redactie kopieert handmatig naar kanalen
2. **Auto-post**: LinkedIn API (Persoonlijke posts via OAuth, of Pages API), Buffer als 3rd-party, X API v2 (kost geld in 2026)

→ **Voorstel: begin met optie 1**. Auto-post toevoegen als optionele config later.

**Test strategy:** Unit test per format, valideer length + structure constraints.

**Open questions:**
- Resend "audiences" voor newsletter: wil je gebruikers laten subscriben of is dit private mailing? → Bepaalt of we Resend's broadcast endpoint gebruiken of gewoon `sendEmail` naar een vaste lijst.
- LinkedIn personal vs company page: aparte API-flows.
- Reuse de `runWriter` reflection-loop voor repurposed content? Probably yes — kortere versies hebben meer kwaliteit nodig per woord.

---

## Phase 8 — Search Console integration

**Goal:** Vervang de huidige tekst-only cannibalization-check door echte data uit GSC, en detecteer content-decay (posts die rankings verliezen).

**Effort:** M (3-5 dagen)

**Files to add:**
- `src/integrations/searchConsole.ts` — auth + query helpers
- `src/pipeline/cannibalizationGsc.ts` — vervangt `cannibalization.ts` (of complementeert)
- `src/pipeline/contentDecayJob.ts` — wekelijkse job
- `src/email/templates/ContentDecay.tsx`
- `test/unit/integrations/searchConsole.test.ts`
- `test/unit/pipeline/cannibalizationGsc.test.ts`
- `.github/workflows/weekly-content-decay.yml`

**Files to modify:**
- `src/pipeline/orchestrator.ts` — call `cannibalizationGsc` ipv `cannibalization` (achterwaarts compatibel via feature-flag)
- Tenant config: `search_console.property_url`, `search_console.service_account_secret_ref`

**Approach:**

**Setup:**
- Service-account JSON in GH secret. Property: `sc-domain:artifation.nl` (of URL-prefix).
- Lib: `googleapis`. Search Console API v1 endpoint: `searchanalytics/query`.

**Cannibalization-check (replace tekst-only):**
- Voor `target_keyword`: query GSC met `dimensions: ['query', 'page']`, filter `query == target_keyword`, last 90 days.
- Als ≥2 pagina's met >100 impressions voor zelfde query → cannibalization. Gebruik impressions + clicks om te beslissen welke pagina "winner" is (of of nieuwe post toegevoegde waarde heeft).

**Content-decay:**
- Wekelijkse job: pull alle queries voor `domain` in laatste 30d en eerdere 30d.
- Identificeer pagina's met `position` ≥ 2.0 plekken slechter dan 30d ervoor, OR `clicks` ≥ 30% lager.
- Mail rapport: top-10 decaying pages met suggesties (refresh, expand, verwijder).
- Optioneel: trigger automatische refresh via een "topic-suggester proposed: refresh-<slug>" entry.

**Test strategy:**
- Mock googleapis client.
- Unit test cannibalization-decision-logica met fixture data.
- Integration test van content-decay aggregator.

**Open questions:**
- GSC has 16-month data lag. Eerste 7 dagen na publish geen data. → Cannibalization-check skip voor URLs nieuwer dan 7d; default naar tekst-only.
- Service account access: moet in GSC worden uitgenodigd als gebruiker. Manueel-step.
- Cost: GSC API is gratis tot 1200 queries/min. Niet beperkend.

---

## Phase 9 — Topic-suggester

**Goal:** Vervang grotendeels handmatige `topics.yaml` curatie. Wekelijkse job die nieuwe topic-kandidaten vindt uit (a) competitor sitemaps, (b) GSC rising queries, en die als `proposed`-status entries toevoegt aan `topics.yaml` (jij approved → `queued`).

**Effort:** L (5-7 dagen)

**Files to add:**
- `src/agents/topicSuggester.ts` — agent die kandidaten scoort + dedupliceert tegen bestaande queue
- `src/agents/prompts/topicSuggester.ts`
- `src/pipeline/topicSuggesterJob.ts` — orchestrator
- `src/integrations/competitorSitemaps.ts` — fetch + diff sitemaps van concurrenten over tijd
- `src/email/templates/TopicProposals.tsx` — wekelijkse email met top-5 voorstellen
- `test/unit/agents/topicSuggester.test.ts`
- `.github/workflows/weekly-topic-suggester.yml`

**Files to modify:**
- `src/config/topics.ts` — voeg `"proposed"` toe aan `TopicStatus` enum + UI/CLI om proposed → queued te verschuiven (`scripts/approve-topic.ts`)
- Tenant config: `topic_suggester.competitor_domains: [...]`, `topic_suggester.max_proposals_per_week: 5`

**Approach:**

**Inputs (per week):**
1. **Competitor sitemaps**: lijst van 5-10 concurrenten in tenant config. Fetch hun sitemap, dedupliceer tegen vorige week's snapshot, krijg "nieuwe" posts.
2. **GSC rising queries**: queries waarvoor de site al in top-50 staat maar groeiende impressions heeft, en waar de site geen specifiek artikel voor heeft.
3. **Bestaande queue**: topics waar status = `queued` of `published` (om duplicates te voorkomen).

**Pipeline:**
1. Aggregeer alle inputs.
2. Topic-suggester agent scoort elke kandidaat op:
   - Relevantie tot tenant pillars
   - Niet-overlap met bestaande queue
   - SERP-difficulty estimate (uit competitor SERP samples — out of scope hier; eerst zonder)
   - Strategic value (niche, trending, defensief)
3. Output top-N (default 5) als `TopicProposal` objecten met `id`, `title`, `pillar`, `target_keyword`, `intended_word_count`, `priority_suggestion`, `rationale`.
4. Append met `status: "proposed"` aan `topics.yaml`.
5. Email redactie de 5 voorstellen, met "approve" CTA-link (kan later naar admin-UI; eerst handmatig YAML-edit).

**Approval flow:**
- Manual: edit `topics.yaml`, set `status: queued`. Commit.
- (Future) `scripts/approve-topic.ts <id>` of admin-UI.

**Test strategy:**
- Unit test elke input-bron.
- Integration test full job met mocked external calls.

**Open questions:**
- Competitor lijst: wie zijn de 5-10 voor Artifation? → User-input nodig.
- SERP-difficulty zonder paid tool (Ahrefs/Semrush): kan via scraping van Google SERP, maar dat is fragile + tegen ToS. → V1: skip, gewoon LLM-judgment.
- Proposed-status pollutie: als suggester elke week 5 nieuwe gooit en redactie keurt 1 goed, na 6 maanden heb je 100+ proposed. → Auto-expire na 4 weken: `status: proposed_expired`.

---

## Per-fase: feature-flag schema

Elke fase voegt een config-key toe aan tenant config. Voorstel:

```yaml
# tenants/<slug>/config.yaml — nieuwe top-level sectie
features:
  internal_linker:
    enabled: false
    max_links_per_run: 10
    lookback_posts: 50
    exclude_post_ids: []
  citation_check: { enabled: true, retry_on_failure: true }
  reading_level:
    enabled: true
    targets:
      ai-per-afdeling: { min: 50, max: 70 }
  ai_detection: { enabled: true, threshold_max_ai_pct: 30, provider: "gptzero" }
  schema_markup: { enabled: true }
  schema_validator: { enabled: false }   # local-only initially
  image_seo: { enabled: true }
  indexnow: { enabled: true }
  anchor_tracker: { enabled: true, max_exact_match_per_url: 3 }
  repurposer:
    enabled: false
    targets: []
  search_console:
    enabled: false
    property_url: "sc-domain:artifation.nl"
  topic_suggester:
    enabled: false
    competitor_domains: []
    max_proposals_per_week: 5
```

Schema-uitbreiding in `src/config/tenant.ts` per fase incrementeel.

---

## Self-Review

**Spec coverage:** Alle 12 features uit user-input zijn geadresseerd:

| User input | Phase |
|---|---|
| 1. JSON-LD schema generator | 3 |
| 2. Search Console-integratie | 8 |
| 3. IndexNow / Bing / Yandex ping | 5 |
| 4. Reverse internal-linker (HOGE PRIO) | 1 |
| 5. Anchor-tekst rotatie tracker | 6 |
| 6. Image-SEO | 4 |
| 7. Schema-validator | 3 |
| 8. Repurposer | 7 |
| 9. Citation-fetcher | 2.1 |
| 10. Reading-level enforcer | 2.2 |
| 11. AI-detection guard | 2.3 |
| 12. Topic-suggester | 9 |

**Placeholder scan:** Bewuste open questions per fase zijn duidelijk gemarkeerd in `Open questions` secties — die zijn intentioneel, geen plan-failures. Geen "TBD"/"TODO"/"implement later" als placeholder voor concrete acties.

**Type consistency:** Cross-fase referenties:
- `RubricSignals` (Phase 2.2 breidt uit, Phase 6 voegt anchor-data) — wordt incrementeel uitgebreid, niet hernoemd
- `Topic` (Phase 9 voegt `"proposed"` status toe) — alleen enum-uitbreiding, bestaande code blijft werken
- `WordpressClient` (Phase 1 + 4 voegen methods toe) — interface uitgebreid, niet vervangen

**Externe dependency-volgorde:** Phase 9 hangt expliciet af van Phase 8 (GSC-data). Phase 6 levert input voor Phase 1's anchor-keuzes — Phase 1 kan ook eerder dan Phase 6, in welk geval de internal-linker zonder anchor-history werkt (acceptabel). Geen circulaire deps.

**Cost-impact:** Per-publish kosten stijgen door Phase 2 (~$0.02 voor citation + AI-detection) en Phase 3 (~$0.005 voor schema-validator). Per-week extra job-kosten: Phase 1 ~$0.30, Phase 8/9 ~$0.10. Totaal: ~€0.20/post → ~€0.25/post (+15%); jaarlijkse jobs ~€20.

**Plan complete.**
