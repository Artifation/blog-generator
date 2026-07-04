# Localized rubric fix — gerichte alinea-reparatie i.p.v. volledige reject

**Goal:** Vandaag wordt een hele draft afgekeurd (email + topic 7 dagen geparkeerd) zodra één deterministische hard-fail vuurt — met name `banlist_hits_per_1000_words > 5`. De rest van de (dure) pipeline-output gaat verloren terwijl het probleem in een handvol alinea's zit. Deze feature repareert **alleen de probleem-alinea's** en re-checkt, vóór de quality-judge draait. Zo verdwijnen "onnodige" rejects voor mechanisch oplosbare problemen.

**User intentie (origineel):** "als hij zo'n blog genereert en hem weigert bijvoorbeeld door `banlist_hits_per_1000_words > 5`, dan moet hij alleen dat stukje hergenereren in plaats van hem meteen te weigeren, zodat niet alles gaat weigeren."

## Beslissingen (vastgelegd in brainstorm)

| Vraag | Beslissing | Reden |
|---|---|---|
| Welke afkeuringen triggeren reparatie? | Alle **lokaliseerbare deterministische** fails | Niet de fuzzy judge-scores — die wijzen niet naar een specifieke passage. Deterministische signals zijn exact berekend en aanwijsbaar in de HTML. |
| Hoe groot is "het stukje"? | **Per alinea**, met context | LLM heeft genoeg context om natuurlijk met de buurzinnen mee te lopen, maar raakt alleen de geaffecteerde tekstblokken. |
| Hoeveel fix-pogingen? | **Tot schoon, max 3** | Redt de meeste drafts; harde bovengrens begrenst kosten/over-herschrijven. |
| Plek in de pipeline? | **Aanpak A — fix-loop vóór de judge** | Goedkoopst: deterministische gate = we checken zelf, judge draait één keer op schone tekst. Sluit aan op bestaand factChecker-auto-fix-patroon. |
| Em-dash + interne-links meenemen? | **Ja, als safety-net-gates** | Vuren zelden (postProcess strip em-dashes, seoEditor borgt links), maar dan is deze loop dé garantieplek voor deterministische schoonheid vóór de judge. |
| Na 3 mislukte pogingen? | **Bestaande reject** (mail + 7 dagen parkeren) | Hergebruik bestaande `Reject`-flow; geen nieuw afkeur-pad. |
| Geredde draft? | **Gewoon als WP-concept publiceren** zoals nu | Geen aparte goedkeuring; menselijke review blijft via bestaande concept-flow. |

## Scope

In:
- Pure module `src/pipeline/localizedRubricFix.ts`: alinea-locator, positie-splice, gate-evaluatie en de fix-loop (testbaar zonder netwerk).
- Mini-agent `src/agents/rubricFixer.ts` + prompt `src/agents/prompts/rubricFixer.ts`: herschrijft een set probleem-alinea's.
- Nieuwe agent-rol `rubricFixer` in `src/llm/client.ts` (`ROLE_TO_MODEL` + `GEMINI_FALLBACK`), default `gemini-2.5-flash`.
- Inhaak in `src/pipeline/orchestrator.ts` net na seoEditor/post-processing en vóór de quality-judge.
- Short-circuit reject-tak voor "na 3 pogingen nog steeds banlist > 5", spiegelend op de bestaande factcheck-short-circuit.
- `logStage`-events per fix-poging.

Out (bewust niet, deze iteratie):
- Reparatie van fuzzy judge-scores (readability, brand_voice, semantic_completeness) — niet lokaliseerbaar naar één passage.
- Reactieve reparatie ná een NO-GO (Aanpak B) — duurder, dubbele judge-call.
- De seoEditor opnieuw draaien (Aanpak C) — herverwerkt de hele draft.
- Wijzigingen aan de Success-mail (optioneel later: "N alinea's auto-hersteld" tonen).
- Per-tenant configureerbare drempels via `config.yaml` — drempels staan nu hard in code (matchen de judge-prompt). Config-extractie kan later.

## Gate-set

Eén config-object `LOCALIZABLE_GATES` met de deterministische gates die deze loop afdwingt:

