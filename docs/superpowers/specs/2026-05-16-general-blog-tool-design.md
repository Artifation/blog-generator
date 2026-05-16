# General Blog Tool — Design

**Datum:** 2026-05-16
**Status:** in uitvoering (user said "ga door zonder clarifying questions")
**Auteur:** Claude (Opus 4.7), op verzoek van Julian Dunsbergen.

## Doel

Van de bestaande Artifaction-specifieke blog-generator een **algemeen
inzetbare blogtool** maken: iedere gebruiker kan een eigen site
configureren en hoogwaardige blogs laten genereren zonder ooit WordPress
te hoeven openen. De pipeline-kwaliteit van vandaag (multi-agent
researcher → strategist → writer → seoEditor → factChecker → qualityJudge →
imagePrompter) blijft het hart. Wat erbij komt is een webapp die alle
configuratie en moderatie via een GUI doet.

## Niet-doelen (voor deze iteratie)

- Multi-user / team-accounts / RBAC.
- Hosted SaaS met billing.
- Migratie van álle bestaande tenants in één klap.
- Wijzigingen aan de agents zelf — die blijven onaangeraakt.

## Aannames (kunnen worden bijgestuurd)

1. Eén gebruiker draait dit lokaal of op een eigen VPS — geen multi-tenant SaaS-isolatie.
2. WordPress moet **optioneel** worden: built-in publishing (server-side gerenderde blog op de webapp zelf) is de default, WordPress een plugin.
3. UI in het Engels neemt aan dat gebruikers internationaal zijn; brand-voice / generated content blijft per site in eigen taal (default `nl-NL`).
4. SQLite is goed genoeg — geen Postgres tot multi-user nodig is.
5. "Tenant" → "Site" in de UI. In code blijven `tenantSlug` parameters voor backwards compat.

## Architectuur

```
ALGEMEEN_BLOG/
├── apps/
│   └── web/                    # NEW — Next.js 15 App Router GUI
│       ├── app/
│       │   ├── (dashboard)/    # Authenticated app shell
│       │   │   ├── sites/      # Site list, onboarding, settings
│       │   │   ├── topics/     # Topic queue per site
│       │   │   ├── drafts/     # Draft review
│       │   │   └── runs/       # Run history / logs
│       │   ├── (public)/
│       │   │   └── [site]/     # Built-in CMS rendering
│       │   └── api/            # Server routes (cron trigger, webhook)
│       ├── lib/
│       │   ├── db/             # Drizzle schema + queries
│       │   ├── pipeline/       # Wrapper that calls existing src/pipeline
│       │   └── publish/        # Destination adapters (built-in, WP, md)
│       └── components/         # shadcn/ui-based UI
├── src/                        # EXISTING — pipeline & agents (unchanged)
├── tenants/                    # EXISTING — YAML still works (import-only)
└── data/
    └── app.db                  # SQLite — sites, topics, drafts, runs
```

## Data Model (SQLite via Drizzle)

```ts
sites:        id, slug, name, domain, language, brand_voice, ban_list (json),
              signature_phrases (json), reading_level_min, reading_level_max,
              quality_threshold, max_posts_per_week, schedule_cron,
              publish_destination (built_in|wordpress|markdown),
              wordpress_config (json|null), email_config (json),
              api_keys (json, encrypted at rest), author (json),
              organization (json), features (json),
              created_at, updated_at

pillars:      id, site_id, slug, name, weight

topics:       id, site_id, title, target_keyword, pillar_id, intent,
              intended_word_count, priority, status, retry_after,
              reject_reason, wp_post_id, post_url, key_entities (json),
              proposed_at, proposal_source, proposal_rationale,
              created_at, updated_at

drafts:       id, site_id, topic_id, run_id, status (pending_review|approved|rejected|published),
              title, slug, content_html, meta_title, meta_description,
              tldr, image_url, image_alt, rubric_scores (json),
              hard_fails (json), cost_usd, created_at, reviewed_at

runs:         id, site_id, topic_id, started_at, finished_at,
              verdict, weighted_total, hard_fails (json), reason,
              cost_usd, stages (json — per-stage timing)

published_posts: id, site_id, draft_id, slug, title, content_html,
              meta_title, meta_description, image_url, published_at
```

