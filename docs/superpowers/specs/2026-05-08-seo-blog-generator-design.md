# SEO Blog Generator — Design Document

**Date:** 2026-05-08
**Tenant (v1):** Artifation B.V. (artifation.nl)
**Status:** Draft — pending user review

---

## 1. Doel & context

### 1.1 Probleem
Artifation heeft een WordPress-site (artifation.nl) met 12 bestaande blogposts, allemaal gepubliceerd in een bulk-batch op 13 februari 2026. De eigenaar oordeelt dat ze niet sterk zijn voor SEO. Sindsdien is er geen nieuwe content meer geplaatst. De site target Nederlandse MKB-eigenaren die met AI willen beginnen maar niet weten waar — een commercieel waardevolle, matig competitieve niche.

### 1.2 Wat we bouwen
Een geautomatiseerde, multi-agent blog-generator die op een gehoste cron:

1. Een topic uit een geprioriteerde queue pakt.
2. Door een 5-agent editorial pipeline schrijft (Researcher → Strategist → Writer → SEO Editor → Fact-Checker).
3. Een 6e agent (Quality Judge) scoort de draft tegen een numerieke rubric.
4. Bij score ≥ 8,0: blog + featured image + SEO-meta worden als **concept** in WordPress geplaatst, en een email gaat naar `algemeen@artifation.nl`.
5. Bij score < 8,0: alleen email met rejected-draft + reden. Niets verschijnt op de site.
6. De eigenaar drukt zelf op "Publiceren" in WordPress.

### 1.3 Ontwerp-principe
**Wat het allerbeste is voor SEO** is het enige criterium dat telt. De kalender bepaalt niet wat live gaat — een kwaliteits-rubric wel. Realistische output: 2-4 posts/week passen de gate, de rest sneuvelt. Dat is het hele punt.

### 1.4 Niet-doelen (v1)
- Geen audit, upgrade of pruning van bestaande 12 blogs (eigenaar-keuze).
- Geen auto-publish (alles blijft concept).
- Geen web-UI / dashboard. Configuratie via YAML + git.
- Geen DB. State zit in repo-bestanden.
- Geen automatische topic-discovery (queue is handmatig gevuld; later uitbreidbaar).
- Geen meerdere talen. NL-only voor v1; multi-tenant config heeft wel `language` veld klaar.
- Geen analytics-feedback-loop (later: ranking-data via GSC API).

---

## 2. Onderzoeksbasis (samenvatting)

Drie research-rapporten zijn opgesteld bij de start van dit ontwerp. Sleutelbevindingen die de architectuur vormen:

**Google AI Overviews & SGE (mei 2026):**
- Optimalisatie verschuift van "ranking" naar "citeerbaar zijn".
- Gewogen citatie-correlatie: organisch top-10 (40-76%), verifieerbare specifieke feiten (40%+ lift), <3 jaar oud (~85% van citaties).
- Best-practice: **self-contained chunks van 134-167 woorden** per H2 — onafhankelijk citeerbaar.
- Ahrefs 1M-SERP-studie: 87,8% van geciteerde pagina's is mixed mens+AI; pure AI 3,6%, pure mens 8,6%. **Google penaliseert AI-authorship niet — wel scaled-thin-content.**

**E-E-A-T na maart-2026 core update:**
- Productiemethode irrelevant. Helpfulness, originaliteit, eerstehands-Experience zijn alles.
- HCU-recovery-cases: 70% recovery door reframing "generic how-to" → "wat we deden, wat fout ging".
- Ban op generieke "comprehensive but generic" content; rewards voor specifiek + first-hand + originele data.

**Cadans-evidence:**
- Search Engine Land 16-maanden experiment: 2.000 AI-artikelen op nieuwe domeinen → 1.381 clicks totaal. 97% gedrop uit top-100 in maand 3.
- Sustainable pattern voor kleine sites: 2-4 hoge-kwaliteit posts/maand, gehouden voor 6+ maanden.
- "1 grote post / 3 dagen" verslaat "1 middelmatige / dag" in alle HCU-recovery cases.

