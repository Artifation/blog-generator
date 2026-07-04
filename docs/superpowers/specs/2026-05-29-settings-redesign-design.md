# Settings-page redesign + minder API-keys

**Status:** design — pending user review
**Datum:** 2026-05-29
**Auteur:** Claude (brainstorm met Julian)

## Probleem

Twee samenhangende klachten:

1. De settings-page ([apps/web/app/settings/settings-form.tsx](../../../apps/web/app/settings/settings-form.tsx), 760 regels in één file) voelt onoverzichtelijk. Eén verticale stroom van ~10 secties, één gigantische save-bar onderaan.
2. Te veel API-keys om in te vullen voor de eerste run. De UI suggereert "minstens Anthropic óf Gemini + de rest optioneel" maar [generate.ts:22-28](../../../apps/web/lib/actions/generate.ts#L22) eist hard alle drie van Anthropic + Gemini + Groq. Drempel voor nieuwe sites is daardoor hoger dan nodig.

## Doel

- Eén verplicht veld om te starten: **Gemini**.
- Settings-page opgesplitst in 5 tabs (Brand · Publiceren · Integraties · Team · Gevaar).
- Auto-save per card — geen sticky save-bar meer.
- Pipeline draait robuust op alleen Gemini; andere keys zijn echte overrides / feature-toggles.

## Non-goals

- Geen centrale Artifation-tenant key-vault (niet "Artifation regelt het, klant ziet niks").
- Geen overhaal van de Auteur/Pillars/Brand-voice editors zelf — alleen herplaatst.
- Geen pixel-perfect redesign — bestaande visuele stijl (cards + bestaande klassen) blijft.
- Geen migratie van bestaande keys in de DB — zonder Gemini gezet werkt env-fallback (`process.env.GEMINI_API_KEY`) onveranderd.
- Geen wijziging aan `error_events` Drizzle-bug op /errors page (apart probleem).

## Beslissingen uit brainstorm

| # | Vraag | Antwoord |
|---|---|---|
| 1 | API-keys strategie | "Echt minder keys nodig" — Gemini verplicht, rest optioneel |
| 2 | Page-layout | Tabs bovenaan (5 stuks) |
| 3 | Tab-grouping | Brand · Publiceren · Integraties · Team · Gevaar |
| 4 | Save-gedrag | Auto-save op blur (per card-granulariteit) |
| 5 | URL-routing | `?tab=X` query-param (geen sub-routes) |
| 6 | LLM-default | Gemini als enige verplichte; Anthropic + Groq als overrides |

## Architectuur

Bestandsstructuur na de refactor:

```
apps/web/app/settings/
├── page.tsx                      server component; leest `tab` searchParam,
│                                  fetcht site, redirect naar ?tab=brand bij default
├── settings-shell.tsx            client component; TabsBar + render(activeTabContent)
├── use-auto-save.ts              client hook; debounced PATCH per card
├── tabs/
│   ├── brand-tab.tsx             Basis · Brand voice · Pillars · Auteur (~250 LOC)
│   ├── publish-tab.tsx           Kwaliteit/cadans · Bestemming · WP-credentials (~180 LOC)
│   ├── integrations-tab.tsx      API-keys (Gemini + advanced) · GSC · DFS (~250 LOC)
│   ├── team-tab.tsx              Wrapper rond bestaande TeamSection (~20 LOC)
│   └── danger-tab.tsx            Delete-site (~50 LOC)
```

Bestaande [team-section.tsx](../../../apps/web/app/settings/team-section.tsx) blijft als-is, alleen verplaatst de wrapper-rendering naar `team-tab.tsx`.

Server actions:

| Action | Status |
|---|---|
| `updateSiteAction(id, full)` | blijft bestaan voor ander gebruik (onboarding, etc.) |
| `patchSiteAction(id, partial)` | **nieuw** — accepteert `Partial<UpdateSiteInput>` voor auto-save per card |
| `deleteSiteAction` | onveranderd |

Beide actions delen dezelfde server-side validation (huidige `updateSite` lib-functie ondersteunt al `Partial<CreateSiteInput>` — zie [sites.ts:187](../../../apps/web/lib/sites.ts#L187), de patch-action is een dunne wrapper).

## Auto-save mechanisme

Granulariteit: **per card**. Een card is één visuele groep (bv. "Basis", "Brand voice", "Pillars"). Wijzigingen binnen één card worden samen als één PATCH gestuurd.

### Card-states

| State | Wanneer | Visueel |
|---|---|---|
| `idle` | geen wijzigingen | leeg label rechtsboven |
| `dirty` | user typt, nog niet geblurred | gele badge "● wijziging" |
| `saving` | PATCH in flight | blauwe badge "⟳ opslaan…" |
| `saved` | PATCH succesvol | groene badge "✓ opgeslagen" (1.5s, dan terug naar idle) |
| `error` | PATCH faalde | rode badge "✗ mislukt — opnieuw" (klikbaar = retry) |

### Trigger-regels

| Veld-type | Trigger |
|---|---|
| `input[type=text]`, `textarea` | `onBlur` |
| `input[type=number]` | `onBlur` + Enter-key |
| `select` | `onChange` met 300ms debounce |
| `input[type=checkbox]`, toggle | `onChange` direct |
| Chip-array (ban list, signature phrases) | save op add/remove |
| List-array (Pillars) | save op row add/remove + row-veld blur |

### Vangnetten

- **Beforeunload**: als er een PATCH in flight is OF een card dirty is, browser-prompt "Pagina verlaten?".
- **Tab-switch**: forceer `blur()` op het actieve veld vóór `router.push`. Pending auto-save commit zo door.
- **Race condition**: tweede PATCH cancelt eerste via `AbortController`. Last-write-wins per card.
- **Validation error**: toast met server-error message, card blijft in `error`-state. Waarde blijft staan (geen rollback) zodat user zijn input kan corrigeren.
- **Network error**: zelfde flow als validation error — retry-klik herstart de PATCH met huidige veldwaardes.

### `use-auto-save` hook API

```ts
const { status, save } = useAutoSave({
  siteId: site.id,
  cardKey: "basis",  // logical group name for telemetry/debugging
  values: { name, slug, domain, language },
});

// Render:
<CardHead title="Basis" status={status} onRetry={save} />
```

Hook intern:
- `useEffect` op `values` → markeer dirty
- Trigger function exposed for blur handlers
- AbortController per save
- Server-call: `patchSiteAction(siteId, values)`

## Tab-routing

Query-param routing (`/settings?tab=brand`), niet sub-routes — voorkomt 5 extra `page.tsx` files.

### Gedrag

| Route | Resultaat |
|---|---|
| `/settings` | redirect naar `/settings?tab=brand` |
| `/settings?tab=brand` | Brand-tab actief |
| `/settings?tab=onbekend` | Brand-tab actief (default fallback) |
| Tab klikken | `router.push("/settings?tab=X")` — Next vervangt content zonder reload |
| Browser back | werkt — geschiedenis volgt tab-wisselingen |
| Refresh | blijft op huidige tab |
| Bookmark | werkt |

### Tabs-balk

Sticky bovenaan binnen de content (`position: sticky; top: 64px` o.i.d., afhankelijk van topbar-hoogte). 5 tabs:

```
[ Brand ] [ Publiceren ] [ Integraties ] [ Team ] [ Gevaar ]
                                                    ^-- rode tint
```

Active-state styling identiek aan bestaande `tfilter active` styling in topics-kanban — consistent met de rest van de app.

## API-keys UX (Integraties-tab)

### Hoofdscherm — wat user standaard ziet

Eén card bovenaan:

> **Gemini API-key** [verplicht]
> De enige key die je écht nodig hebt. Powert alle agents (writer, researcher,
> topic-suggester, image-prompter, audit). Krijg er één op
> aistudio.google.com — gratis tier voldoende voor een paar posts per week.
>
> [ AIza…             ]  [Toon]

Daaronder een uitklap-blok:

> **Geavanceerd ▾**  *override-keys en extra features*

Standaard ingeklapt. Open klikken toont 6 cards:

| Card | Badge | Wat het is | Wat er gebeurt zonder |
|---|---|---|---|
| Anthropic | optioneel | LLM-override voor writer/factChecker/qualityJudge | alles draait op Gemini |
| Groq | optioneel | snelle LLM voor image-prompter | image-prompter draait op Gemini |
| Fal.ai | optioneel | feature-image generator | posts krijgen geen image |
| Resend | optioneel | e-mail notificaties | je ziet alles in dashboard |
| Google Search Console | optioneel | striking-distance + content-gaps voor topic-suggester | suggester werkt zonder GSC, mist alleen die signalen |
| DataForSEO | optioneel · betaald | echte search volumes + SERP-audit | suggester valt terug op pure GSC + Gemini |

### Pipeline graceful fallback

De UI-belofte "alleen Gemini nodig" vereist code-wijzigingen omdat de huidige
pipeline in twee lagen hard Anthropic + Groq eist.

**Laag 1 — [src/llm/client.ts](../../../src/llm/client.ts):**
De `ROLE_TO_MODEL` map wijst de meeste agents (strategist, writer, seoEditor,
factChecker, qualityJudge, internalLinker, repurposer) naar Anthropic en
imagePrompter naar Groq. De provider-registry gooit hard bij missende
env-keys (`requireEnv` op `ANTHROPIC_API_KEY` / `GROQ_API_KEY`).

Vereiste wijziging:

- `createProviderRegistry(env)` wordt `createProviderRegistry(env, availability)`
  waar `availability` aangeeft welke providers daadwerkelijk een key hebben.
- `resolveAgentModel(role, registry)` (nieuw) kiest het primaire model, en valt
  terug op Gemini wanneer de primaire provider niet beschikbaar is. Mapping:

  | Rol | Primair | Fallback |
  |---|---|---|
  | strategist, writer, seoEditor, factChecker, qualityJudge, internalLinker, repurposer | anthropic | gemini |
  | imagePrompter | groq | gemini |
  | researcher, topicSuggester | gemini | n.v.t. (fail hard als ook Gemini ontbreekt) |

- De Gemini-fallback moet een redelijk model kiezen per rol (bv.
  `gemini-2.5-pro` voor strategist/writer, evt. `gemini-2.5-flash` voor
  goedkope rollen). Concrete model-mapping in implementatie-plan.

**Laag 2 — [apps/web/lib/actions/generate.ts:22-28](../../../apps/web/lib/actions/generate.ts#L22):**
Vervang de hard `Anthropic + Gemini + Groq` check door alleen Gemini:

```
const geminiKey = site.apiKeys?.gemini ?? env.GEMINI_API_KEY;
if (!geminiKey) {
  return { ok: false, error: "Gemini API-key vereist. Ga naar Instellingen → Integraties." };
}
```

**Laag 3 — image-pipeline ([apps/web/lib/pipeline/runForSite.ts](../../../apps/web/lib/pipeline/runForSite.ts)):**
Fal-key ontbrekend → skip image-generatie, draft krijgt `imagePath: null`.
Verifieer dat de draft-render dit al netjes afhandelt (waarschijnlijk wel,
gegeven `imagePath: string | null` in schema).

**Laag 4 — Resend:**
[lib/errors/email-alert.ts](../../../apps/web/lib/errors/email-alert.ts) en
de notificatie-flow bij nieuwe drafts. Resend-key ontbrekend → email-pad
skipt zonder error. Bestaat waarschijnlijk al via `emailConfig.enabled`;
verifiëren tijdens implementatie.

## Implementatie-volgorde

Hoge → lage prioriteit, los deploybaar:

1. Pipeline fallback (zodat de UI-belofte achteraf niet leeg is).
2. `patchSiteAction` + `useAutoSave` hook.
3. Settings-shell + tabs-bar + URL-routing.
4. 5 tab-componenten (brand / publish / integrations / team / danger), elk los gemigreerd van settings-form.tsx.
5. Settings-form.tsx wordt verwijderd nadat de laatste sectie is gemigreerd.

## Risico's

| Risico | Mitigatie |
|---|---|
| Pipeline-fallback breekt bestaande runs op sites die wel Anthropic gezet hebben | Fallback is alleen "key leeg → gebruik Gemini"; ingevulde key blijft voorrang krijgen |
| Auto-save schrijft per ongeluk een verkeerd typeable veld (bv. typo in pillar-naam) naar DB | Acceptabel — settings zijn forgiving, user kan direct corrigeren |
| Race condition bij snelle tab-switch met dirty card | Beforeunload + forced blur op tab-switch dekken het af |
| User confused door fading "✓ opgeslagen" indicator | 1.5s zichtbaar is genoeg; matches industrie-conventie (Notion, Linear) |
| Sticky tabs-bar past niet binnen bestaande shell-layout (z-index conflicten) | Fallback: tabs-bar scrollt mee — degradeert sierlijk, tab-functionaliteit blijft werken |

## Wat hierna

Volgende stap: [`writing-plans`](../plans/) skill — concrete implementation plan met per-stap acceptatie-criteria en test-strategie, gebaseerd op deze spec.
