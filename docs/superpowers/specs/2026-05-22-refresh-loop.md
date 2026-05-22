# Refresh loop — post-publish lifecycle closure

**Goal:** Close the lifecycle gap. Today the pipeline writes → publishes → forgets. GSC snapshots are taken weekly and a `contentDecayJob` emails decaying pages, but **nothing routes those signals back into the rewriter agent**. One published post compounds 6×/year instead of 1× when refreshes are routine.

**User instructie:** "ga door zonder clarifying questions" (zie [[feedback-autonomous-execution]]).

## Scope

In:
- Pure module `deriveRefreshOpportunities` that classifies published posts into `decaying | striking_distance | stagnant_evergreen | freshness_overdue` with an explicit uplift estimate.
- DB table `post_refreshes` to track before/after performance per refresh.
- Webapp helper `listRefreshOpportunitiesForSite` that joins GSC snapshot + published posts + refresh history.
- Executor `refreshPostForSite` that calls existing `runRewriter` with category-specific directives → creates a `pending_review` draft → records `post_refreshes` row.
- Server action `startRefresh` + UI route `/refreshes`.
- Dashboard navigation link.

Out (intentional non-scope, for later iterations):
- Auto-execution (cron-trigger refresh without human approval). User keeps the trigger button for now — same gating as existing pipeline.
- Auto-republish to WordPress on refresh. The refresh produces a draft; user re-uses the existing publish-draft flow.
- AI-driven uplift validation (was the refresh effective?). The schema captures before-snapshot so we *can* compute lift later, but the comparison UI is out of scope this iteration.
- Multi-language refresh prompts. Rewriter already uses brandVoice for tone; no per-locale templates.

## Beslissingen die ik nu maak zonder te vragen

| Vraag | Beslissing | Reden |
|---|---|---|
| Welke categorieën? | `decaying`, `striking_distance`, `stagnant_evergreen`, `freshness_overdue` | Eerste twee zijn de bekende SEO-wins; laatste twee dekken evergreen posts die geen GSC-data triggeren maar wel ouder dan 6 maanden zijn. |
| Hoe rank ik kandidaten? | Score = `impressies × confidence × categoryWeight`, clamped op 0..1 per dimensie | Eenvoudig + uitlegbaar in UI. |
| Re-refresh cooldown? | Een post mag pas 60 dagen na een vorige refresh opnieuw in de opportunity-lijst | Voorkomt loop waar dezelfde post wekelijks geherschreven wordt voordat GSC nieuwe data heeft. |
| Wordt de oude HTML weggegooid? | Nee — de nieuwe draft is een *nieuwe* draft die de gebruiker reviewt; bij publish overschrijft de built-in CMS de oude `publishedPosts` row via dezelfde slug (`siteSlugIdx` is uniek). | Behoudt menselijke goedkeuring; geen automatische overwrite. |
| Welke prompt-input krijgt de rewriter? | (1) huidige HTML; (2) categorie-specifieke `issues_to_address` zoals "expand freshness anchor", "add 2026-context", "deepen H2:X"; (3) top-3 queries waar de post nu voor wordt vertoond maar slecht voor scoort (uit GSC snapshot). | Hergebruikt bestaande `RewriterInput`-shape; geen nieuwe agent nodig. |
| Wat gebeurt er als er geen GSC-snapshot is? | Alleen `freshness_overdue` kandidaten worden getoond (puur op `publishedAt` ≥ 180 dagen geleden). UI toont "verbind GSC voor decay/striking-distance signalen". | Site werkt vanaf dag 0; GSC voegt waarde toe maar is niet blokkerend. |

## Data model

```ts
post_refreshes (
  id text primary key,
  site_id text not null references sites(id),
  published_post_id text not null references published_posts(id),
  draft_id text references drafts(id),
  category text not null,    // decaying | striking_distance | stagnant_evergreen | freshness_overdue
  triggered_at text not null,
  completed_at text,
  status text not null,      // queued | running | drafted | failed
  rationale text,            // why we flagged this post
  before_snapshot text       // jsonblob: { position, clicks_30d, impressions_30d } at trigger time
)
```

## Test plan

- Unit: `deriveRefreshOpportunities` correctly classifies + ranks given a fixed snapshot + post list.
- Unit: a post that was refreshed < 60 days ago is excluded.
- Unit: when no snapshot exists, only freshness_overdue candidates appear (and only for posts ≥ 180 days old).
- Unit: `refreshPostForSite` calls rewriter with category-specific directives and creates draft + post_refreshes row (mock rewriter + DB).
- Type-check: `pnpm tsc --noEmit` clean.
- Manual: open `/refreshes` with seeded data, click button, verify draft appears in `/drafts/[id]`.