**NL-keyword landschap:**
- Grootste open cluster: **"AI per afdeling"** (HR/finance/sales/marketing/inkoop/ops). Niemand bezit dit in NL. KD 20-30.
- Snel cresscing: **AI Act / EU compliance** voor MKB. Alleen AIComplianceHub.nl claimt dit nu. Deadline 2 augustus 2026.
- Long-tail sector-extensie (horeca, transport, accountancy, advocatuur). KD 15-25.
- Auteur-byline + Person-schema bijna afwezig bij NL-concurrenten — instant E-E-A-T-edge.

**Tech-stack pricing (mei 2026):**
- Claude Sonnet 4.6: $3/$15 per M tokens (in/out).
- Claude Haiku 4.5: $1/$5.
- Claude Opus 4.7: $5/$25.
- Gemini 2.5 Pro: $1,25/$10.
- Fal.ai Flux 1.1 Pro Ultra: $0,06/image.
- Resend: 100/dag gratis permanent.
- GitHub Actions free private: 2.000 min/maand.

---

## 3. High-level architectuur

```
                         [GitHub Actions cron, dagelijks 04:15 UTC]
                                          │
                                          ▼
              ┌───────────────────────────────────────────────┐
              │  Topic Selector  ──  picks 1 topic from queue │
              │  (rotation: pillar A / B / C round-robin)     │
              └───────────────────────────────────────────────┘
                                          │
                                          ▼
                   ┌────── Editorial Mesh (5 agents) ────────┐
                   │  Researcher  →  Strategist  →  Writer   │
                   │       ↓             ↓            ↓      │
                   │     bronnen      outline+H-tree  draft  │
                   │                  +chunk-plan            │
                   │                       ↓                 │
                   │              SEO Editor (Haiku 4.5)     │
                   │                       ↓                 │
                   │              Fact-Checker (Opus 4.7)    │
                   └─────────────────────────────────────────┘
                                          │
                                          ▼
                            ┌──────────── 6e agent ──────────┐
                            │  Quality Judge (rubric 0-10)   │
                            │  ≥ 8.0 → continue              │
                            │  < 8.0 → reject + email reason │
                            └────────────────────────────────┘
                                          │ (passed)
                                          ▼
                ┌─────── Image Pipeline ────────┐
                │  Image Prompter → Fal.ai Flux │
                │  → upload to /wp-json/media   │
                └───────────────────────────────┘
                                          │
                                          ▼
                ┌─────── WordPress Publisher ──────────┐
                │  POST /wp-json/wp/v2/posts            │
                │  status=draft + featured_media        │
                │  + Rank Math meta via API Manager     │
                │  + Article+Person+Organization JSON-LD│
                └───────────────────────────────────────┘
                                          │
                                          ▼
                ┌─────── Email Notification (Resend) ───┐
                │  HTML preview + 1-click WP-edit link  │
                │  + rubric score breakdown             │
                └───────────────────────────────────────┘
```

**Hosting**: GitHub Actions runners (Ubuntu, gratis Ubuntu-VM, max 6h per job), getriggerd via een YAML-workflow met `cron`-schedule. Repo is **private**. Geen eigen server, geen Vercel, geen VPS. Bij 1 run/dag van ~10 min: ~300 minuten/maand, ruim binnen het 2.000 min/maand free-tier voor private repos. Een dagelijkse cron telt als activity, dus 60-day auto-disable is geen risico.

**Externe diensten** vanaf de runner:
- Anthropic API (Sonnet, Haiku, Opus)
- Google Gemini API (Researcher)
- Groq API (Image Prompter)
- Fal.ai API (image generation)
- Resend API (email)
- `https://artifation.nl/wp-json/...` (post + media + meta)

---

## 4. Multi-agent pipeline

### 4.1 Agent-rollen & verantwoordelijkheden

