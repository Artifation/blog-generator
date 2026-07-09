# Per-site budget-caps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-run and per-week euro budget caps settable per site in the settings dashboard, replacing the global-env-only `MAX_RUN_USD`/`MAX_WEEKLY_USD` for the web pipeline path.

**Architecture:** Two nullable euro columns on `sites`. A pure helper converts a site's euro cap to USD (fixed rate) and falls back to the env cap when the per-site value is empty. `runForSite` reads the effective USD cap through that helper; the settings UI edits the euro values via the existing autosave hook.

**Tech Stack:** TypeScript, Next.js 15 (App Router, server actions), Drizzle + libSQL (SQLite). Root pipeline tests: Vitest (`test/unit/**`). Web tests: `node:test` (`apps/web/lib/**/__tests__`).

## Global Constraints

- Currency in the UI is **euro (€)**; spend is tracked in **USD**. Convert with a single fixed constant `USD_PER_EUR = 1.08`.
- Per-site cap **overrides** the env cap; an empty/`null`/`≤0` per-site value falls back to the env cap (`MAX_RUN_USD` / `MAX_WEEKLY_USD`); both empty → **no cap**. Deploy must be backward-compatible (existing rows are `NULL` → env still applies).
- Scope is the **web path only** (`apps/web/lib/pipeline/runForSite.ts`). Do **not** touch the `src/` orchestrator (GitHub Actions) path.
- New columns are added via `safeAddColumn` (idempotent `ALTER TABLE ADD COLUMN`), never a destructive migration.
- Empty UI field → `null` (fall back to env). Never coerce empty to `0` (`0` would mean "never run").

---

### Task 1: Euro/USD cap helpers in costTracker

**Files:**
- Modify: `src/pipeline/costTracker.ts` (append after `exceedsWeeklyBudget`, ~line 104)
- Test: `test/unit/pipeline/eurBudgetCap.test.ts` (create)

**Interfaces:**
- Consumes: existing `parseUsdLimit(raw: string | undefined | null): number | null` from the same file.
- Produces:
  - `USD_PER_EUR: number` (constant, `1.08`)
  - `eurToUsd(eur: number): number`
  - `usdToEur(usd: number): number`
  - `effectiveUsdCap(perSiteEur: number | null | undefined, envUsd: string | undefined): number | null`

- [ ] **Step 1: Write the failing test**

Create `test/unit/pipeline/eurBudgetCap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  USD_PER_EUR,
  eurToUsd,
  usdToEur,
  effectiveUsdCap,
} from "@/pipeline/costTracker";

describe("eurToUsd / usdToEur", () => {
  it("converts with the fixed rate and round-trips", () => {
    expect(eurToUsd(10)).toBeCloseTo(10 * USD_PER_EUR, 10);
    expect(usdToEur(eurToUsd(10))).toBeCloseTo(10, 10);
  });
});

describe("effectiveUsdCap", () => {
  it("uses the per-site euro cap (converted to USD) when set", () => {
    expect(effectiveUsdCap(5, "40")).toBeCloseTo(5 * USD_PER_EUR, 10);
  });

  it("falls back to the env USD cap when per-site is null/undefined", () => {
    expect(effectiveUsdCap(null, "40")).toBe(40);
    expect(effectiveUsdCap(undefined, "40")).toBe(40);
  });

  it("treats a per-site value of 0 or negative as unset (falls back to env)", () => {
    expect(effectiveUsdCap(0, "40")).toBe(40);
    expect(effectiveUsdCap(-2, "40")).toBe(40);
  });

  it("returns null (no cap) when both per-site and env are empty", () => {
    expect(effectiveUsdCap(null, undefined)).toBe(null);
    expect(effectiveUsdCap(null, "")).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/pipeline/eurBudgetCap.test.ts`
Expected: FAIL — `USD_PER_EUR`/`eurToUsd`/`usdToEur`/`effectiveUsdCap` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/pipeline/costTracker.ts` (after the `exceedsWeeklyBudget` function, before the `RollingCounter` interface):

```ts
/**
 * Fixed EUR→USD rate for the budget caps. Deliberately a constant, not a live
 * FX lookup: these are safety guardrails on cents-per-post amounts, not billing.
 * Change here if the rate drifts materially.
 */
