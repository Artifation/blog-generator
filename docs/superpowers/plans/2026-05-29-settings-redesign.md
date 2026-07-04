# Settings-page redesign + minder API-keys — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervang de 760-regels [settings-form.tsx](../../../apps/web/app/settings/settings-form.tsx) door een 5-tabs layout met auto-save per card, en maak de pipeline robuust genoeg dat alleen een Gemini-key vereist is.

**Architecture:**
- Pipeline: provider-registry leert wélke providers een key hebben en valt graceful terug op Gemini wanneer een primaire provider ontbreekt.
- UI: server-component leest `?tab=X` searchParam → client `SettingsShell` rendert TabsBar + active tab; elke tab heeft eigen cards die via `useAutoSave` hook hun eigen PATCH-call doen.

**Tech Stack:** Next 15 App Router (turbopack dev, standalone prod), React 19, libsql + drizzle, vitest at root (`test/**/*.test.ts`) — voor UI-verificatie Playwright (al opgezet in eerdere debug-sessie).

**Belangrijk:** Dit project is **geen git-repo**. Slaan = Edit/Write tool gebruikt. Tussen tasks bevestig je dat alles werkt door `npm test` (vitest) en, na UI-tasks, een snelle Playwright-check.

---

## Bestandsstructuur (na deze plan)

| Pad | Status |
|---|---|
| `src/llm/client.ts` | wijzigen — fallback-resolutie |
| `apps/web/lib/actions/generate.ts` | wijzigen — alleen Gemini-check |
| `apps/web/lib/actions/sites.ts` | wijzigen — nieuwe `patchSiteAction` |
| `apps/web/app/settings/use-auto-save.ts` | nieuw — debounced PATCH hook |
| `apps/web/app/settings/card-head.tsx` | nieuw — status-indicator component |
| `apps/web/app/settings/settings-shell.tsx` | nieuw — TabsBar + active tab |
| `apps/web/app/settings/tabs/brand-tab.tsx` | nieuw — Basis · Voice · Pillars · Auteur |
| `apps/web/app/settings/tabs/publish-tab.tsx` | nieuw — Kwaliteit · Bestemming · WP |
| `apps/web/app/settings/tabs/integrations-tab.tsx` | nieuw — Gemini-first + Geavanceerd |
| `apps/web/app/settings/tabs/team-tab.tsx` | nieuw — wrap TeamSection |
| `apps/web/app/settings/tabs/danger-tab.tsx` | nieuw — delete site |
| `apps/web/app/settings/page.tsx` | wijzigen — gebruik shell + tab-param |
| `apps/web/app/settings/settings-form.tsx` | **verwijderen** na taak 12 |
| `apps/web/app/settings/shared.tsx` | nieuw — herbruikbare `Section`, `Field`, `ChipsField`, `PillarEditor`, `ApiKeyField` (verhuisd uit settings-form.tsx) |
| `test/unit/llm/client.test.ts` | uitbreiden — fallback-test |
| `test/unit/llm/registry-availability.test.ts` | nieuw — registry-availability tests |

---

### Task 1: Provider-registry tracks availability

**Files:**
- Modify: `src/llm/client.ts`
- Test: `test/unit/llm/registry-availability.test.ts` (new)

**Doel:** `createProviderRegistry` mag geen exception meer gooien als een env-key ontbreekt — het registreert in plaats daarvan dat die provider niet beschikbaar is. Callers vragen via `registry.has(name)` of een provider beschikbaar is.

- [ ] **Step 1: Schrijf falende test**

Maak `test/unit/llm/registry-availability.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createProviderRegistry } from "@/llm/client";

describe("createProviderRegistry availability", () => {
  it("reports all providers available when all env keys set", () => {
    const reg = createProviderRegistry({
      ANTHROPIC_API_KEY: "x",
      GEMINI_API_KEY: "x",
      GROQ_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    expect(reg.has("anthropic")).toBe(true);
    expect(reg.has("gemini")).toBe(true);
    expect(reg.has("groq")).toBe(true);
  });

  it("reports anthropic unavailable when ANTHROPIC_API_KEY missing", () => {
    const reg = createProviderRegistry({
      GEMINI_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    expect(reg.has("anthropic")).toBe(false);
    expect(reg.has("gemini")).toBe(true);
  });

  it("does NOT throw on construction when keys missing", () => {
    expect(() =>
      createProviderRegistry({} as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("get() throws only when the unavailable provider is actually requested", () => {
    const reg = createProviderRegistry({
      GEMINI_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    expect(() => reg.get("anthropic")).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => reg.get("gemini")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run en verifieer FAIL**

Run: `npm test -- registry-availability`
Expected: FAIL met "reg.has is not a function" of vergelijkbaar.

- [ ] **Step 3: Implementeer**

Vervang `createProviderRegistry` en `ProviderRegistry` interface in `src/llm/client.ts` (regels 41-65):

```ts
export interface ProviderRegistry {
  get(name: LLMProviderName): LLMProvider;
  has(name: LLMProviderName): boolean;
}

const ENV_VAR_BY_PROVIDER: Record<LLMProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
};

export function createProviderRegistry(
  env: NodeJS.ProcessEnv = process.env
): ProviderRegistry {
  const cache = new Map<LLMProviderName, LLMProvider>();
  const availability = new Map<LLMProviderName, boolean>();
  for (const [name, envKey] of Object.entries(ENV_VAR_BY_PROVIDER)) {
    availability.set(name as LLMProviderName, Boolean(env[envKey]));
  }
  return {
    has(name) {
      return availability.get(name) === true;
    },
    get(name) {
      if (cache.has(name)) return cache.get(name)!;
      const p = (() => {
        if (name === "anthropic")
          return createAnthropicProvider(requireEnv(env, "ANTHROPIC_API_KEY"));
        if (name === "gemini")
          return createGeminiProvider(requireEnv(env, "GEMINI_API_KEY"));
        if (name === "groq")
          return createGroqProvider(requireEnv(env, "GROQ_API_KEY"));
        throw new Error(`Unknown provider: ${name}`);
      })();
      cache.set(name, p);
      return p;
    },
  };
}
```

- [ ] **Step 4: Run en verifieer PASS**

Run: `npm test -- registry-availability`
Expected: 4 tests pass.

- [ ] **Step 5: Bevestig bestaande tests onaangetast**

Run: `npm test -- llm/client`
Expected: alle bestaande tests passeren — geen regressies.

---

### Task 2: `resolveAgentModel` accepteert availability + valt terug op Gemini

**Files:**
- Modify: `src/llm/client.ts`
- Modify: `test/unit/llm/client.test.ts`

**Doel:** `resolveAgentModel(role, registry)` geeft een fallback naar Gemini wanneer de primaire provider niet beschikbaar is. Het oude `resolveAgentModel(role)` blijft werken voor backwards-compat (gebruikt env-default).

- [ ] **Step 1: Schrijf falende tests (toevoegen aan bestaande file)**

Voeg onderaan `test/unit/llm/client.test.ts` toe:

```ts
import { createProviderRegistry } from "@/llm/client";

