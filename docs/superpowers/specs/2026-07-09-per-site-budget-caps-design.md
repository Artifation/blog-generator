# Per-site budget-caps in de UI — ontwerp

**Datum:** 2026-07-09
**Status:** goedgekeurd (brainstorm), klaar voor implementatieplan

## Probleem

De kosten-guardrails `MAX_RUN_USD` (max $ per losse run) en `MAX_WEEKLY_USD` (max $
per week per site) zijn nu **globale server-env-vars**. De operator kan ze niet
zelf per site aanpassen zonder de VPS-`.env` te bewerken en de container te
herstarten. De weekcap in **posts** (`maxPostsPerWeek`) is al wél per-site en
UI-instelbaar; de **euro-budgetten** niet.

Doel: de operator kan het budget **per run** en **per week** per site zelf
instellen in het settings-dashboard, in euro's.

## Beslissingen (uit de brainstorm)

- **Beide** euro-caps (per-run én per-week) worden per-site instelbaar in de UI.
- Invoer/weergave in **euro's** (€). Kosten worden intern in **USD** bijgehouden
  (de LLM-API's rekenen in $), dus de handhaving rekent de euro-cap om naar USD.
- **Vaste koers** via één constante `USD_PER_EUR ≈ 1.08` (geen live FX-API — de
  bedragen zijn centen per post; een safety-guardrail hoeft niet valuta-exact).
- **Fallback**: een lege per-site cap valt terug op de globale env-cap
  (`MAX_RUN_USD` / `MAX_WEEKLY_USD`); is die óók leeg → geen cap. Zo verandert er
  **niets** bij deploy tot de operator zelf een waarde invult (backward-compatible;
  de nu-live env-caps $5/$40 blijven gelden).
- **Scope-grens**: alleen het **web-pad** (`apps/web/lib/pipeline/runForSite.ts`),
  dat de productie-scheduler + het dashboard gebruiken. Het `src/`-orchestrator-pad
  (GitHub Actions, `daily-blog.yml`) leest tenant-YAML en niet de web-DB; dat blijft
  de env-cap gebruiken en valt **buiten** deze wijziging.

## Datamodel

Twee nieuwe **nullable** kolommen op `sites` (in `apps/web/lib/db/schema.ts`):

| kolom | type | betekenis |
|-------|------|-----------|
| `max_run_eur` | `real`, nullable | max € voor één run; `null` = gebruik env-default |
| `max_weekly_eur` | `real`, nullable | max € per 7 dagen; `null` = gebruik env-default |

Toegevoegd via `ensureSchema()` → `safeAddColumn()` (additief `ALTER TABLE ADD
COLUMN`, geen migratie-risico; consistent met de bestaande aanpak). Beide zonder
default (blijven `NULL` voor bestaande rijen → env-fallback blijft werken).

## Omrekening

Eén exported constante op één plek (bij de bestaande cap-helpers in
`src/pipeline/costTracker.ts`):

```ts
/** Vaste EUR→USD koers voor de budget-caps. Bewust een constante, geen live FX:
 *  het zijn safety-guardrails van centen-bedragen, geen billing. Pas hier aan. */
export const USD_PER_EUR = 1.08;
export const eurToUsd = (eur: number): number => eur * USD_PER_EUR;
```

Spend blijft native USD (`costUsd`, `sumRunCostLast7DaysForSite`). Voor
weergave "deze week besteed" kan de UI de USD-spend met dezelfde constante naar
€ omrekenen (`usd / USD_PER_EUR`).

## Effectieve-cap-helper

Nieuwe pure helper (bijv. in `apps/web/lib/pipeline/budget.ts` of naast de
cap-logica) bepaalt de effectieve **USD**-cap uit per-site + env:

```ts
function effectiveUsdCap(perSiteEur: number | null, envUsd: string | undefined): number | null {
  if (perSiteEur != null && perSiteEur > 0) return eurToUsd(perSiteEur);
  return parseUsdLimit(envUsd); // null als env ook leeg/ongeldig
}
```

- per-site > 0 wint (omgerekend naar USD);
- anders env (`parseUsdLimit` → `null` bij leeg/ongeldig/≤0);
- beide leeg → `null` → geen cap.

## Handhaving

In `apps/web/lib/pipeline/runForSite.ts` (rond regels 136-140):

```ts
const runUsdCeiling = effectiveUsdCap(site.maxRunEur, process.env.MAX_RUN_USD);
const weeklyUsdCap  = effectiveUsdCap(site.maxWeeklyEur, process.env.MAX_WEEKLY_USD);
```

De rest van de bestaande cap-logica blijft ongewijzigd: `weeklyUsdCap` gate't
pre-flight (`exceedsWeeklyBudget` → topic `cap_deferred`), `runUsdCeiling` wordt
op de stage-grenzen afgedwongen (`assertRunBudget`). De `cap_deferred`-reason-string
toont het bestede bedrag + de cap in **euro's** (USD-waarden → € via `USD_PER_EUR`),
voor consistentie met de UI — bijv. `weekbudget bereikt (€37/€40)`.

## Wiring

Exact het patroon van `maxPostsPerWeek`:
- `CreateSiteInput` / `UpdateSiteInput` in `apps/web/lib/sites.ts`: velden
  `maxRunEur?: number | null`, `maxWeeklyEur?: number | null`.
- `createSite` insert: `maxRunEur: input.maxRunEur ?? null` (idem weekly).
- `updateSite` patch-allowlist: `if (input.maxRunEur !== undefined) patch.maxRunEur = input.maxRunEur;` (idem weekly). Leeg veld in de UI → `null` (wist de per-site cap → terug naar env-default).

## UI

In de bestaande **"Kwaliteit & cadans"**-kaart (`apps/web/app/settings/tabs/publish-tab.tsx`),
naast "Max posts / week", twee velden:

- **"Budget per run (€)"** — number, `min={0}`, `step={0.01}`, leeg toegestaan.
- **"Budget per week (€)"** — number, `min={0}`, `step={0.01}`, leeg toegestaan.
- Helper-tekst: *"Leeg = standaardlimiet."*
- Optioneel: naast "Budget per week" een subtiele "deze week besteed: €X"
  (USD-spend → € via de constante). Nice-to-have, kan in het plan als aparte stap.

Autosave via de bestaande `useAutoSave`-hook (`values` uitbreiden met
`maxRunEur`, `maxWeeklyEur`). Leeg invoerveld → `null` (niet `0`, want `0` zou
"cap op €0 = nooit draaien" betekenen; leeg = geen per-site cap).

## Randgevallen

- **Leeg vs. 0**: leeg veld → `null` (env-fallback). Een expliciete `0` behandelen
  we als "geen geldige cap" (net als `parseUsdLimit` ≤0 → null) om een
  onbedoelde totale blokkade te voorkomen. UI stuurt bij leeg veld `null`.
- **Negatief**: `min={0}` in de UI; helper-laag negeert ≤0 (→ fallback).
- **Bestaande sites**: kolommen `NULL` → env-fallback → gedrag ongewijzigd.

## Tests

- Unit voor `effectiveUsdCap` / `eurToUsd`: per-site wint (met koers-conversie);
  per-site `null`/`0`/negatief → env; env leeg → `null`; koers-omrekening correct.
- Bestaande cap-tests (`test/unit/pipeline/costBudget.test.ts`,
  `apps/web` cap-tests) blijven groen.
- `updateSite`-roundtrip: nieuwe velden worden opgeslagen + gelezen; leeg → `null`.

## Bewust niet in scope (YAGNI)

- Live FX-koers / valuta-keuze per site.
- Budget-caps op het `src/`-orchestrator (Actions) pad.
- Historische budget-grafieken / waarschuwings-e-mails bij X% van het budget
  (bestaat al deels als `CapReached`-mail voor de post-cap; buiten scope hier).