| # | Agent | Model | Input | Output | Faalmodus |
|---|---|---|---|---|---|
| 1 | **Researcher** | Gemini 2.5 Pro | topic, target_keyword, sitemap-snapshot | bronnenlijst (5-10 URLs met excerpts), entiteitlijst, fan-out subqueries, top-10 SERP samenvatting | retry 1× bij empty result |
| 2 | **Strategist** | Sonnet 4.6 | research-output, brand-guide | H-tree outline, chunk-plan (134-167 wd per H2), internal-link-targets, anchor-distributie, schema-keuze | reject als < 5 H2 |
| 3 | **Writer** | Sonnet 4.6 | outline, brand-voice, ban-list | draft 1.500-2.500 wd, NL "je"-vorm, TL;DR-block bovenaan, gechunkte H2's, contrarian opinion | self-reflection-loop max 2× als eigen score < 7 |
| 4 | **SEO Editor** | Haiku 4.5 | draft, SEO-checklist | gecorrigeerde draft, meta-title (≤60 ch), meta-desc (≤155 ch), slug, internal links injected, alt-texts, anti-cliché check | hard-fix klassieke AI-clichés |
| 5 | **Fact-Checker** | Opus 4.7 | draft, bronnenlijst | claim-list met bron-mapping, verzonnen claims geflagd | reject als > 0 onverifieerbare claims |
| 6 | **Quality Judge** | Opus 4.7 | gecorrigeerde draft + alles ervoor | rubric-score (0-10 per dimensie + gewogen totaal), GO/NO-GO + reden | NO-GO triggert reject-email, geen WP-publish |
| 7 | **Image Prompter** | Haiku 4.5 (of Groq Llama) | draft, brand-style | image prompt, alt-text, filename | n.v.t. |
| 8 | **Image Generator** | Fal.ai Flux 1.1 Pro Ultra | prompt | 1024×1024 PNG | retry 2×; fallback Cloudflare Workers AI Flux 2 [klein] |
| 9 | **WordPress Publisher** | (geen LLM) | alle assets | post_id van concept, media_id | retry 3× exponential backoff |
| 10 | **Notifier** | (geen LLM) | post_id, rubric, draft, status | HTML email via Resend | retry 3× |

### 4.2 Reflection-loop op de Writer
Maximaal 2 iteraties: na elke draft beoordeelt de Writer zichzelf tegen een mini-rubric (originaliteit, voice, structuur). Bij self-score < 7 → herschrijf. Hard cap voorkomt oneindige kostenexplosie.

### 4.3 Originaliteits-requirement
Elke draft moet minimaal één concreet originaliteits-element bevatten:
- Eigen mini-experiment ("we testten X met Y workflow") OF
- Eigen rekenvoorbeeld met cijfers OF
- NL-casus / klantvoorbeeld OF
- Contrarian opinion-paragraaf OF
- Eigen vergelijkingstabel.

Afwezigheid → automatische reject door Quality Judge (score < 6 op originaliteit-dimensie = hard fail).

---

## 5. Quality Judge — rubric

Score 0-10 per dimensie, gewogen totaal moet **≥ 8,0** zijn om de gate te passeren.

| Dimensie | Gewicht | Wat wordt gemeten |
|---|---|---|
| **Semantic completeness** | 20% | Beantwoordt H2 z'n sub-vraag volledig in 134-167 wd zonder paginacontext? AIO-citation-readiness. |
| **Originaliteit** | 25% | Aanwezig: ≥1 origineel data-element, voorbeeld of contrarian opinion. **Hard fail < 6.** |
| **Anti-AI-cliché** | 15% | Banlist-check, em-dash-overuse, tricolons, uniforme paragraaflengte. Burstiness-test. |
| **Fact-check** | 15% | Alle harde claims terug te vinden in bronnen. **Hard fail bij verzonnen claim.** |
| **SEO-tech** | 10% | Meta-title/desc lengte, slug, alt-texts, ≥3 internal links, schema-validiteit, focus-keyword density 0,5-1,5%. |
| **Brand-voice** | 10% | NL "je"-vorm, Artifation-toon (informeel-direct, problem-first, ROI-focus). |
| **Readability** | 5% | Flesch-NL-score, paragraaf-burstiness (mix korte + lange), zinslengte-spreiding. |

**Hard fails** (één is genoeg om reject te triggeren, ongeacht totaal):
- Originaliteit-dimensie < 6
- Verzonnen claim gedetecteerd door Fact-Checker
- Banlist-hit > 3 per 1.000 woorden

**AI-cliché ban-list (initieel)**:
- "in conclusion", "to sum up", "tot slot", "samenvattend"
- "in een wereld waar", "in today's fast-paced"
- "delve into", "leverage", "harness the power of", "unlock the potential"
- "moreover", "furthermore", "additionally", "notably", "it's worth noting"
- "in de steeds veranderende wereld van"
- Em-dash-density > 1 per 300 woorden