| Gate | Conditie | Type fix | Hard? |
|---|---|---|---|
| `banlist` | `banlist_hits_per_1000_words > 5` | alinea-herschrijving (LLM) | **Ja** — blokkeert publish |
| `emdash` | `emdash_per_1000_words > 5` | alinea-herschrijving (LLM) | Nee — safety-net |
| `internal_links` | `internal_link_count < 5` | deterministische injectie (geen LLM) | Nee — safety-net |

Alleen `banlist` is een harde gate die na 3 pogingen tot reject leidt. `emdash` en `internal_links` zijn best-effort: faalt het na 3 pogingen, dan gaat de draft alsnog naar de judge (die ze meeweegt in de score, zoals nu).

> Drempel `> 5` voor banlist/emdash is exact gelijk aan de hard-fail in `src/agents/prompts/qualityJudge.ts` ("banlist_hits_per_1000_words > 5"), zodat de loop precies dezelfde lat hanteert als de judge.

## Het fixer-agent (contract)

**Rol:** `rubricFixer` — default `{ provider: "gemini", model: "gemini-2.5-flash", maxTokens: 4000 }`, Gemini-fallback gelijk. Goedkoop want alleen de probleem-alinea's gaan mee, niet de hele draft.

**Input (user-prompt JSON):**
```ts
{
  paragraphs: { id: number; html: string;
                problems: { banned_phrases: string[]; has_emdash: boolean } }[],
  brand_voice: string,    // tenant.brand.voice
  ban_list: string[]      // volledige tenant.brand.ban_list
}
```

**Output (strict Zod-schema):**
```ts
RubricFixerOutputSchema = z.object({
  fixed_paragraphs: z.array(z.object({
    id: z.number(),
    html: z.string().min(1),
  })),
})
```

**Prompt-regels:**
- Verwijder elke banned phrase en elke em-dash uit de aangeleverde alinea's.
- **Behoud betekenis, alle `<a ...>`-links (intern én extern), en inline-HTML** (`<strong>`, `<em>`, `<a>`, etc.).
- Ongeveer dezelfde lengte; geen content toevoegen/weglaten buiten de fix.
- NL, Artifation brand-voice (jij/jouw-vorm).
- **Introduceer GEEN enkel woord/zin uit `ban_list`.**
- Geef exact één output-alinea terug per input-`id`, in dezelfde volgorde, met hetzelfde `id`.