describe("resolveAgentModel with availability fallback", () => {
  it("uses primary when provider available", () => {
    const reg = createProviderRegistry({
      ANTHROPIC_API_KEY: "x",
      GEMINI_API_KEY: "x",
      GROQ_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    expect(resolveAgentModel("writer", reg).provider).toBe("anthropic");
    expect(resolveAgentModel("imagePrompter", reg).provider).toBe("groq");
  });

  it("falls back to gemini when anthropic missing", () => {
    const reg = createProviderRegistry({
      GEMINI_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    const m = resolveAgentModel("writer", reg);
    expect(m.provider).toBe("gemini");
    expect(m.model).toMatch(/^gemini-/);
  });

  it("falls back to gemini when groq missing for imagePrompter", () => {
    const reg = createProviderRegistry({
      GEMINI_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    const m = resolveAgentModel("imagePrompter", reg);
    expect(m.provider).toBe("gemini");
  });

  it("keeps gemini-primary roles on gemini when only gemini set", () => {
    const reg = createProviderRegistry({
      GEMINI_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    expect(resolveAgentModel("researcher", reg).provider).toBe("gemini");
    expect(resolveAgentModel("topicSuggester", reg).provider).toBe("gemini");
  });

  it("legacy resolveAgentModel(role) without registry still returns primary", () => {
    // Backwards compat for callers that don't yet pass the registry.
    expect(resolveAgentModel("writer").provider).toBe("anthropic");
  });
});
```

- [ ] **Step 2: Run en verifieer FAIL**

Run: `npm test -- llm/client`
Expected: nieuwe tests FAIL — `resolveAgentModel` accepteert nog geen tweede argument.

- [ ] **Step 3: Implementeer fallback-mapping**

In `src/llm/client.ts`, vervang `resolveAgentModel` (regel 37-39):

```ts
// Fallback-mapping voor wanneer de primaire provider geen key heeft.
// Gemini is altijd het laatste redmiddel; rollen die al primair Gemini
// gebruiken hebben geen fallback nodig (failen gewoon hard als Gemini ook
// ontbreekt — gevangen door generate.ts vóór de pipeline start).
const GEMINI_FALLBACK: Record<AgentRole, AgentModelChoice> = {
  researcher: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 8000 },
  strategist: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 4000 },
  writer: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 8000 },
  seoEditor: { provider: "gemini", model: "gemini-2.5-flash", maxTokens: 8000 },
  factChecker: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 4000 },
  qualityJudge: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 4000 },
  imagePrompter: { provider: "gemini", model: "gemini-2.5-flash", maxTokens: 1000 },
  internalLinker: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 4000 },
  repurposer: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 2000 },
  topicSuggester: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 4000 },
};

export function resolveAgentModel(
  role: AgentRole,
  registry?: ProviderRegistry
): AgentModelChoice {
  const primary = ROLE_TO_MODEL[role];
  if (!registry) return primary;
  if (registry.has(primary.provider)) return primary;
  return GEMINI_FALLBACK[role];
}
```

- [ ] **Step 4: Run en verifieer PASS**

Run: `npm test -- llm/client`
Expected: alle tests passen (oude + nieuwe).

---

### Task 3: Update `generate.ts` om alleen Gemini te eisen

**Files:**
- Modify: `apps/web/lib/actions/generate.ts:22-28`

**Doel:** De hard "Anthropic + Gemini + Groq" check verdwijnt. Alleen Gemini blijft verplicht. De pipeline (runForSite) gebruikt nu de registry-fallback voor agents.

- [ ] **Step 1: Lees en update de check**

Vervang in `apps/web/lib/actions/generate.ts` de regels 22-28 (huidige check):

```ts
  if (!site.apiKeys?.anthropic || !site.apiKeys?.gemini || !site.apiKeys?.groq) {
    return {
      ok: false,
      error:
        "Mist verplichte API-keys (Anthropic, Gemini, Groq). Vul ze in onder Instellingen → API-keys.",
    };
  }
```

door:

```ts
  // Alleen Gemini is écht verplicht — andere providers worden gegraciously
  // overgeslagen via resolveAgentModel(role, registry) in de pipeline.
  const geminiKey = site.apiKeys?.gemini ?? process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return {
      ok: false,
      error:
        "Gemini API-key vereist. Vul 'm in onder Instellingen → Integraties.",
    };
  }
```

- [ ] **Step 2: Verifieer runForSite gebruikt de registry**

Open `apps/web/lib/pipeline/runForSite.ts` en zoek naar `createProviderRegistry`. Controleer dat `resolveAgentModel(role, registry)` met de tweede parameter wordt aangeroepen — zo niet, update aanroepen om de registry door te geven.

Quick check via grep:

```bash
grep -n "resolveAgentModel" apps/web/lib/pipeline/runForSite.ts src/agents/*.ts
```

Indien een agent `resolveAgentModel("writer")` aanroept zonder registry, voeg de registry toe (geef 'm door vanaf runForSite of laad via `createProviderRegistry()`).

- [ ] **Step 3: Smoke-test pipeline-fallback compileert**

Run: `cd apps/web && npm run typecheck`
Expected: geen TS errors. Indien fout — corrigeer agent-aanroepen die nog de oude signatuur gebruiken.

---

### Task 4: `patchSiteAction` server action

**Files:**
- Modify: `apps/web/lib/actions/sites.ts` (append nieuwe action)

**Doel:** Lichtgewicht partial-update action zonder de drie `revalidatePath` calls van `updateSiteAction` (die zijn onnodig tijdens auto-save op de actuele pagina; user zit al op /settings en de waarden zitten al in React state).

- [ ] **Step 1: Voeg de action toe**

Append in `apps/web/lib/actions/sites.ts`:

```ts
/**
 * Partial site update — used by the settings page auto-save hook to save
 * one card-worth of fields at a time. Intentionally skips revalidatePath
 * calls because the user is on /settings; the new value is already in
 * React state and other routes don't need invalidation per keystroke.
 */