Banlist is per-tenant configureerbaar in `tenants/<slug>/config.yaml`.

---

## 6. Topic-strategie

### 6.1 Topic-queue
Een YAML-bestand `tenants/artifation/topics.yaml` met geprioriteerde topics. Elke run:
1. Pick top topic met `status: queued`.
2. Markeer `status: in_progress` + `last_attempted` timestamp.
3. Na pipeline: zet status naar `published` (rubric pass) of `rejected` (rubric fail).
4. Rejected topics gaan onderaan terug met een `retry_after` timestamp (default +7 dagen).

Wijzigingen via PR (jij vult queue zelf aan, of een toekomstige Researcher-agent vult automatisch aan).

### 6.2 Cannibalization-prevention
Topic Selector haalt elke run de live sitemap van artifation.nl op. Vergelijkt het `target_keyword` van het gekozen topic met:
- Bestaande blog-slugs (kebab-case match op kern-tokens van het keyword)
- Bestaande blog-titles uit sitemap-data

Bij overlap (focus-keyword komt voor in een bestaande slug óf >50% woord-overlap met een bestaande titel) → topic wordt geskipped + status `cannibalization_skipped` + email "topic conflict, rotated to next". Embeddings-gebaseerde semantic similarity is een potentiële post-v1 verbetering, niet voor v1.

### 6.3 Initiële topic-queue (eerste 12 weken)

**Pillar A — "AI per afdeling"** (focus eerste 6 weken — grootste open NL-gap):
1. Welke AI past bij welke afdeling? (PILLAR, 3.000+ wd)
2. AI in HR: van vacature tot exitgesprek
3. AI in finance: facturatie, debiteuren, forecasting
4. AI in sales: lead scoring & follow-up automatisering
5. AI in marketing: contentproductie & SEO voor MKB
6. AI in inkoop: leveranciersanalyse & contractcheck
7. AI in customer service: chatbots & e-mail triage
8. AI in operations: voorraad & planning

**Pillar B — "AI Act & compliance voor MKB"** (deadline 2 augustus 2026):
1. EU AI Act voor MKB: complete gids 2026 (PILLAR, 3.000+ wd)
2. AI-register opzetten in 1 dag
3. AI-policy template voor MKB
4. AI-geletterdheid: training voor je team
5. Welke AI-tools zijn AVG-proof?
6. AI Act-boetes voor MKB