export const USD_PER_EUR = 1.08;

export const eurToUsd = (eur: number): number => eur * USD_PER_EUR;
export const usdToEur = (usd: number): number => usd / USD_PER_EUR;

/**
 * Resolve the effective **USD** cap from a per-site euro value + an env USD
 * fallback. A positive per-site euro cap wins (converted to USD); otherwise the
 * env cap (`parseUsdLimit` → null when blank/invalid/≤0); both empty → null (no
 * cap). A per-site 0/negative is treated as "unset" so it can't silently block
 * every run — clearing the field (null) and entering 0 both fall back to env.
 */
export function effectiveUsdCap(
  perSiteEur: number | null | undefined,
  envUsd: string | undefined,
): number | null {
  if (perSiteEur != null && perSiteEur > 0) return eurToUsd(perSiteEur);
  return parseUsdLimit(envUsd);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/pipeline/eurBudgetCap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/costTracker.ts test/unit/pipeline/eurBudgetCap.test.ts
git commit -m "feat(pipeline): euro budget-cap helpers (USD_PER_EUR, effectiveUsdCap)"
```

---

### Task 2: Schema columns + site CRUD wiring

**Files:**
- Modify: `apps/web/lib/db/schema.ts` (sites table, after `autoPublish`, ~line 31)
- Modify: `apps/web/lib/db/client.ts` (`ensureSchema`, after the existing `safeAddColumn` calls, ~line 195)
- Modify: `apps/web/lib/sites.ts` (`CreateSiteInput` ~line 144-145; `createSite` insert ~line 178-180; `updateSite` patch ~line 222-224)
- Test: `apps/web/lib/sites/__tests__/sites.test.ts` (append a test)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `sites.maxRunEur` / `sites.maxWeeklyEur` (`number | null`) on the Drizzle row + `SiteWithPillars`; `CreateSiteInput.maxRunEur?`, `CreateSiteInput.maxWeeklyEur?` (`number | null`); `updateSite` persists both.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/lib/sites/__tests__/sites.test.ts`:

```ts
test("budget caps: createSite stores euro caps, updateSite clears to null", async () => {
  const created = await createSite({
    name: "Budget Site",
    domain: "budget.example.com",
    brandVoice: "x",
    maxRunEur: 3,
    maxWeeklyEur: 25,
    author: { name: "G" },
    pillars: [{ name: "Core", weight: 1 }],
  });
  assert.equal(created.maxRunEur, 3);
  assert.equal(created.maxWeeklyEur, 25);

  // Clearing a cap in the UI sends null → falls back to the env default.
  await updateSite(created.id, { maxWeeklyEur: null });
  const read = await getSiteById(created.id);
  assert.equal(read!.maxRunEur, 3);
  assert.equal(read!.maxWeeklyEur, null);
});

test("budget caps: default to null when omitted", async () => {
  const created = await createSite({
    name: "No Budget Site",
    domain: "nobudget.example.com",
    brandVoice: "x",
    author: { name: "H" },
    pillars: [{ name: "Core", weight: 1 }],
  });
  assert.equal(created.maxRunEur, null);
  assert.equal(created.maxWeeklyEur, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test --import tsx "lib/sites/__tests__/sites.test.ts"`
Expected: FAIL — `maxRunEur`/`maxWeeklyEur` are not on `CreateSiteInput` (TS error) or come back `undefined`.

- [ ] **Step 3a: Add schema columns**

In `apps/web/lib/db/schema.ts`, inside the `sites` table after the `autoPublish` line (~line 31):

```ts
    // per-site budget caps (euro). null = use the global MAX_RUN_USD /
    // MAX_WEEKLY_USD env default. Nullable on purpose (no .notNull()).
    maxRunEur: real("max_run_eur"),
    maxWeeklyEur: real("max_weekly_eur"),
```

(`real` is already imported in this file.)

- [ ] **Step 3b: Add the idempotent migration**

In `apps/web/lib/db/client.ts`, in `ensureSchema`, right after the existing
`safeAddColumn(db, "topics", "custom_instructions TEXT");` line (~line 195):

```ts
    await safeAddColumn(db, "sites", "max_run_eur REAL");
    await safeAddColumn(db, "sites", "max_weekly_eur REAL");
```

- [ ] **Step 3c: Wire CreateSiteInput + createSite + updateSite**

In `apps/web/lib/sites.ts`:

Add to `CreateSiteInput` (after `maxPostsPerWeek?: number;`, ~line 145):

```ts
  maxRunEur?: number | null;
  maxWeeklyEur?: number | null;
```

Add to the `createSite` `db.insert(sites).values({ ... })` block (after `maxPostsPerWeek: input.maxPostsPerWeek ?? 2,`, ~line 179):

```ts
    maxRunEur: input.maxRunEur ?? null,
    maxWeeklyEur: input.maxWeeklyEur ?? null,
```

Add to `updateSite`'s patch block (after `if (input.maxPostsPerWeek !== undefined) patch.maxPostsPerWeek = input.maxPostsPerWeek;`, ~line 223):

```ts
  if (input.maxRunEur !== undefined) patch.maxRunEur = input.maxRunEur;
  if (input.maxWeeklyEur !== undefined) patch.maxWeeklyEur = input.maxWeeklyEur;
```

(`UpdateSiteInput = Partial<Omit<CreateSiteInput, "slug">>`, so it already includes both fields — no separate edit needed there.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test --import tsx "lib/sites/__tests__/sites.test.ts"`
Expected: PASS (all existing tests + the 2 new ones).

Then typecheck: `cd apps/web && npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/db/schema.ts apps/web/lib/db/client.ts apps/web/lib/sites.ts apps/web/lib/sites/__tests__/sites.test.ts
git commit -m "feat(sites): per-site euro budget-cap columns + CRUD wiring"
```

---

### Task 3: Enforce per-site caps in runForSite

**Files:**
- Modify: `apps/web/lib/pipeline/runForSite.ts` (import block ~line 25-31; cap resolution ~line 136-137; weekly reason string ~line 142)

**Interfaces:**
- Consumes: `effectiveUsdCap`, `usdToEur` from `@/pipeline/costTracker` (Task 1); `site.maxRunEur`, `site.maxWeeklyEur` (Task 2).
- Produces: no new exports (behavioral change only).

- [ ] **Step 1: Extend the costTracker import**

In `apps/web/lib/pipeline/runForSite.ts`, change the existing import block (lines 25-31) to add the two helpers:

```ts
import {
  computeRunCost,
  parseUsdLimit,
  assertRunBudget,
  exceedsWeeklyBudget,
  effectiveUsdCap,
  usdToEur,
  type UsageEntry,
} from "@/pipeline/costTracker";
```

(`parseUsdLimit` stays imported — it may still be used elsewhere in the file; leaving it avoids an unused-import churn only if referenced. If `npm run lint` flags it as unused after Step 2, remove it from this list.)

- [ ] **Step 2: Swap env-only caps for the effective per-site caps**

Replace the two cap-resolution lines (currently ~line 136-137):

```ts
  const runUsdCeiling = parseUsdLimit(process.env.MAX_RUN_USD);
  const weeklyUsdCap = parseUsdLimit(process.env.MAX_WEEKLY_USD);
```

with:

```ts
  const runUsdCeiling = effectiveUsdCap(site.maxRunEur, process.env.MAX_RUN_USD);
  const weeklyUsdCap = effectiveUsdCap(site.maxWeeklyEur, process.env.MAX_WEEKLY_USD);
```

- [ ] **Step 3: Show the weekly reason in euros**

Replace the weekly cap reason string (currently ~line 142):

```ts
      const reason = `weekbudget bereikt ($${spentThisWeek.toFixed(2)}/$${weeklyUsdCap.toFixed(2)})`;
```

with:

```ts
      const reason = `weekbudget bereikt (€${usdToEur(spentThisWeek).toFixed(2)}/€${usdToEur(weeklyUsdCap).toFixed(2)})`;
```

- [ ] **Step 4: Verify typecheck + lint + web tests stay green**

There is no isolated unit test for `runForSite` (it orchestrates the whole paid pipeline); the cap logic itself is covered by Task 1's helper tests. Verify the wiring compiles and nothing regresses:

Run: `cd apps/web && npm run typecheck && npm run lint && npm test`
Expected: typecheck clean, lint clean (0 warnings), all `node:test` tests pass. If lint reports `parseUsdLimit` unused, remove it from the Step 1 import list and re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/pipeline/runForSite.ts
git commit -m "feat(pipeline): enforce per-site euro budget caps in runForSite"
```

---

### Task 4: Settings UI — two euro fields

**Files:**
- Modify: `apps/web/app/settings/tabs/publish-tab.tsx` (`QualityCard`, ~line 25-85)

**Interfaces:**
- Consumes: `site.maxRunEur`, `site.maxWeeklyEur` (Task 2); `updateSite`/`patchSiteAction` accept them (Task 2); `useAutoSave` (existing).
- Produces: no new exports.

- [ ] **Step 1: Add state + autosave values**

In `apps/web/app/settings/tabs/publish-tab.tsx`, in `QualityCard`, after the existing
`const [scheduleCron, setSc] = React.useState(site.scheduleCron);` line, add:

```tsx
  const [maxRunEur, setMre] = React.useState<number | null>(site.maxRunEur);
  const [maxWeeklyEur, setMwe] = React.useState<number | null>(site.maxWeeklyEur);
```

Then extend the `useAutoSave` `values` object from:

```tsx
    values: { qualityThreshold, maxPostsPerWeek, scheduleCron },
```

to:

```tsx
    values: { qualityThreshold, maxPostsPerWeek, scheduleCron, maxRunEur, maxWeeklyEur },
```

- [ ] **Step 2: Add the two euro input fields**

Inside `QualityCard`'s `<div className="row" style={{ gap: 12 }}>` (the row holding the
existing three fields), after the "Schedule (cron, UTC)" `Field`, add two more fields.
Empty input → `null` (fall back to the env default); any number → that value.

```tsx
          <Field label="Budget per run (€)" help="Leeg = standaardlimiet.">
            <input
              className="input tnum"
              type="number"
              min={0}
              step={0.01}
              value={maxRunEur ?? ""}
              onChange={(e) => setMre(e.target.value === "" ? null : Number(e.target.value))}
              onBlur={flush}
              placeholder="standaard"
            />
          </Field>
          <Field label="Budget per week (€)" help="Leeg = standaardlimiet.">
            <input
              className="input tnum"
              type="number"
              min={0}
              step={0.01}
              value={maxWeeklyEur ?? ""}
              onChange={(e) => setMwe(e.target.value === "" ? null : Number(e.target.value))}
              onBlur={flush}
              placeholder="standaard"
            />
          </Field>
```

(The `Field` component's `required` prop is optional; these fields are intentionally
not `required` because empty is a valid "use default" state.)

- [ ] **Step 3: Verify typecheck + lint + build**

There is no component-test harness for settings tabs; verify it compiles, lints clean, and builds.

Run: `cd apps/web && npm run typecheck && npm run lint && npm run build`
Expected: typecheck clean, lint clean (0 warnings), `next build` compiles successfully.

- [ ] **Step 4: Manual smoke (local dev)**

Run: `cd apps/web && npm run dev`, open Settings → "Kwaliteit & cadans".
Expected: two euro fields render next to "Max posts / week"; entering a value shows the "saved" status; reloading the page keeps the value; clearing the field and blurring saves `null` (field shows the "standaard" placeholder again).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/settings/tabs/publish-tab.tsx
git commit -m "feat(settings): per-site euro budget-cap fields in the Quality & cadence card"
```

---

## Verification (whole feature)

- [ ] Root suite green: `npm test` (includes `eurBudgetCap.test.ts`).
- [ ] Web suite green: `cd apps/web && npm test` (includes new `sites.test.ts` cases).
- [ ] Typecheck both: `npm run typecheck` and `cd apps/web && npm run typecheck`.
- [ ] Lint clean: `cd apps/web && npm run lint`.
- [ ] Build: `cd apps/web && npm run build`.
- [ ] Backward-compat sanity: an existing site (both columns `NULL`) still uses the env caps — confirmed by `effectiveUsdCap(null, "5")===5` (Task 1 test) + the migration leaving existing rows `NULL`.

## Deploy note (out of plan scope, operator step)

Once merged and deployed, the live env `MAX_RUN_USD=5` / `MAX_WEEKLY_USD=40` keep
acting as the global default for sites that leave the fields blank. No `.env`
change is required. Per-site overrides take effect on the next scheduled run.