export async function patchSiteAction(
  id: string,
  partial: UpdateSiteInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await updateSite(id, partial);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
```

- [ ] **Step 2: Verifieer typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: geen errors.

---

### Task 5: `useAutoSave` hook

**Files:**
- Create: `apps/web/app/settings/use-auto-save.ts`

**Doel:** Hook die per card een save-state bijhoudt en debounced naar de server stuurt via `patchSiteAction`. Hergebruikt door alle tabs.

- [ ] **Step 1: Schrijf de hook**

Maak `apps/web/app/settings/use-auto-save.ts`:

```ts
"use client";

import * as React from "react";
import { patchSiteAction } from "~/lib/actions/sites";
import type { UpdateSiteInput } from "~/lib/sites";
import { toast } from "sonner";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface UseAutoSaveArgs<T extends UpdateSiteInput> {
  siteId: string;
  /** Logical card name — used in toast errors so user knows which card failed. */
  cardKey: string;
  /** Current values of the fields in this card. */
  values: T;
}

interface UseAutoSaveResult {
  status: SaveStatus;
  /** Call from onBlur of any input in the card. Saves if dirty. */
  flush: () => Promise<void>;
}

const SAVED_VISIBLE_MS = 1500;

export function useAutoSave<T extends UpdateSiteInput>({
  siteId,
  cardKey,
  values,
}: UseAutoSaveArgs<T>): UseAutoSaveResult {
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const valuesRef = React.useRef(values);
  const lastSavedRef = React.useRef(JSON.stringify(values));
  const abortRef = React.useRef<AbortController | null>(null);

  // Keep ref in sync with latest values.
  React.useEffect(() => {
    valuesRef.current = values;
    const serialized = JSON.stringify(values);
    if (serialized !== lastSavedRef.current && status !== "saving") {
      setStatus("dirty");
    }
  }, [values, status]);

  const flush = React.useCallback(async () => {
    const serialized = JSON.stringify(valuesRef.current);
    if (serialized === lastSavedRef.current) return;

    // Cancel any in-flight save.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("saving");
    try {
      const result = await patchSiteAction(siteId, valuesRef.current);
      if (ctrl.signal.aborted) return;
      if (result.ok) {
        lastSavedRef.current = serialized;
        setStatus("saved");
        // After SAVED_VISIBLE_MS, fade back to idle (unless user typed again).
        setTimeout(() => {
          setStatus((s) => (s === "saved" ? "idle" : s));
        }, SAVED_VISIBLE_MS);
      } else {
        setStatus("error");
        toast.error(`${cardKey}: ${result.error}`);
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setStatus("error");
      toast.error(`${cardKey}: ${(err as Error).message}`);
    }
  }, [siteId, cardKey]);

  // Beforeunload guard: warn user if dirty or saving.
  React.useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (status === "dirty" || status === "saving") {
        e.preventDefault();
        // Modern browsers ignore the message but still show their own prompt.
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  return { status, flush };
}
```

- [ ] **Step 2: Verifieer typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: geen errors.

---

### Task 6: `CardHead` component

**Files:**
- Create: `apps/web/app/settings/card-head.tsx`

**Doel:** Herbruikbaar component dat een card-header rendert met titel + status-badge rechts. Gebruikt door alle tab-componenten.

- [ ] **Step 1: Schrijf component**

Maak `apps/web/app/settings/card-head.tsx`:

```tsx
"use client";

import * as React from "react";
import { Check, X, RefreshCw, Circle } from "lucide-react";
import type { SaveStatus } from "./use-auto-save";

interface CardHeadProps {
  title: string;
  description?: React.ReactNode;
  status?: SaveStatus;
  /** Called when user clicks the error badge to retry. */
  onRetry?: () => void;
}

export function CardHead({ title, description, status = "idle", onRetry }: CardHeadProps) {
  return (
    <div className="card-header">
      <div>
        <h3>{title}</h3>
        {description && (
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {description}
          </div>
        )}
      </div>
      <StatusBadge status={status} onRetry={onRetry} />
    </div>
  );
}

function StatusBadge({ status, onRetry }: { status: SaveStatus; onRetry?: () => void }) {
  if (status === "idle") return null;
  const styles: React.CSSProperties = {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
  if (status === "dirty")
    return (
      <span style={{ ...styles, background: "var(--warning-bg, #fef3c7)", color: "#92400e" }}>
        <Circle size={8} fill="currentColor" /> wijziging
      </span>
    );
  if (status === "saving")
    return (
      <span style={{ ...styles, background: "rgba(59,130,246,0.10)", color: "var(--secondary, #1e40af)" }}>
        <RefreshCw size={11} className="spin" /> opslaan…
      </span>
    );
  if (status === "saved")
    return (
      <span style={{ ...styles, background: "var(--success-bg, #d1fae5)", color: "var(--success, #065f46)" }}>
        <Check size={11} /> opgeslagen
      </span>
    );
  if (status === "error")
    return (
      <button
        type="button"
        onClick={onRetry}
        style={{
          ...styles,
          background: "rgba(220,38,38,0.10)",
          color: "#991b1b",
          border: "none",
          cursor: "pointer",
        }}
        title="Klik om opnieuw te proberen"
      >
        <X size={11} /> mislukt — opnieuw
      </button>
    );
  return null;
}
```

- [ ] **Step 2: Verifieer typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: geen errors.

---

### Task 7: Extract herbruikbare form-componenten naar `shared.tsx`

**Files:**
- Create: `apps/web/app/settings/shared.tsx`
- Read: `apps/web/app/settings/settings-form.tsx` (regel 563-760 voor de helpers)

**Doel:** De `Section`, `Field`, `ChipsField`, `PillarEditor`, `ApiKey` helpers uit settings-form.tsx eruit halen zodat de tab-componenten ze kunnen delen zonder duplicate definitions.

- [ ] **Step 1: Kopieer helpers één-op-één**

Open `apps/web/app/settings/settings-form.tsx`. Vanaf regel ~563 (de helper `function Section(...)`) tot het einde van de file zit:
- `Section`
- `Field`
- `ApiKey`
- `PillarEditor`
- `ChipsField`

Maak `apps/web/app/settings/shared.tsx` en plak deze ALLES erin, met deze aanpassingen:

1. Voeg `"use client";` bovenaan toe.
2. Voeg de juiste imports toe (React, lucide icons die deze helpers gebruiken: `Plus`, `Trash2`, etc.).
3. Maak elke functie `export` (`export function Section`, etc.).
4. Verwijder de helpers uit `settings-form.tsx` (dat bestand wordt later toch helemaal verwijderd).

Verifieer dat de helpers `RequiredBadge` / `OptionalBadge` / `FieldHelp` / `SectionIntro` importeren uit `~/components/ui/form-help` (zoals voorheen).

- [ ] **Step 2: Vervang het oude `Section` in settings-form.tsx door een import**

In `apps/web/app/settings/settings-form.tsx`, vervang aan het begin:

```tsx
import { RequiredBadge, OptionalBadge, FieldHelp, SectionIntro } from "~/components/ui/form-help";
```

door:

```tsx
import { RequiredBadge, OptionalBadge, FieldHelp, SectionIntro } from "~/components/ui/form-help";
import { Section, Field, ApiKey, PillarEditor, ChipsField } from "./shared";
```

(De oude file moet nog blijven werken tijdens migratie — pas later verwijderen in taak 12.)

- [ ] **Step 3: Verifieer typecheck én dat de oude pagina nog laadt**

Run: `cd apps/web && npm run typecheck`
Expected: geen errors.

Optioneel: start de dev-server (`npm run dev`) en navigeer naar `/settings` — zou er identiek uit moeten zien.

---

### Task 8: `SettingsShell` + URL routing

**Files:**
- Create: `apps/web/app/settings/settings-shell.tsx`
- Modify: `apps/web/app/settings/page.tsx`

**Doel:** TabsBar bovenaan, render active tab op basis van `?tab=` searchParam, sticky bovenaan binnen content-area. Pagina-laadflow rolt nu via de shell ipv direct settings-form.

- [ ] **Step 1: Maak settings-shell.tsx**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type TabKey = "brand" | "publish" | "integrations" | "team" | "danger";

const TABS: Array<{ key: TabKey; label: string; danger?: boolean }> = [
  { key: "brand", label: "Brand" },
  { key: "publish", label: "Publiceren" },
  { key: "integrations", label: "Integraties" },
  { key: "team", label: "Team" },
  { key: "danger", label: "Gevaar", danger: true },
];

export function SettingsShell({
  activeTab,
  children,
}: {
  activeTab: TabKey;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <>
      <div className="page-head">
        <div className="ph-text">
          <h1>Instellingen</h1>
          <div className="ph-sub">
            Brand, pillars, integraties en team. Wijzigingen worden automatisch opgeslagen.
          </div>
        </div>
      </div>
      <div
        style={{
          position: "sticky",
          top: 64,
          zIndex: 3,
          background: "var(--surface, #fff)",
          borderBottom: "1px solid var(--border)",
          marginBottom: 14,
        }}
      >
        <div className="topics-filters" role="tablist" aria-label="Settings tabs">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`${pathname}?tab=${t.key}`}
              role="tab"
              aria-selected={activeTab === t.key}
              className={`tfilter${activeTab === t.key ? " active" : ""}`}
              style={t.danger ? { color: "#b91c1c" } : undefined}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      <div>{children}</div>
    </>
  );
}

export function parseTab(raw: string | undefined): TabKey {
  const valid: TabKey[] = ["brand", "publish", "integrations", "team", "danger"];
  if (raw && (valid as string[]).includes(raw)) return raw as TabKey;
  return "brand";
}
```

- [ ] **Step 2: Update page.tsx**

Vervang `apps/web/app/settings/page.tsx` volledig door:

```tsx
import { requireSite, getCurrentUser } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { listUsersForSite } from "~/lib/users";
import { SettingsShell, parseTab, type TabKey } from "./settings-shell";
import { BrandTab } from "./tabs/brand-tab";
import { PublishTab } from "./tabs/publish-tab";
import { IntegrationsTab } from "./tabs/integrations-tab";
import { TeamTab } from "./tabs/team-tab";
import { DangerTab } from "./tabs/danger-tab";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const site = await requireSite();
  const me = await getCurrentUser();
  const sp = await searchParams;
  const tab: TabKey = parseTab(sp.tab);

  const [pending, topics, users] = await Promise.all([
    listDraftsForSite(site.id, "pending_review"),
    listTopicsForSite(site.id, "queued"),
    listUsersForSite(site.id),
  ]);
  const members = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    invitedAt: u.invitedAt,
    lastLoginAt: u.lastLoginAt,
    isMe: me?.id === u.id,
  }));

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={topics.length}
      crumbs={[{ label: "Instellingen" }]}
    >
      <SettingsShell activeTab={tab}>
        {tab === "brand" && <BrandTab site={site} />}
        {tab === "publish" && <PublishTab site={site} />}
        {tab === "integrations" && <IntegrationsTab site={site} />}
        {tab === "team" && <TeamTab members={members} />}
        {tab === "danger" && <DangerTab site={site} />}
      </SettingsShell>
    </AdminShell>
  );
}
```

**Belangrijk:** de tab-componenten bestaan nog niet — TypeScript zal compile-errors geven. Dat is verwacht; we maken ze in taken 9-13. Voor nu mag je tijdelijk de imports + JSX van niet-bestaande tabs uitcomment'en zodat de pagina blijft compileren.

- [ ] **Step 3: Verifieer dat /settings nu een lege tab-balk toont**

Tijdelijk de oude `settings-form.tsx` behouden (we verwijderen 'm in taak 13). Voeg in `page.tsx` naast de `SettingsShell` een tijdelijke render van het oude formulier toe alléén op tab=brand, zodat de pagina werkbaar blijft tijdens migratie:

```tsx
{tab === "brand" && <SettingsForm site={oldSiteData} teamSection={teamSectionElement} />}
```

(Verwijderen in laatste taak.)

Run: `cd apps/web && npm run dev`. Open `http://localhost:3000/settings`. Verifieer:
- Tabs-balk zichtbaar
- Default tab = "brand"
- Klik op "Publiceren" → URL wordt `/settings?tab=publish`, content leeg (verwacht)
- Browser back werkt

---

### Task 9: `brand-tab.tsx`

**Files:**
- Create: `apps/web/app/settings/tabs/brand-tab.tsx`

**Doel:** Eerste echte tab. Bevat 4 cards: Basis, Brand voice, Pillars, Auteur. Elk card gebruikt `useAutoSave`.

- [ ] **Step 1: Schrijf brand-tab.tsx**

```tsx
"use client";

import * as React from "react";
import type { SiteWithPillars } from "~/lib/sites";
import { slugify } from "~/lib/utils";
import { RequiredBadge, OptionalBadge, FieldHelp, SectionIntro } from "~/components/ui/form-help";
import { Field, PillarEditor, ChipsField } from "../shared";
import { CardHead } from "../card-head";
import { useAutoSave } from "../use-auto-save";

interface Props {
  site: SiteWithPillars;
}

export function BrandTab({ site }: Props) {
  return (
    <div className="col gap-lg" style={{ paddingBottom: 40 }}>
      <BasicsCard site={site} />
      <VoiceCard site={site} />
      <PillarsCard site={site} />
      <AuthorCard site={site} />
    </div>
  );
}

function BasicsCard({ site }: Props) {
  const [name, setName] = React.useState(site.name);
  const [slug, setSlug] = React.useState(site.slug);
  const [domain, setDomain] = React.useState(site.domain);
  const [language, setLanguage] = React.useState(site.language);

  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Basis",
    values: { name, slug, domain, language },
  });

  return (
    <div className="card">
      <CardHead
        title="Basis"
        description="Naam, slug, domein en taal van deze site."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Deze waardes worden gebruikt op de gepubliceerde blog (titel, URL-structuur)
          en sturen alle agents (taal-detectie, brand voice). Wijzig de slug alleen
          als de site nog niet live is — bestaande URL's wijzigen niet retroactief.
        </SectionIntro>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Naam" required help="Wordt zichtbaar als author/publisher.">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={flush}
              placeholder="Artifation"
            />
          </Field>
          <Field label="Slug" required help="URL-veilige identifier.">
            <input
              className="input mono"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              onBlur={flush}
              placeholder="artifation"
            />
          </Field>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Domein" required help="Echte domein zonder protocol.">
            <input
              className="input"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onBlur={flush}
              placeholder="artifation.nl"
            />
          </Field>
          <Field label="Taal" required help="Default taal voor gegenereerde content.">
            <select
              className="select"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                // Select: save direct na change (debounce niet nodig hier).
                setTimeout(flush, 0);
              }}
            >
              <option value="nl-NL">Nederlands</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="de-DE">Deutsch</option>
              <option value="fr-FR">Français</option>
              <option value="es-ES">Español</option>
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}

function VoiceCard({ site }: Props) {
  const [brandVoice, setBrandVoice] = React.useState(site.brandVoice);
  const [banList, setBanList] = React.useState<string[]>(site.banList ?? []);
  const [signaturePhrases, setSignaturePhrases] = React.useState<string[]>(site.signaturePhrases ?? []);

  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Brand voice",
    values: { brandVoice, banList, signaturePhrases },
  });

  // Chips-arrays: save direct na elke add/remove.
  const setBanListAndSave = React.useCallback((v: string[]) => {
    setBanList(v);
    setTimeout(flush, 0);
  }, [flush]);
  const setSigAndSave = React.useCallback((v: string[]) => {
    setSignaturePhrases(v);
    setTimeout(flush, 0);
  }, [flush]);

  return (
    <div className="card">
      <CardHead
        title="Brand voice"
        description="Hoe moet de writer klinken — en wat te vermijden."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Brand voice is het tweede sterkste signaal voor de writer (na de outline).
          Wees concreet: persona, toon, energie.
        </SectionIntro>
        <Field label="Voice" required help="2-5 zinnen die uitleggen hoe je site klinkt.">
          <textarea
            className="textarea"
            rows={6}
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            onBlur={flush}
            placeholder="Direct, expert, nuchter — geen marketingjargon..."
          />
        </Field>
        <ChipsField
          label="Ban list"
          optional
          description="Woorden die NOOIT in gepubliceerde posts mogen voorkomen."
          values={banList}
          onChange={setBanListAndSave}
        />
        <ChipsField
          label="Signature phrases"
          optional
          description="Korte zinnen die jouw brand herkenbaar maken."
          values={signaturePhrases}
          onChange={setSigAndSave}
        />
      </div>
    </div>
  );
}

function PillarsCard({ site }: Props) {
  const [pillars, setPillars] = React.useState(site.pillars);
  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Pillars",
    values: { pillars },
  });

  const setPillarsAndSave = React.useCallback((v: typeof pillars) => {
    setPillars(v);
    setTimeout(flush, 0);
  }, [flush]);

  return (
    <div className="card">
      <CardHead
        title="Pillars"
        description="Content pillars sturen topic-selectie en het topic-suggester-agent."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Pillars zijn de hoofd-thema's van je blog. Weights normaliseren bij opslaan naar 1.0.
        </SectionIntro>
        <PillarEditor pillars={pillars} onChange={setPillarsAndSave} />
      </div>
    </div>
  );
}

function AuthorCard({ site }: Props) {
  const [author, setAuthor] = React.useState(site.author);
  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Auteur",
    values: { author },
  });

  return (
    <div className="card">
      <CardHead
        title="Auteur"
        description="De byline op gepubliceerde posts."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Wordt gebruikt in JSON-LD schema en op de zichtbare byline.
        </SectionIntro>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Naam" required help="Volledige naam van de auteur.">
            <input
              className="input"
              value={author.name ?? ""}
              onChange={(e) => setAuthor({ ...author, name: e.target.value })}
              onBlur={flush}
              placeholder="Julian Dunsbergen"
            />
          </Field>
          <Field label="LinkedIn URL" help="LinkedIn-profiel — E-E-A-T signaal.">
            <input
              className="input"
              value={author.linkedin ?? ""}
              onChange={(e) => setAuthor({ ...author, linkedin: e.target.value })}
              onBlur={flush}
              placeholder="https://www.linkedin.com/in/..."
            />
          </Field>
        </div>
        <Field label="Bio" help="1-3 zinnen over de auteur.">
          <textarea
            className="textarea"
            rows={3}
            value={author.bio ?? ""}
            onChange={(e) => setAuthor({ ...author, bio: e.target.value })}
            onBlur={flush}
          />
        </Field>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire de tab in page.tsx**

In `apps/web/app/settings/page.tsx`, verwijder de tijdelijke `SettingsForm` rendering voor tab=brand en zorg dat alleen `<BrandTab site={site} />` overblijft (zoals in de eerste versie van page.tsx in taak 8 al staat). Verifieer de import staat in page.tsx.

- [ ] **Step 3: Manual test via Playwright**

Start dev-server (`cd apps/web && npm run dev`) en navigeer naar `/settings?tab=brand`. Verifieer:

1. Vier cards zijn zichtbaar
2. Tik in "Naam" — geel badge "● wijziging" verschijnt
3. Tab uit het veld — badge wordt "⟳ opslaan…" → "✓ opgeslagen" → leeg
4. Refresh — waarde is persistent
5. Devtools: één POST per blur naar de server-action

Indien er issues zijn, fix ze inline voordat je doorgaat.

---

### Task 10: `publish-tab.tsx`

**Files:**
- Create: `apps/web/app/settings/tabs/publish-tab.tsx`

**Doel:** Twee cards: "Kwaliteit & cadans" en "Publiceren" (met conditional WordPress sub-block).

- [ ] **Step 1: Schrijf publish-tab.tsx**

```tsx
"use client";

import * as React from "react";
import type { SiteWithPillars } from "~/lib/sites";
import { SectionIntro } from "~/components/ui/form-help";
import { Field } from "../shared";
import { CardHead } from "../card-head";
import { useAutoSave } from "../use-auto-save";

interface Props {
  site: SiteWithPillars;
}

export function PublishTab({ site }: Props) {
  return (
    <div className="col gap-lg" style={{ paddingBottom: 40 }}>
      <QualityCard site={site} />
      <DestinationCard site={site} />
    </div>
  );
}

function QualityCard({ site }: Props) {
  const [qualityThreshold, setQt] = React.useState(site.qualityThreshold);
  const [maxPostsPerWeek, setMpw] = React.useState(site.maxPostsPerWeek);
  const [scheduleCron, setSc] = React.useState(site.scheduleCron);

  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Kwaliteit & cadans",
    values: { qualityThreshold, maxPostsPerWeek, scheduleCron },
  });

  return (
    <div className="card">
      <CardHead
        title="Kwaliteit & cadans"
        description="Drempelwaardes voor publish + schedule."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Drafts onder de threshold worden automatisch rejected. De cron-schedule wordt
          op de VPS uitgevoerd door de in-process scheduler.
        </SectionIntro>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Quality threshold (0–10)" required help="8.0 is streng, 7.0 ruimer.">
            <input
              className="input tnum"
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={qualityThreshold}
              onChange={(e) => setQt(Number(e.target.value) || 0)}
              onBlur={flush}
            />
          </Field>
          <Field label="Max posts / week" required help="Hard cap voor de pipeline.">
            <input
              className="input tnum"
              type="number"
              min={0}
              value={maxPostsPerWeek}
              onChange={(e) => setMpw(Number(e.target.value) || 0)}
              onBlur={flush}
            />
          </Field>
          <Field label="Schedule (cron, UTC)" required help="Default: ma/wo/vr 06:00 UTC.">
            <input
              className="input mono"
              value={scheduleCron}
              onChange={(e) => setSc(e.target.value)}
              onBlur={flush}
              placeholder="0 6 * * 1,3,5"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function DestinationCard({ site }: Props) {
  const [publishDestination, setPd] = React.useState(site.publishDestination);
  const [wp, setWp] = React.useState(site.wordpressConfig);

  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Publiceren",
    values: { publishDestination, wordpressConfig: wp },
  });

  const setPdAndSave = (next: typeof publishDestination) => {
    setPd(next);
    setTimeout(flush, 0);
  };

  return (
    <div className="card">
      <CardHead
        title="Publiceren"
        description="Waar finale posts naartoe gaan."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Built-in CMS = posts gerenderd op deze webapp. WordPress = via REST API.
          Markdown = .md-bestanden in data/exports/.
        </SectionIntro>
        <Field label="Bestemming" required help="Default 'Built-in CMS' — werkt direct.">
          <select
            className="select"
            value={publishDestination}
            onChange={(e) => setPdAndSave(e.target.value as typeof publishDestination)}
          >
            <option value="built_in">Built-in CMS</option>
            <option value="wordpress">WordPress</option>
            <option value="markdown">Markdown export</option>
          </select>
        </Field>
        {publishDestination === "wordpress" && (
          <div className="card" style={{ background: "var(--surface-2)" }}>
            <div className="card-body col" style={{ gap: 12 }}>
              <SectionIntro>
                WordPress credentials. Vereist een Application Password, niet je
                gewone wachtwoord.
              </SectionIntro>
              <Field label="WordPress URL" required help="Volledige basis-URL incl. https://">
                <input
                  className="input"
                  value={wp?.baseUrl ?? ""}
                  onChange={(e) => setWp({ ...(wp ?? { user: "", appPassword: "" }), baseUrl: e.target.value })}
                  onBlur={flush}
                  placeholder="https://blog.example.com"
                />
              </Field>
              <div className="row" style={{ gap: 12 }}>
                <Field label="User" required help="WP-gebruikersnaam.">
                  <input
                    className="input"
                    value={wp?.user ?? ""}
                    onChange={(e) => setWp({ ...(wp ?? { baseUrl: "", appPassword: "" }), user: e.target.value })}
                    onBlur={flush}
                  />
                </Field>
                <Field label="App password" required help="Application Password uit WP-admin.">
                  <input
                    className="input"
                    type="password"
                    value={wp?.appPassword ?? ""}
                    onChange={(e) => setWp({ ...(wp ?? { baseUrl: "", user: "" }), appPassword: e.target.value })}
                    onBlur={flush}
                    placeholder="xxxx xxxx xxxx xxxx"
                  />
                </Field>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verify**

Dev server draaiend. Open `/settings?tab=publish`. Verifieer:
1. Twee cards zichtbaar
2. Bestemming = "WordPress" → WP sub-card verschijnt
3. Wijzig threshold, blur — auto-save indicator werkt

---

### Task 11: `integrations-tab.tsx` — Gemini-first met Geavanceerd uitklap

**Files:**
- Create: `apps/web/app/settings/tabs/integrations-tab.tsx`

**Doel:** De spec-versie 2 (Gemini hoofdscherm + Geavanceerd dropdown met Anthropic/Groq/Fal/Resend/GSC/DFS).

- [ ] **Step 1: Schrijf integrations-tab.tsx**

```tsx
"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SiteWithPillars } from "~/lib/sites";
import { SectionIntro, FieldHelp, OptionalBadge, RequiredBadge } from "~/components/ui/form-help";
import { CardHead } from "../card-head";
import { useAutoSave } from "../use-auto-save";

interface Props {
  site: SiteWithPillars;
}

export function IntegrationsTab({ site }: Props) {
  return (
    <div className="col gap-lg" style={{ paddingBottom: 40 }}>
      <GeminiCard site={site} />
      <AdvancedSection site={site} />
    </div>
  );
}

function GeminiCard({ site }: Props) {
  const [gemini, setGemini] = React.useState(site.apiKeys?.gemini ?? "");
  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Gemini",
    values: { apiKeys: { ...site.apiKeys, gemini } },
  });
  const [show, setShow] = React.useState(false);

  return (
    <div className="card">
      <CardHead title="Gemini API-key" status={status} onRetry={flush} />
      <div className="card-body col" style={{ gap: 10 }}>
        <SectionIntro>
          De enige key die je écht nodig hebt. Powert alle agents (writer, researcher,
          topic-suggester, image-prompter, audit). Krijg er één op{" "}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com
          </a>{" "}
          — gratis tier voldoende voor een paar posts per week.
        </SectionIntro>
        <label>
          <span>Gemini</span>
          <RequiredBadge />
        </label>
        <div className="row" style={{ gap: 6 }}>
          <input
            className="input mono"
            type={show ? "text" : "password"}
            value={gemini}
            onChange={(e) => setGemini(e.target.value)}
            onBlur={flush}
            placeholder="AIza…"
          />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShow((s) => !s)}>
            {show ? "Verberg" : "Toon"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdvancedSection({ site }: Props) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="card-header"
        style={{ background: "transparent", border: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
      >
        <div>
          <h3>Geavanceerd</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Override-keys voor specifieke providers en extra features (GSC, DataForSEO).
          </div>
        </div>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && (
        <div className="card-body col" style={{ gap: 14 }}>
          <AnthropicCard site={site} />
          <GroqCard site={site} />
          <FalCard site={site} />
          <ResendCard site={site} />
          <GscCard site={site} />
          <DfsCard site={site} />
        </div>
      )}
    </div>
  );
}

function ApiKeyOverrideCard({
  site,
  title,
  description,
  fallbackNote,
  apiKeyName,
  placeholder,
}: {
  site: SiteWithPillars;
  title: string;
  description: React.ReactNode;
  fallbackNote: string;
  apiKeyName: "anthropic" | "groq" | "fal" | "resend";
  placeholder: string;
}) {
  const [value, setValue] = React.useState(site.apiKeys?.[apiKeyName] ?? "");
  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: title,
    values: { apiKeys: { ...site.apiKeys, [apiKeyName]: value } },
  });
  const [show, setShow] = React.useState(false);
  return (
    <div className="card" style={{ background: "var(--surface-2)" }}>
      <CardHead title={title} description={description} status={status} onRetry={flush} />
      <div className="card-body col" style={{ gap: 8 }}>
        <label>
          <span>API-key</span>
          <OptionalBadge />
        </label>
        <div className="row" style={{ gap: 6 }}>
          <input
            className="input mono"
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={flush}
            placeholder={placeholder}
          />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShow((s) => !s)}>
            {show ? "Verberg" : "Toon"}
          </button>
        </div>
        <FieldHelp>{fallbackNote}</FieldHelp>
      </div>
    </div>
  );
}

function AnthropicCard({ site }: Props) {
  return (
    <ApiKeyOverrideCard
      site={site}
      title="Anthropic (override)"
      description="LLM-override voor writer/strategist/factChecker/qualityJudge."
      fallbackNote="Zonder Anthropic: deze agents draaien op Gemini (default)."
      apiKeyName="anthropic"
      placeholder="sk-ant-…"
    />
  );
}
function GroqCard({ site }: Props) {
  return (
    <ApiKeyOverrideCard
      site={site}
      title="Groq (override)"
      description="Snelle, goedkope LLM voor image-prompter."
      fallbackNote="Zonder Groq: image-prompter draait op Gemini."
      apiKeyName="groq"
      placeholder="gsk_…"
    />
  );
}
function FalCard({ site }: Props) {
  return (
    <ApiKeyOverrideCard
      site={site}
      title="Fal.ai — feature-images"
      description="Genereert de afbeelding bovenaan elke post."
      fallbackNote="Zonder Fal: posts krijgen geen feature-image. Alles werkt verder gewoon."
      apiKeyName="fal"
      placeholder="fal_…"
    />
  );
}
function ResendCard({ site }: Props) {
  return (
    <ApiKeyOverrideCard
      site={site}
      title="Resend — e-mail notificaties"
      description="Stuurt mail bij nieuwe drafts en topic-voorstellen."
      fallbackNote="Zonder Resend: je ziet alles alleen in het dashboard."
      apiKeyName="resend"
      placeholder="re_…"
    />
  );
}

function GscCard({ site }: Props) {
  // Bestaande GSC logica (toggle + property URL + JSON) verhuist hierheen.
  // Voor brevity: kopieer het GSC <Section>-blok uit settings-form.tsx (regel ~354-429)
  // 1-op-1 over, vervang <Section> door <div className="card"> + <CardHead>, en
  // wire elke field-blur op flush() van een nieuwe useAutoSave op
  // values = { features: { ...site.features, search_console: {...} }, apiKeys: { ..., gscServiceAccountJson } }.
  return (
    <PlaceholderCard
      title="Google Search Console"
      todo="Migreer GSC-sectie uit oude settings-form.tsx (regels 354-429) hierheen."
    />
  );
}

function DfsCard({ site }: Props) {
  return (
    <PlaceholderCard
      title="DataForSEO"
      todo="Migreer DataForSEO-sectie uit oude settings-form.tsx (regels 431-504) hierheen."
    />
  );
}

function PlaceholderCard({ title, todo }: { title: string; todo: string }) {
  return (
    <div className="card" style={{ background: "var(--warning-bg, #fef3c7)" }}>
      <div className="card-body">
        <h4 style={{ margin: 0 }}>{title}</h4>
        <p style={{ margin: "6px 0 0 0", fontSize: 12, color: "#92400e" }}>TODO: {todo}</p>
      </div>
    </div>
  );
}
```

**Belangrijk:** De `GscCard` en `DfsCard` blijven in deze taak als placeholders. Migratie van die specifieke sub-secties is mechanisch (copy-paste van bestaande JSX uit settings-form.tsx in eigen card met useAutoSave). Voer die migratie uit in dezelfde taak als je in flow zit, of split af naar een vervolg-taak.

- [ ] **Step 2: Voltooi GscCard en DfsCard**

Open `apps/web/app/settings/settings-form.tsx` op regel ~354 voor GSC en ~431 voor DataForSEO. Kopieer de JSX-content (de inhoud binnen elk `<Section>`) naar de bijbehorende Card-component. Wrap met `useAutoSave` op de relevante velden:

- GSC: `{ features: {...site.features, search_console: {...}}, apiKeys: {...site.apiKeys, gscServiceAccountJson} }`
- DFS: `{ apiKeys: {...site.apiKeys, dataForSeoLogin, dataForSeoPassword, dataForSeoLanguageCode, dataForSeoLocationCode} }`

Verwijder de `PlaceholderCard` aanroepen.

- [ ] **Step 3: Manual verify**

Open `/settings?tab=integrations`. Verifieer:
1. Gemini card direct zichtbaar bovenaan
2. "Geavanceerd ▾" gesloten by default
3. Klik open → 6 cards (Anthropic, Groq, Fal, Resend, GSC, DataForSEO)
4. Typ in Gemini-veld + blur → auto-save indicator werkt en `apiKeys.gemini` wordt in DB ge-update (check via SSH+sqlite of via /api door site opnieuw te laden)

---

### Task 12: `team-tab.tsx` en `danger-tab.tsx`

**Files:**
- Create: `apps/web/app/settings/tabs/team-tab.tsx`
- Create: `apps/web/app/settings/tabs/danger-tab.tsx`

- [ ] **Step 1: team-tab.tsx**

```tsx
"use client";

import { TeamSection, type TeamMember } from "../team-section";

interface Props {
  members: TeamMember[];
}

export function TeamTab({ members }: Props) {
  return <TeamSection members={members} />;
}
```

`TeamSection` heeft signature `TeamSection({ members }: { members: TeamMember[] })` (zie [team-section.tsx:19](../../../apps/web/app/settings/team-section.tsx#L19)). De members worden in page.tsx gefetched (al gewijzigd in taak 8) en doorgegeven aan TeamTab.

- [ ] **Step 2: danger-tab.tsx**

```tsx
"use client";

import * as React from "react";
import { Trash2, AlertCircle } from "lucide-react";
import type { SiteWithPillars } from "~/lib/sites";
import { deleteSiteAction } from "~/lib/actions/sites";

interface Props {
  site: SiteWithPillars;
}

export function DangerTab({ site }: Props) {
  async function destroy() {
    if (!confirm(`Verwijder "${site.name}" en alles wat erbij hoort?`)) return;
    if (!confirm("Echt zeker? Dit is onomkeerbaar.")) return;
    await deleteSiteAction(site.id);
  }

  return (
    <div className="col gap-lg" style={{ paddingBottom: 40 }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Site verwijderen</h3>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Permanent. Geen undo.
            </div>
          </div>
        </div>
        <div className="card-body col" style={{ gap: 14 }}>
          <div
            style={{
              padding: 12,
              background: "rgba(220,38,38,0.06)",
              border: "1px solid rgba(220,38,38,0.25)",
              borderRadius: 6,
              fontSize: 13,
              color: "#374151",
            }}
          >
            <AlertCircle size={14} style={{ verticalAlign: "middle", marginRight: 6, color: "#b91c1c" }} />
            Dit verwijdert <strong>{site.name}</strong> inclusief alle topics,
            drafts en gepubliceerde posts. Pillars, team-leden en runs gaan ook
            weg.
          </div>
          <div>
            <button type="button" className="btn btn-danger" onClick={destroy}>
              <Trash2 size={14} /> Verwijder deze site permanent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual verify**

Open `/settings?tab=team` — TeamSection laadt. Open `/settings?tab=danger` — rode delete-knop met waarschuwing.

---

### Task 13: Verwijder oude `settings-form.tsx` + final verify

**Files:**
- Delete: `apps/web/app/settings/settings-form.tsx`

- [ ] **Step 1: Verifieer dat geen bestand meer settings-form importeert**

```bash
grep -rn "settings-form" apps/web/app/settings/
```

Expected: alleen het file zelf wordt gevonden. Indien `page.tsx` nog importeert: verwijder die import en bijbehorende JSX (zou na taak 8 al weg moeten zijn).

- [ ] **Step 2: Verwijder het bestand**

```bash
rm apps/web/app/settings/settings-form.tsx
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: geen errors.

- [ ] **Step 4: Full Playwright sanity check**

Open `http://localhost:3000/settings` zonder tab-param → redirect naar `?tab=brand`.

Voor elke tab (brand, publish, integrations, team, danger):
1. Tab is bereikbaar via klikken
2. Cards renderen zonder console-errors
3. Browser-back werkt
4. Refresh blijft op huidige tab

Voor brand-tab:
1. Edit "Naam", blur → status "opslaan…" → "opgeslagen"
2. Refresh → nieuwe naam blijft staan
3. DevTools Network: POST naar `/settings` server-action returnt 200

Voor integrations-tab:
1. Geavanceerd-blok is collapsed by default
2. Open klikken toont alle 6 cards
3. Edit Anthropic-key, blur → auto-save werkt

---

### Task 14: Deploy naar prod (optioneel — kan ook door eerste deploy-cyclus)

Volg dezelfde stappen als de sharp-fix deploy:

1. SCP de gewijzigde files naar `/opt/blogtool` op de VPS (`187.124.171.70`)
2. `docker compose build blogtool` (re-build de standalone bundle)
3. `docker compose up -d blogtool`
4. Verifieer logs schoon
5. Playwright-test op prod

(Zie sessie-historie voor de exacte deploy-script structuur.)

---

## Self-Review checklist

**1. Spec coverage**

| Spec-sectie | Task die het implementeert |
|---|---|
| Provider-registry availability | Task 1 |
| Gemini-fallback per rol | Task 2 |
| generate.ts alleen-Gemini check | Task 3 |
| patchSiteAction | Task 4 |
| useAutoSave hook | Task 5 |
| Card-states UI | Task 6 (CardHead) |
| 5 tabs | Tasks 8-12 |
| URL-routing | Task 8 |
| Brand-tab cards | Task 9 |
| Publish-tab cards | Task 10 |
| Integrations-tab (Gemini-first) | Task 11 |
| Team-tab | Task 12 |
| Danger-tab | Task 12 |
| Cleanup settings-form.tsx | Task 13 |
| Sticky tabs-bar | Task 8 (`position: sticky; top: 64px`) |

Geen ongedekte spec-secties.

**2. Placeholder scan**

- `Task 11 → GscCard / DfsCard` bevat een tijdelijke `PlaceholderCard` met expliciete TODO + uitwerking in dezelfde taak (Step 2). Niet ideal om uit te splitsen maar wel volledig actionable.
- Geen "TBD"/"vul-in-later" / "appropriate error handling" gevonden.

**3. Type consistency**

- `SaveStatus`, `useAutoSave`, `patchSiteAction`, `parseTab`, `TabKey` zijn consistent gebruikt over alle tasks.
- `CardHead` props (title, description, status, onRetry) komen overeen in elke aanroep.
- `useAutoSave` args (siteId, cardKey, values) komen overeen.

---

## Execution Handoff

Plan klaar. Twee execution-opties:

**1. Subagent-driven (recommended)** — Ik dispatch een fresh subagent per task, review tussen tasks, snel itereren.

**2. Inline execution** — Tasks uitvoeren in deze sessie via executing-plans, batch met review-checkpoints.

Welke voorkeur?
