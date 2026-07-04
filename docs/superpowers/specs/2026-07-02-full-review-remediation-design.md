# Full-review remediation — design / plan (2026-07-02)

A fresh full-codebase review (on top of the 2026-06-23 audit) run via 6 parallel read-only
finders + a 23-agent adversarial verification pass. Every item below was verified against the
current code by an independent skeptic; severities are the verifier's reassessment of real
reachability/impact. Baseline at start: root typecheck ✓, root 433 tests ✓, web typecheck ✓,
web 98 tests ✓.

Approach: fix in prioritized batches, TDD where behaviour changes, keep typecheck + tests
(root + web) + web build green after each batch, one commit per logical group on `audit-fixes`.

## Tier 1 — Critical (security + broken feature)
1. **Tenant takeover** — `apps/web/lib/actions/auth.ts` `createOwnerUserAction`: unauthenticated
   `"use server"` action mints `role:"owner"` on any existing site (slug is public) when the
   email is not already present, then sets a session. Fix: reject if `listUsersForSite(site.id)`
   is non-empty (only the first user may self-assign owner); ignore any client-supplied role.
   Do NOT re-consume the invite (createSiteAction already consumed it).
2. **Password oracle** — `auth.ts:284` `export { authenticate }` (added to silence a lint warning)
   exposes an un-rate-limited server action returning the full user row incl. `passwordHash`.
   Fix: delete the re-export + now-unused import; project `passwordHash` out of `authenticate`.
3. **Scrape budget drain** — `apps/web/lib/actions/scrape.ts` `scrapeWebsiteAction`: unauthenticated
   + unthrottled, runs Gemini 2.5 Pro on the host key per call. Fix: IP sliding-window rate-limit.
4. **"Genereer" button broken (regression)** — `apps/web/lib/actions/generate.ts:37` pre-flips the
   topic to `in_progress` before `runForSite`, whose `claimTopicForRun` only claims `queued` →
   always fails ("topic al geclaimd"); the `rejected` branch also fails. Fix: remove the pre-flip;
   broaden `claimTopicForRun` to `status IN ('queued','rejected')`; surface a false claim as
   "already running".

## Tier 2 — High (live daily pipeline)
5. **Editorial audit log lost** — `.github/workflows/daily-blog.yml` commits only
   `tenants/*/topics.yaml`; `data/editorial-reviews/` (EU AI Act Art. 50 trail) is discarded on the
   ephemeral runner. Fix: `git add data/editorial-reviews/` (not gitignored).
6. **USD guardrails absent on `src/` orchestrator** — `assertRunBudget`/`exceedsWeeklyBudget` are
   only wired into `apps/web/lib/pipeline/runForSite.ts`, not the live daily `src/pipeline/orchestrator.ts`.
   Fix: import + call the guards there; add `MAX_RUN_USD`/`MAX_WEEKLY_USD` to workflow env + `.env.example`.

## Tier 3 — Medium (verified real)
7. **extractJson** — `src/llm/runAgent.ts`: unfenced JSON whose string value contains a ``` fence
   fails ("No JSON found"). The naive fix regresses (picks stray braces / silently wrong object);
   correct fix = multi-candidate scan (iterate every `{`/`[` in raw text, `extractBalanced` each,
   return first that balances AND `JSON.parse`s). Add unfenced-inner-fence + prose-braces tests.
8. **FK cascades never enforced** — `apps/web/lib/db/client.ts` never sets `PRAGMA foreign_keys=ON`,
   so `deleteSite` orphans children. Fix: enable the pragma per connection; explicit child-delete tx.
9. **No transactions on multi-write** — `publishDraftBuiltIn` (3 writes) + `updateSite` pillar
   delete+reinsert; the publish idempotency guard makes a half-write permanent. Fix: `db.transaction`.
10. **draft-image no auth** — `apps/web/app/api/draft-image/[draftId]/route.ts` serves private
    pre-publish artwork with no session/ownership check. Fix: mirror `upload-image`; `readFileSync`→async.
11. **SSRF via recursed sitemap `<loc>`** — `src/integrations/competitorSitemaps.ts` fetches remote-
    controlled sub-sitemap URLs unguarded. Fix: hoist a `guardedFetch` to shared/src, route both the
    domain fetch and each recursed `<loc>` through it.
12. **RBAC gap** — viewer can write non-secret site config and trigger paid actions. Fix: add an
    `editor`-minimum gate to `updateSiteAction`/`patchSiteAction` and to paid actions (generate,
    refresh, repurpose, suggest-topics, internal-linker, gsc-snapshot, audit, rewrite, run-next).
13. **Errors subsystem** — no `errors/[id]` route (resolve/reopen workflow unreachable), resolve/reopen
    are not site-scoped (IDOR), and `scope=all` leaks other tenants' rows. Fix: add site-scoped detail
    page; scope the mutations by `site_id`; restrict `scope=all` to `siteId IS NULL`/admin.
14. **Login timing oracle** — no scrypt on unknown-email branch. Fix: verify against a fixed dummy hash.
15. **Invite PII leak** — `checkInviteCodeAction` returns customer PII for any guessed code, unthrottled.
    Fix: IP rate-limit + return only validity/plan.
16. **repairJson corrupts strings** — not string-aware. Fix: string-aware transforms or drop risky ones.
17. **JSON-LD `<script>` breakout** — `src/pipeline/schemaGenerator.ts` unescaped `<` in serialized JSON
    published to WP. Fix: escape `<`.

## Tier 4 — Low / hardening / quality
Integration HTTP timeouts (AbortSignal); Docker digest pin; cron-token length via fixed-width hash;
week-count via SQL `count(*)`; runAgent retried-token accounting; Anthropic refusal fast-fail; Gemini
abort-signal; anchor-history cache persistence; repurposer index bound; applyFactCheckerFixes replace-all;
researcher root-URL grounding; cannibalization real titles; image tier (Gemini tier wiring, Cloudflare
branded prompt + PNG content-type, Fal retry policy, DataForSEO SERP depth); Math.random temp password →
CSPRNG; scheduler default TZ=UTC; graceful shutdown + stale-`in_progress` reaper; `getDb` init safety;
weekly-content-decay concurrency; CSP `unsafe-inline` note; client-ip under-config fallback; record
blocked login attempts; account-page real email; team UI role-gating; rich-text `javascript:` allowlist;
custom modal a11y.

**Refuted (no fix):** "success leaves topic stuck in_progress" — that is the designed
"draft awaiting review" state, surfaced in the kanban and advanced by the publish action.