YAML-configs blijven werken: een `npm run import:yaml` script leest bestaande tenants en seedt SQLite.

## UI / Flows

### Onboarding wizard (5 stappen)
1. **Basics** — site naam, slug, domein, taal.
2. **Brand voice** — voice (free text), tone presets, ban list, signature phrases.
3. **Content pillars** — 1–5 pillars met weight (auto-normalize naar 1.0).
4. **Quality & schedule** — quality threshold, max posts per week, cron.
5. **Publishing** — destination kiezen: built-in (default), WordPress (toont creds-form), markdown export.

Aan het eind: API-keys invoeren (Anthropic, Gemini, Groq, Fal.ai, Resend).

### Dashboard
- Site-list met snelle stats (posts deze week, queue size, last run verdict).
- Per site: tabs **Topics** / **Drafts** / **Published** / **Runs** / **Settings**.

### Topics-tab
- Tabel met queue. Sortable, filterable.
- "Add topic" form. Bulk-import CSV.
- Drag-to-reorder priority.
- Per topic: status badge, "Generate now" button.

### Drafts-tab
- Card per draft met preview, score breakdown, hard-fails.
- Open draft → split view: rendered preview links, editor rechts (`@tiptap/react` of simpele Textarea voor HTML).
- Buttons: **Approve & Publish**, **Reject**, **Regenerate**.

### Settings-tab
- Vier subsecties (Brand / Pillars / Quality & Schedule / Publishing / API keys), elk in een Card.
- Inline edit met optimistic save.

### Built-in CMS
- `/{site-slug}/` toont index van published posts.
- `/{site-slug}/{post-slug}/` toont post (server-rendered, Yoast-equivalent meta tags, JSON-LD).
- Sitemap.xml en robots.txt gegenereerd vanuit DB.

## Publish-adapters

```ts
interface PublishDestination {
  publish(draft: Draft, site: Site): Promise<PublishResult>;
}

class BuiltInDestination implements PublishDestination { ... }
class WordPressDestination implements PublishDestination { ... }  // wrap existing src/wordpress
class MarkdownDestination implements PublishDestination { ... }   // write to data/published-md/
```

## Pipeline-bridge

`apps/web/lib/pipeline/runForSite.ts`:
1. Laadt site uit SQLite, materialiseert tijdelijk een TenantConfig-compatibele struct.
2. Roept bestaande `runPipeline()` aan, maar met een geïnjecteerde **publish hook** zodat publishing naar de gekozen destination gaat ipv hardcoded WordPress.
3. Schrijft draft + run-result terug naar SQLite.
4. **In-process voor manual trigger** (Server Action), **queue voor cron** (BullMQ ofg simpel een `setInterval` runner).

Voor deze iteratie: in-process is genoeg — gebruiker triggert handmatig.

## Tech stack

- **Next.js 15** App Router, React 19, Server Actions.
- **Tailwind CSS v4** + **shadcn/ui** (kopieer-installer style) voor mooie components.
- **Drizzle ORM** + **better-sqlite3**.
- **zod** voor validation (al aanwezig).
- **Tiptap** voor draft editor (rich text op HTML).
- Geen auth/billing — single-user lokaal.

## Roadmap (na deze iteratie)

- Auth + multi-user (NextAuth).
- Self-hosted deployment guide (Docker compose).
- Billing & hosted variant.
- AI-powered onboarding (brand voice afleiden van URL).
- Topic-suggester UI (al backend-side aanwezig).
- Repurposer UI.

## Keyword research & web crawling — gratis stack (geen DataForSEO/FireCrawl)