**Pillar C — Sector-extensie** (Artifation's home turf):
1. AI voor accountants
2. AI voor advocaten en notarissen
3. AI voor horeca
4. AI voor transport & logistiek

Per topic worden in YAML genoteerd: `target_keyword`, `pillar`, `intended_word_count`, `status`, `priority`.

### 6.4 Rotation
Topic Selector pakt het hoogst-geprioriteerde queued topic. Bij gelijke prioriteit: round-robin over de drie pillars (gewichten in config: A=50%, B=30%, C=20% voor v1).

### 6.5 Weekly publish-cap
`max_posts_per_week_published` (default 4) is een hard plafond op het aantal *gepubliceerde* concepten per ISO-week. Wanneer bereikt:
- De pipeline draait nog wél (Researcher → Writer → Judge), zodat we kwaliteitsdata blijven verzamelen.
- Bij rubric-pass wordt het concept **niet** in WordPress gezet, en geen success-email verstuurd.
- In plaats daarvan: email type "📦 Cap bereikt — draft bewaard" met de volledige draft als HTML-bijlage. Het topic gaat terug in de queue met status `cap_deferred` en hoge prioriteit voor de volgende week.
- Reject-emails (rubric-fail) blijven gewoon binnenkomen zoals normaal. De cap geldt alleen voor publicatie, niet voor rejects.

---

## 7. Per-post output specificatie

### 7.1 Inhoud (Gutenberg HTML)
- **TL;DR-block** bovenaan: één-zin antwoord (≤160 tekens) + 134-woord samenvatting in eigen `<div class="tldr">`. Citeerbaar door AI Overviews.
- **5-9 H2-secties**, elk 134-167 woorden, self-contained.
- **Sub-H3** waar nuttig.
- Per H2: minstens 1 concrete invulling (getal, voorbeeld, NL-casus).
- **Originaliteits-element**: minstens 1 (zie 4.3).
- **Internal links**: ≥3 naar bestaande pagina's/blogs van artifation.nl.
- **External links**: 2-4 naar autoritatieve NL/EU bronnen (RVO, AP, Europese Commissie, NLdigital, Frankwatching, Marketingfacts).
- **Conclusie**: GEEN "in conclusion / tot slot". In plaats daarvan: 1 concrete next-step CTA naar `/ai-scan/` of `/contact/`.
- **FAQ-block** (optioneel): 3-5 vragen mét FAQ-schema.

### 7.2 Meta-data (via Rank Math API Manager)
- `rank_math_title` (≤60 tekens, focus keyword + brand)
- `rank_math_description` (≤155 tekens, focus keyword + value prop + CTA-werkwoord)
- `rank_math_focus_keyword`
- `rank_math_canonical_url`
- Slug (kebab-case, ≤6 woorden, focus keyword vooraan)

### 7.3 Schema.org JSON-LD (via Rank Math)
- `BlogPosting` met author = Person
- `Organization` (Artifation B.V., KvK, BTW)
- `BreadcrumbList`
- `FAQPage` als FAQ-block aanwezig

### 7.4 Featured image
- 1024×1024 PNG, geüpload via `/wp-json/wp/v2/media`.
- Alt-text in NL, beschrijvend, focus-keyword licht verwerkt.
- WordPress comprimeert/converteert zelf naar WebP via geïnstalleerde optimalisatie-plugin.

---

## 8. Tech-stack

| Laag | Keuze | Waarom |
|---|---|---|
| Cron host | GitHub Actions, schedule `15 4 * * *` UTC | Enige gratis met 6h job-cap; secrets first-class; private repo geeft 2.000 min/mnd |
| Repo zichtbaarheid | **Private** | Geen externe inzage in code/prompts/topics |
| Runtime | Node.js 20 + TypeScript, `tsx` voor scripts | Standaard, goede SDK-ondersteuning |
| LLM SDK's | `@anthropic-ai/sdk`, `@google/generative-ai`, `groq-sdk` | Multi-provider via abstraction-laag |
| Researcher | Gemini 2.5 Pro | Cheap input, 1M context |
| Strategist + Writer | Claude Sonnet 4.6 | Beste NL-prose op deze prijs |
| SEO Editor | Claude Haiku 4.5 | Snel, regel-volgend, goedkoop |
| Fact-Checker + Quality Judge | Claude Opus 4.7 | Reasoning-zwaar, kleine inputs |
| Image | Fal.ai Flux 1.1 Pro Ultra | $0,06/img, beste editorial-kwaliteit |
| Email | Resend + `react-email` template | 100/dag free permanent; verifieer `artifation.nl` voor DKIM/SPF |
| WordPress | `/wp-json/wp/v2/*` + Application Password + Rank Math API Manager plugin | Standaard 2026 best-practice |
| State / queue | YAML/JSON-bestanden in `data/` directory | Geen DB; commits zijn audit-log |
| Secrets | GitHub Actions Secrets | First-class, geen .env in repo |
| Logging | Structured JSON naar Actions output + per-run log artifact (30d retention) | Debugging zonder eigen infra |
| Tests | Vitest, mock LLM-responses voor unit, opt-in integration met real-API-flag | TDD-vriendelijk |

### 8.1 Geschatte kosten per gepubliceerde post
±€0,17 (LLM-mix Gemini Pro research → Sonnet draft → Haiku edit → Opus fact-check + Flux Pro Ultra image).

Bij 3 posts/week gepubliceerd + 4/week reject = **±€2-3/maand**.

### 8.2 Required secrets
```
ANTHROPIC_API_KEY
GEMINI_API_KEY
GROQ_API_KEY
FAL_API_KEY
RESEND_API_KEY
WP_USER                  # bv. "agent-blog"
WP_APP_PASSWORD          # WordPress Application Password
```

---

## 9. Multi-tenant config (architecturaal klaar, alleen Artifation in v1)

### 9.1 Per-tenant config: `tenants/<slug>/config.yaml`

```yaml
slug: artifation
domain: artifation.nl
language: nl-NL

brand:
  name: Artifation
  voice: "informeel-direct, jij/jouw, problem-first, ROI-focus"
  ban_list:
    - "in conclusion"
    - "in een wereld waar"
    - "delve"
    - "leverage"
  signature_phrases:
    - "Wij kijken verder dan de hype"
    - "De kortste weg naar een schaalbaar bedrijf"

author:
  name: "<naam>"
  linkedin: "<linkedin url>"
  bio: "<bio>"
  photo_url: "<https://artifation.nl/...>"

organization:
  legal_name: Artifation B.V.
  kvk: "<kvk>"
  btw: "<btw>"
  address: "<adres>"

wordpress:
  base_url: https://artifation.nl
  user_secret_ref: WP_USER
  app_password_secret_ref: WP_APP_PASSWORD

email:
  from: blog-bot@artifation.nl
  to: algemeen@artifation.nl
  reply_to: algemeen@artifation.nl

pillars:
  - id: ai-per-afdeling
    weight: 0.5
  - id: ai-act
    weight: 0.3
  - id: sector-extensie
    weight: 0.2

quality_threshold: 8.0
max_posts_per_week_published: 4
```

### 9.2 Nieuwe tenant toevoegen
1. Nieuwe directory `tenants/<slug>/` met `config.yaml`, `topics.yaml`, optioneel `prompts/` voor overrides.
2. Tenant-specifieke secrets in GitHub Actions Secrets (suffix met tenant-slug).
3. GitHub Actions workflow gebruikt een matrix-strategie: één job per tenant.

Pipeline-code blijft identiek; alle tenant-specifiek gedrag vloeit uit config + prompts.

---

## 10. Email-flow (Resend)

Drie email-types, alle naar `algemeen@artifation.nl`:

### Type 1 — "✅ Concept klaar voor review" (rubric ≥ 8,0)
- Subject: `[Artifation] Concept #<n>: <titel> — score <x.x>`
- Body: rubric-breakdown tabel, TL;DR + eerste H2-preview, featured image preview, knop "Open in WordPress (concept)" → `wp-admin/post.php?post=<id>&action=edit`, knop "Bekijk live preview", target keyword, gemaakte internal links.

### Type 2 — "❌ Reject — draft viel onder de drempel" (rubric < 8,0)
- Subject: `[Artifation] Reject: <titel> — score <x.x> (<dimensie> faalde)`
- Body: rubric-breakdown, hard-fails getriggerd, **volledige draft als HTML attachment** (zodat eigenaar zelf kan redden), Strategist-outline, Judge-suggesties.

### Type 3 — "⚠️ Pipeline error" (technische faal)
- Subject: `[Artifation] Pipeline-fout op <date>`
- Body: stage waarin het misging, error-message, link naar GitHub Actions run.

---

## 11. Failure handling

| Faal | Gedrag |
|---|---|
| LLM-API down (Anthropic/Gemini/Groq) | Retry 3× exponential backoff (1s/4s/16s); na 3× → fallback alt-provider voor die rol; na alle fallbacks → email type-3 |
| Fal.ai down | 2× retry. Optionele fallback: Cloudflare Workers AI Flux 2 [klein] mits `CF_ACCOUNT_ID` + `CF_API_TOKEN` secrets aanwezig. Anders: post wordt aangemaakt zonder featured image + email vlagt "image-fallback nodig". |
| WordPress REST 5xx | 3× retry; na faal → email met draft als bijlage voor handmatige plaatsing |
| Rate-limit op een provider | Pause + retry na 60s |
| Quality Judge: 3 opeenvolgende rejects | Pipeline pauzeert zichzelf; email "drempel mogelijk te hoog of prompts kapot — review nodig" |
| Topic queue leeg | Email "queue is leeg, voeg topics toe" |
| Cost-spike (LLM-uitgaven > €15 in 7 dagen, gemeten via JSON-counter per run) | Pipeline pauzeert; email-alert |

---

## 12. Repo-layout

```
blog/
├── .github/
│   └── workflows/
│       └── daily-blog.yml          # cron 04:15 UTC
├── src/
│   ├── agents/
│   │   ├── researcher.ts
│   │   ├── strategist.ts
│   │   ├── writer.ts
│   │   ├── seo-editor.ts
│   │   ├── fact-checker.ts
│   │   ├── quality-judge.ts
│   │   ├── image-prompter.ts
│   │   └── prompts/                # default system prompts (per tenant override mogelijk)
│   ├── llm/
│   │   ├── client.ts               # provider-agnostic interface
│   │   ├── anthropic.ts
│   │   ├── gemini.ts
│   │   └── groq.ts
│   ├── image/
│   │   ├── fal.ts
│   │   └── cloudflare-fallback.ts
│   ├── wordpress/
│   │   ├── client.ts               # auth + REST helpers
│   │   ├── media.ts                # upload featured image
│   │   ├── posts.ts                # create draft
│   │   └── meta.ts                 # Rank Math via API Manager
│   ├── email/
│   │   ├── resend.ts
│   │   └── templates/              # success / reject / error
│   ├── pipeline/
│   │   ├── orchestrator.ts         # main entrypoint
│   │   ├── topic-selector.ts
│   │   ├── rubric.ts               # quality scoring helpers
│   │   ├── cost-tracker.ts
│   │   └── state.ts                # queue read/write, atomic commits
│   ├── config/
│   │   └── tenant.ts               # YAML loader + zod schema
│   └── types.ts
├── tenants/
│   └── artifation/
│       ├── config.yaml
│       ├── prompts/                # tenant-specific overrides (optioneel)
│       └── topics.yaml             # topic queue
├── data/                           # per-run logs, gecommit
├── test/
│   ├── unit/
│   └── integration/
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-05-08-seo-blog-generator-design.md   # dit document
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── .gitignore
```

**Entrypoint**: `tsx src/pipeline/orchestrator.ts --tenant=artifation`. Eén commando, alles loopt.

---

## 13. Veiligheid & privacy

- Repo is private; alleen expliciet uitgenodigde collaborators zien code, prompts, topic-queue.
- WordPress-toegang via dedicated `agent-blog` Editor-user (niet admin), met Application Password.
- Application Password is niet hetzelfde als account-password; revoke is mogelijk zonder admin-account te raken.
- Alle secrets in GitHub Actions Secrets, nooit in code/repo.
- API-calls uitsluitend via HTTPS.
- Geen persoonsgegevens van klanten gaan door de pipeline (alle content is publiek-georiënteerd).

---

## 14. Open vragen / aandachtspunten voor implementatie-fase

Deze blijven over voor de implementatie-plan-fase, niet voor de spec:

- Welke WordPress-user precies aanmaken (naam/rol/Editor-rechten op posts).
- Of Rank Math API Manager plugin handmatig wordt geïnstalleerd op artifation.nl, of dat het Yoast-equivalent (Airano MCP SEO Bridge) gebruikt wordt — afhankelijk van welke SEO-plugin Artifation nu draait. Dit moet bij implementatie eerst geverifieerd worden.
- Initiële auteur-data invullen (naam, foto, LinkedIn, bio) in `config.yaml`.
- KvK + BTW + adres invullen voor Organization-schema.
- Resend-account aanmaken + DNS-records toevoegen aan artifation.nl voor DKIM/SPF.
- Verifiëren of Artifation-WordPress een image-optimalisatie-plugin draait (anders moeten we PNG → WebP conversie zelf doen).

---

## 15. Acceptatie-criteria voor v1

De build is "klaar voor productie" als:

1. Een volledige pipeline-run (Artifation, 1 topic uit queue) doorloopt zonder handmatig ingrijpen op GitHub Actions.
2. Bij rubric-pass verschijnt een correcte concept-post in WordPress met featured image en Rank Math meta.
3. Bij rubric-fail wordt geen post aangemaakt, maar wel een reject-email ontvangen.
4. Alle drie email-types renderen correct in Gmail (visueel en met werkende links).
5. Failure-modes uit §11 zijn handmatig getest (LLM-down gesimuleerd, WP-down gesimuleerd, queue leeg, cost-spike).
6. End-to-end kosten van één gepubliceerde post liggen ≤ €0,30.
7. Code-coverage op pipeline-orchestration ≥ 70% (unit), 1 integration-test draaiend met opt-in flag.
8. README documenteert: setup, secrets aanmaken, lokaal draaien, tenant toevoegen.