**Code-validatie (in `localizedRubricFix.ts`):** komt de set output-`id`'s niet exact overeen met de input-`id`'s (zelfde aantal, zelfde id's) → de poging telt als mislukt, `edited_html` blijft ongewijzigd, de loop probeert opnieuw (binnen de max-3-grens). Dit voorkomt dat een hallucinerende fixer content sloopt.

## Locator + splice

**`findOffendingBlocks(html, banList)`** → `{ start, end, innerProblems }[]`:
- Pakt tekstblokken via `matchAll` over `<p>`, `<li>`, `<h2|h3|h4>`, `<blockquote>` — **mét** de `match.index` (begin) en lengte (eind), zodat we op positie kunnen splicen.
- Per blok: strip HTML → lowercase → check op (a) elke `banList`-phrase als substring, en (b) het em-dash-teken `—`.
- Retourneert alleen blokken met ≥1 probleem, inclusief welke banned phrases / em-dash erin zitten.

**`spliceBlocks(html, replacements)`**:
- Vervangt elk probleemblok op **positie** (`[start, end]`), niet via `String.replace` — zo kan identieke tekst elders nooit het verkeerde blok raken.
- Verwerkt vervangingen in **aflopende `start`-volgorde**, zodat eerdere indices geldig blijven. Exact het patroon uit `src/pipeline/applyFactCheckerFixes.ts` (sort + index-veilige vervanging).

## Loop (pseudocode)

```ts
// in orchestrator, op seo.parsed.edited_html, vóór htmlForJudge-opbouw
let html = seo.parsed.edited_html;
let signals = computeDeterministicRubricSignals({ html, banList, targetKeyword, internalUrls });
let attempt = 0;

while (attempt < 3 && gatesFail(signals)) {
  const blocks = findOffendingBlocks(html, banList);            // banlist + em-dash
  if (blocks.length > 0) {
    const paragraphs = blocks.map((b, id) => ({ id, html: sliceBlock(html, b), problems: b.innerProblems }));
    const fixed = await runRubricFixer({ paragraphs, brand_voice, ban_list }, deps);
    if (validIdMapping(fixed, paragraphs)) html = spliceBlocks(html, blocks, fixed); // anders: html ongewijzigd
  }
  if (internalLinkGateFails(signals)) {
    html = injectMissingInternalLinks(html, outline.internal_links_to_inject);
  }
  signals = computeDeterministicRubricSignals({ html, banList, targetKeyword, internalUrls });
  attempt++;
  logStage({ stage: "rubricFix", topicId, attempt,
             banlistBefore, banlistAfter: signals.banlist_hits_per_1000_words,
             blocksFixed: blocks.length });
}

seo.parsed.edited_html = html;   // committen zodat judge/publish de schone versie zien
```

**Na de loop:**
- **Banlist schoon (`≤ 5`)** → door naar de bestaande flow: `htmlForJudge` opbouwen, signals/citation/judge zoals nu.
- **Banlist nog steeds `> 5` na 3 pogingen** → **short-circuit reject**: hergebruik de `Reject`-mail (`src/email/templates/Reject.tsx`) met `hardFails: ["banlist_hits_per_1000_words > 5 (na 3 fix-pogingen)"]`, topic `rejected` + `retry_after` +7 dagen, `persistRunSummary({ verdict: "rejected", ... })`. Spiegelt exact `factcheck-fail-short-circuit` in `orchestrator.ts`. De judge draait niet (bespaart de call).

> Belangrijk: de loop opereert op `edited_html` (de echte content). `htmlForJudge` (= `edited_html + schema-JSON-LD`) en de bijbehorende signals worden ná de loop opgebouwd zoals nu, zodat de judge exact ziet wat gepubliceerd wordt.

## Test plan (TDD)

Unit (`test/unit/pipeline/localizedRubricFix.test.ts`):
- `findOffendingBlocks`: detecteert banned-phrase in `<p>`, `<li>`, `<h2>`; meerdere blokken; em-dash; geen false-positives op schone blokken.
- `spliceBlocks`: vervangt op positie, behoudt niet-geraakte content, correct bij ≥2 blokken (aflopende volgorde), behoudt identieke tekst elders.
- `gatesFail` / gate-evaluatie: `banlist > 5` vuurt, `= 5` niet; `internal_link_count < 5` vuurt.
- Loop met fake-provider: stub-fixer die phrases verwijdert → convergeert < 3 pogingen, `clean = true`; stub die niets fixt → 3 pogingen, `clean = false`.
- Validatie: fixer geeft verkeerd aantal/verkeerde id's terug → poging verworpen, `html` ongewijzigd.

Integratie (mock LLM-deps, mirror op bestaande orchestrator-tests indien aanwezig):
- Draft met 6 banlist-hits → na loop banlist ≤ 5, judge ontvangt schone HTML.
- Draft die onherstelbaar blijft → short-circuit reject-tak (mail + topic `rejected` + run-summary), judge wordt niet aangeroepen.

Type-check: `npx tsc --noEmit` clean. Bestaande tests blijven groen (`vitest run`).

## Risico's / aandachtspunten

- **Fixer reïntroduceert een banned phrase** → opgevangen door re-compute + retry; na 3x reject. Prompt benadrukt expliciet "geen ban_list-woorden".
- **Banned phrase in een blok-type dat de locator niet pakt** → loop convergeert nooit binnen blokken → 3 lege/no-op pogingen → reject. Mitigatie: locator dekt p/li/h2-h4/blockquote (alle tekstdragende blokken die writer/seoEditor produceren). Edge-case loggen.
- **Interne-link-injectie** moet bestaande links niet dupliceren en een natuurlijke ankerplek kiezen; bij twijfel een "Lees ook"-regel toevoegen. Deterministisch, geen LLM.