Vraag van Julian: zijn vorige blogtool gebruikte DataForSEO (betaald) + FireCrawl
voor keyword research en site-crawls. Voor deze tool kiezen we een gratis
stack die strategisch *beter* is omdat hij werkt met echte site-data ipv
geaggregeerde markt-volumes.

**Stack:**

| Laag | Tool | Status | Wat het doet |
|---|---|---|---|
| Page crawler | Jina Reader (`r.jina.ai`) | NIEUW — [src/integrations/jinaReader.ts](src/integrations/jinaReader.ts) | Gratis URL→markdown, vervangt FireCrawl. Optionele API-key voor hogere rate-limits. |
| Keyword opportunities | GSC + `keywordOpportunities` | NIEUW — [src/integrations/keywordOpportunities.ts](src/integrations/keywordOpportunities.ts) | Vier signalen: striking-distance, rising, decaying, unmapped — geëxtraheerd uit GSC ipv DataForSEO te kopen. |
| Site performance data | Google Search Console API | BESTAAND — [src/integrations/searchConsole.ts](src/integrations/searchConsole.ts) | Echte queries, impressies, posities per site. |
| SERP & trend research | Gemini search grounding | BESTAAND — gewired in researcher | Live SERP-snapshots, long-tail vragen rondom topic. |
| Competitor monitoring | Sitemap diff | BESTAAND — [src/integrations/competitorSitemaps.ts](src/integrations/competitorSitemaps.ts) | Detecteert nieuwe posts bij concurrenten zonder hun site te hoeven crawlen. |
| Optional paid boost | Serper.dev (pay-as-you-go) | TOEKOMSTIG | Wanneer gebruiker echte SERP-volume/CPC wil, ~$50/mnd voor ~50k queries. Plug-in laag, geen vereiste. |

**Integratie in topic-suggester** ([src/pipeline/topicSuggesterJob.ts](src/pipeline/topicSuggesterJob.ts)):

De simpele filter `impressions > 50 && position > 10` is vervangen door drie
parallele signalen die elk een eigen `proposal_source` krijgen:

- `gsc_striking_distance` — positie 8-20, ≥50 impressies → bijna page 1
- `gsc_unmapped_query` — query waar de site impressies op krijgt zonder dat een bestaand topic dit dekt → content gap (token-overlap matching ipv strikte substring)
- `gsc_rising_query` — alleen actief vanaf 2e run (vereist vorige snapshot); detecteert queries waarvan impressies tussen twee windows ≥50 én ≥50% groeien

GSC-snapshots worden bewaard in `data/gsc-snapshots/<slug>.json` zodat opvolgende runs trend-analyse kunnen doen.

**Trade-off:**
- GSC vereist domeinverificatie (eenmalig in onboarding) en geeft pas waardevolle data na ~4-8 weken eigen traffic. Voor brand-nieuwe sites is alleen `gsc_unmapped_query` minder relevant; de tool valt terug op `competitor_sitemap` + (toekomstig) een Gemini-grounded topic discovery.
- Voor sites met traffic is dit signaal *specifieker* dan DataForSEO omdat het beschrijft wat *deze site* daadwerkelijk doet ipv wat de markt gemiddeld doet.

## Beslissingen die ik nu maak zonder te vragen

| Beslissing | Keuze | Alternatief |
|---|---|---|
| Storage | SQLite | Postgres (overkill) |
| UI library | shadcn/ui + Tailwind | MUI (heavier), Mantine |
| Editor | Tiptap | Simpel `<textarea>` + Markdown |
| Auth | geen | NextAuth (uitgesteld) |
| Cron | manueel + `setInterval` runner | BullMQ + Redis (overkill) |
| Lokaal of hosted | lokaal | Vercel deploy (later) |
| Default publish-destination | Built-in CMS | WordPress (legacy) |

Als één hiervan fout is, redirect en ik draai 'm terug. Tot dan: bouwen.
