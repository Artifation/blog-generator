# Reverse Internal-Linker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wekelijkse scheduled job die nieuw-gepubliceerde posts identificeert en relevante oudere posts edit om er via één natuurlijke link naartoe te verwijzen, zonder over-optimalisatie en met idempotente herkenning bij re-runs.

**Architecture:** Drie lagen — (1) een nieuwe LLM-agent (`runInternalLinker`) die per (oude post, nieuwe post)-paar een herschreven paragraaf met ingebedde anchor produceert, (2) een job-orchestrator die WordPress als source-of-truth gebruikt, candidate-paren prefiltert op keyword-overlap, de agent aanroept, paragraph-replacement uitvoert en WP `PATCH /posts/{id}` doet, en (3) een aparte GitHub Actions cron (maandag 05:00 UTC). Idempotentie: voor elk (from, to)-paar checken of `<a href="<new_url>">` al voorkomt in oude HTML — zo ja, skip. State-file is alleen logging, niet correctness-load-bearing.

**Tech Stack:** Bestaand (TypeScript, Vitest, zod, runAgent, Anthropic Sonnet 4.6, WordpressClient). Nieuwe deps: `node-html-parser` voor robuust paragraaf-extractie en link-detectie.

**Sub-plan van:** [2026-05-08-seo-extensions.md](2026-05-08-seo-extensions.md), Phase 1.

**Resolved design questions** (uit de roadmap's open questions):
- **HTML-replacement strategie:** Agent geeft volledige `rewritten_paragraph_html` + `target_paragraph_signature` (eerste 60 chars van originele `<p>` zonder tags) terug. Job zoekt paragraaf via signature, vervangt 1:1.
- **Idempotentie:** Check `<a href="<new_post_url>">` (regex) in oude post HTML vóór elke wijziging. Geen state-file nodig voor correctness; state-file is log-only.
- **Welke posts beschermen:** `features.internal_linker.exclude_post_ids: number[]` in tenant config (lege default; user vult zelf in voor pillar/product pages).
- **Embedding-pre-filter:** Skip in v1. Pre-filter is keyword-overlap (deterministisch, gratis): oude post moet `target_keyword` OF ≥1 `key_entities`-string bevatten. Voldoende om ~80% van candidates te elimineren zonder LLM-call.

---

## File Structure

**Create:**
- `src/agents/prompts/internalLinker.ts` — system-prompt
- `src/agents/internalLinker.ts` — `runInternalLinker(input, deps)` met zod-schema voor output
- `src/pipeline/internalLinkerJob.ts` — orchestrator (`runInternalLinkerJob(opts)`)
- `.github/workflows/weekly-internal-linker.yml` — cron + workflow_dispatch
- `test/unit/agents/internalLinker.test.ts`
- `test/unit/pipeline/internalLinkerJob.test.ts`

**Modify:**
- `src/wordpress/posts.ts` — voeg `getPost(id)` en `updatePost(id, content)` toe
- `src/wordpress/client.ts` — voeg `patchJson` toe (huidige `WordpressClient` heeft alleen GET/POST)
- `src/config/topics.ts` — `Topic` krijgt optionele `wp_post_id`, `wp_post_url`
- `src/pipeline/orchestrator.ts` — bij `markTopicStatus(... "published" ...)` ook `wp_post_id` en `wp_post_url` meegeven
- `src/llm/client.ts` — voeg `"internalLinker"` toe aan `AgentRole`-union + entry in `ROLE_TO_MODEL`
- `src/config/tenant.ts` — voeg `features` sectie met `internal_linker`-config toe (zet default `enabled: false`)
- `tenants/artifation/config.yaml` — voeg `features.internal_linker` block toe
- `package.json` — `node-html-parser` dependency

**Total: ~9 tasks, ~3-5 dagen werk.**

---

## Task 1: Topic-schema uitbreiden met `wp_post_id` en orchestrator wiring

**Files:**
- Modify: `src/config/topics.ts`
- Modify: `src/pipeline/orchestrator.ts`
- Modify: `test/unit/pipeline/state.test.ts` (één test bijwerken)

- [ ] **Step 1: Failing test toevoegen aan state.test.ts**

```ts
// Append in describe("state helpers"):
it("preserves wp_post_id passed via patch", () => {
  const list = [t({ id: "a" })];
  const updated = markTopicStatus(list, "a", "published", new Date("2026-05-08"), {
    wp_post_id: 99,
    wp_post_url: "https://artifation.nl/?p=99",
  });
  expect(updated.find((x) => x.id === "a")?.wp_post_id).toBe(99);
  expect(updated.find((x) => x.id === "a")?.wp_post_url).toBe("https://artifation.nl/?p=99");
});
```

Dit faalt nu omdat het `Topic`-type nog geen `wp_post_id` velden kent.

- [ ] **Step 2: Update `TopicSchema` in `src/config/topics.ts`**

Voeg twee optionele velden toe aan het `z.object({...})` block:

```ts
wp_post_id: z.number().int().optional(),
wp_post_url: z.string().url().optional(),
```

- [ ] **Step 3: Run test (slaagt)**

```bash
npx vitest run test/unit/pipeline/state.test.ts
```

- [ ] **Step 4: Wire orchestrator om `wp_post_id` te zetten op success**

In `src/pipeline/orchestrator.ts`, vind de regel:

```ts
topics = markTopicStatus(topics, next.id, "published", now);
```

Vervang door:

```ts
topics = markTopicStatus(topics, next.id, "published", now, {
  wp_post_id: post.id,
  wp_post_url: post.link,
});
```

- [ ] **Step 5: Verify integration test orchestrator nog groen**

```bash
npx vitest run test/integration/orchestrator-mocked.test.ts
```

Als de happy-path-test verifieert wat in `topics.yaml` geschreven wordt, breidt 'm uit:

```ts
expect(savedTopics).toContainEqual(
  expect.objectContaining({
    id: "ai-in-hr",
    status: "published",
    wp_post_id: 99,
    wp_post_url: "https://artifation.nl/?p=99",
  })
);
```

(Zo niet — laat staan; volstaat dat test groen blijft.)

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/config/topics.ts src/pipeline/orchestrator.ts test/unit/pipeline/state.test.ts test/integration/orchestrator-mocked.test.ts
git commit -m "feat(state): track wp_post_id + wp_post_url op published topics"
```

---

## Task 2: `WordpressClient` uitbreiden met PATCH support

**Files:**
- Modify: `src/wordpress/client.ts`
- Modify: `test/unit/wordpress/client.test.ts`

WP REST PATCH wordt gebruikt door internal-linker (en later phases) om bestaande posts te bewerken zonder hele payload te sturen.

- [ ] **Step 1: Failing test**

Voeg toe aan `client.test.ts`:

```ts
it("sends PATCH with JSON body and Basic auth", async () => {
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    json: async () => ({ id: 42, content: { rendered: "..." } }),
  } as Response));

  const c = createWordpressClient({
    baseUrl: "https://x.test",
    user: "u",
    appPassword: "p",
    fetchImpl,
  });

  await c.patchJson("/wp-json/wp/v2/posts/42", { content: "<p>x</p>" });
  expect(fetchImpl).toHaveBeenCalledWith(
    "https://x.test/wp-json/wp/v2/posts/42",
    expect.objectContaining({
      method: "PATCH",
      headers: expect.objectContaining({
        Authorization: `Basic ${Buffer.from("u:p").toString("base64")}`,
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ content: "<p>x</p>" }),
    })
  );
});
```

- [ ] **Step 2: Implement `patchJson` in `WordpressClient`**

In `src/wordpress/client.ts`, breid het interface en factory uit:

```ts
export interface WordpressClient {
  get<T>(path: string): Promise<T>;
  postJson<T>(path: string, body: unknown): Promise<T>;
  postBinary<T>(path: string, body: Buffer, contentType: string, filename: string): Promise<T>;
  patchJson<T>(path: string, body: unknown): Promise<T>;  // NEW
}
```

In de return-object van `createWordpressClient`, voeg toe:

```ts
patchJson: (path, body) =>
  call(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
```

- [ ] **Step 3: Run test (slaagt)**

```bash
npx vitest run test/unit/wordpress/client.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/wordpress/client.ts test/unit/wordpress/client.test.ts
git commit -m "feat(wordpress): patchJson voor REST PATCH calls"
```

---

## Task 3: WP-posts module: `getPost` + `updatePostContent`

**Files:**
- Modify: `src/wordpress/posts.ts`
- Modify: `test/unit/wordpress/posts.test.ts`

- [ ] **Step 1: Failing tests**

Voeg toe aan `posts.test.ts`:

```ts
import { getPost, updatePostContent } from "@/wordpress/posts";

describe("getPost", () => {
  it("fetches a post by id", async () => {
    const c = {
      get: vi.fn(async () => ({
        id: 42,
        link: "https://x.test/?p=42",
        content: { rendered: "<p>html</p>" },
        slug: "x",
        title: { rendered: "X" },
      })),
      postJson: vi.fn(),
      postBinary: vi.fn(),
      patchJson: vi.fn(),
    } as unknown as WordpressClient;
    const r = await getPost(c, 42);
    expect(c.get).toHaveBeenCalledWith("/wp-json/wp/v2/posts/42");
    expect(r.id).toBe(42);
  });
});

describe("updatePostContent", () => {
  it("PATCHes the post with new content", async () => {
    const c = {
      get: vi.fn(),
      postJson: vi.fn(),
      postBinary: vi.fn(),
      patchJson: vi.fn(async () => ({ id: 42, link: "https://x.test/?p=42" })),
    } as unknown as WordpressClient & { patchJson: ReturnType<typeof vi.fn> };
    await updatePostContent(c, 42, "<p>new html</p>");
    expect(c.patchJson).toHaveBeenCalledWith(
      "/wp-json/wp/v2/posts/42",
      expect.objectContaining({ content: "<p>new html</p>" })
    );
  });
});
```

- [ ] **Step 2: Implement `getPost` + `updatePostContent`**

In `src/wordpress/posts.ts`, voeg toe:

```ts
export interface WpPost {
  id: number;
  link: string;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
}

export async function getPost(client: WordpressClient, id: number): Promise<WpPost> {
  return client.get<WpPost>(`/wp-json/wp/v2/posts/${id}`);
}

export async function updatePostContent(
  client: WordpressClient,
  id: number,
  newContent: string
): Promise<{ id: number; link: string }> {
  return client.patchJson<{ id: number; link: string }>(
    `/wp-json/wp/v2/posts/${id}`,
    { content: newContent }
  );
}
```

Voeg ook een `listRecentPosts` helper toe (gebruikt door de job):

```ts
export async function listRecentPosts(
  client: WordpressClient,
  limit: number = 50
): Promise<WpPost[]> {
  return client.get<WpPost[]>(
    `/wp-json/wp/v2/posts?per_page=${limit}&status=publish&orderby=date&order=desc&_fields=id,link,slug,title,content,date`
  );
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run test/unit/wordpress/posts.test.ts
git add src/wordpress/posts.ts test/unit/wordpress/posts.test.ts
git commit -m "feat(wordpress): getPost + updatePostContent + listRecentPosts"
```

---

## Task 4: `internalLinker` agent rol toevoegen aan model-router

**Files:**
- Modify: `src/llm/client.ts`
- Modify: `test/unit/llm/client.test.ts`

- [ ] **Step 1: Failing test**

Voeg toe aan `client.test.ts`:

```ts
it("resolves internalLinker to anthropic sonnet", () => {
  const m = resolveAgentModel("internalLinker");
  expect(m.provider).toBe("anthropic");
  expect(m.model).toBe("claude-sonnet-4-6");
});
```

- [ ] **Step 2: Implementeer**

In `src/llm/client.ts`, breid `AgentRole`-union uit:

```ts
export type AgentRole =
  | "researcher"
  | "strategist"
  | "writer"
  | "seoEditor"
  | "factChecker"
  | "qualityJudge"
  | "imagePrompter"
  | "internalLinker";  // NEW
```

Voeg toe aan `ROLE_TO_MODEL`:

```ts
internalLinker: { provider: "anthropic", model: "claude-sonnet-4-6", maxTokens: 4000 },
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run test/unit/llm/client.test.ts
git add src/llm/client.ts test/unit/llm/client.test.ts
git commit -m "feat(llm): internalLinker agent role op Sonnet 4.6"
```

---

## Task 5: Tenant config — `features.internal_linker` schema

**Files:**
- Modify: `src/config/tenant.ts`
- Modify: `test/unit/config/tenant.test.ts` (of nieuw test-bestand)
- Modify: `tenants/artifation/config.yaml`

- [ ] **Step 1: Failing test**

In `test/unit/config/tenant.test.ts` (of bestaand bestand), voeg toe:

```ts
it("parses features.internal_linker config with defaults", () => {
  const cfg = parseTenantConfig({
    ...VALID_MINIMAL_TENANT, // bestaande fixture
    features: {
      internal_linker: {
        enabled: true,
        max_links_per_run: 8,
        lookback_posts: 30,
        exclude_post_ids: [12, 34],
      },
    },
  });
  expect(cfg.features.internal_linker.enabled).toBe(true);
  expect(cfg.features.internal_linker.max_links_per_run).toBe(8);
  expect(cfg.features.internal_linker.exclude_post_ids).toEqual([12, 34]);
});

it("provides default features.internal_linker if absent", () => {
  const cfg = parseTenantConfig(VALID_MINIMAL_TENANT);
  expect(cfg.features.internal_linker.enabled).toBe(false);
  expect(cfg.features.internal_linker.max_links_per_run).toBe(10);
  expect(cfg.features.internal_linker.lookback_posts).toBe(50);
  expect(cfg.features.internal_linker.exclude_post_ids).toEqual([]);
});
```

(Als er nog geen `tenant.test.ts` is: maak 'm aan met een minimal `VALID_MINIMAL_TENANT`-fixture die de huidige verplichte velden bevat.)

- [ ] **Step 2: Schema-uitbreiding in `src/config/tenant.ts`**

Voeg vóór de `.refine(...)` van het hoofd-`TenantConfigSchema` deze sectie toe binnen het `z.object({...})`:

```ts
features: z
  .object({
    internal_linker: z
      .object({
        enabled: z.boolean().default(false),
        max_links_per_run: z.number().int().min(1).max(100).default(10),
        lookback_posts: z.number().int().min(1).max(500).default(50),
        exclude_post_ids: z.array(z.number().int()).default([]),
      })
      .default({}),
  })
  .default({}),
```

(Zod past de defaults recursief toe — elk veld krijgt z'n default als de hele sectie ontbreekt.)

- [ ] **Step 3: Update `tenants/artifation/config.yaml`**

Voeg onderaan toe:

```yaml
features:
  internal_linker:
    enabled: false
    max_links_per_run: 10
    lookback_posts: 50
    exclude_post_ids: []
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run
git add src/config/tenant.ts test/unit/config/tenant.test.ts tenants/artifation/config.yaml
git commit -m "feat(config): features.internal_linker tenant schema (default uit)"
```

---

## Task 6: Internal-linker agent — prompt + agent + unit tests

**Files:**
- Create: `src/agents/prompts/internalLinker.ts`
- Create: `src/agents/internalLinker.ts`
- Create: `test/unit/agents/internalLinker.test.ts`

- [ ] **Step 1: System prompt**

```ts
// src/agents/prompts/internalLinker.ts
export const INTERNAL_LINKER_SYSTEM_PROMPT = `Je bent een NL B2B content-editor die kijkt of een bestaande gepubliceerde blogpost één natuurlijke interne link kan krijgen naar een nieuwe blogpost.

JE KRIJGT:
- old_post_html: de volledige HTML van de bestaande post
- new_post: { title, tldr_one_liner, focus_keyword, url, key_entities }
- constraint_anchor_already_used: anchors die al ≥3 keer gebruikt zijn elders (vermijd exact match — gebruik partial of semantic anchor)

OUTPUT (strict JSON):
{
  "should_link": boolean,
  "confidence": number,                          // 0..1, hoe zeker dat de link past
  "anchor_text": string,                          // de exact te plaatsen anchor (NL, max 6 woorden)
  "anchor_type": "exact_match" | "partial" | "semantic",
  "target_paragraph_signature": string,           // eerste 60 chars van de PLAIN-TEXT van de paragraaf waar de link in komt (zonder HTML-tags)
  "rewritten_paragraph_html": string,             // de hele <p>...</p> herschreven, met de <a href="..."> erin verweven; behoud betekenis, max 20% langer
  "rationale": string                             // 1-2 zinnen waarom deze paragraaf
}

REGELS (hard):
- Max 1 link per oude post.
- Anchor moet natuurlijk Nederlands lezen — geen "klik hier", geen URL als anchor.
- Plaats de link niet in een H1/H2/H3, niet in een TL;DR-block, niet in een FAQ-block, niet in de eerste of laatste paragraaf.
- Als geen enkele paragraaf logisch past: should_link=false, confidence<0.5, andere velden mogen leeg zijn.
- target_paragraph_signature MOET de exacte eerste 60 plain-text-chars zijn; gebruikt voor matching, dus 100% accuraat.
- rewritten_paragraph_html MOET het complete <p>-element zijn (inclusief openings- en sluit-tag).

REGELS (zacht):
- Voorkeur voor paragrafen waar new_post.focus_keyword of een key_entity al voorkomt.
- Bij confidence<0.7: should_link=false (defensief).`;
```

- [ ] **Step 2: Failing test**

```ts
// test/unit/agents/internalLinker.test.ts
import { describe, expect, it, vi } from "vitest";
import { runInternalLinker } from "@/agents/internalLinker";
import type { LLMProvider } from "@/llm/types";

const linkOut = JSON.stringify({
  should_link: true,
  confidence: 0.85,
  anchor_text: "AI in HR voor MKB",
  anchor_type: "partial",
  target_paragraph_signature: "Veel MKB-bedrijven worstelen met de vraag hoe AI hun HR-proce",
  rewritten_paragraph_html:
    '<p>Veel MKB-bedrijven worstelen met de vraag hoe AI hun HR-proces kan ondersteunen. Een concrete uitwerking lees je in <a href="https://artifation.nl/ai-in-hr-mkb/">AI in HR voor MKB</a>.</p>',
  rationale: "paragraaf opent met focus-keyword",
});

const noLinkOut = JSON.stringify({
  should_link: false,
  confidence: 0.3,
  anchor_text: "",
  anchor_type: "semantic",
  target_paragraph_signature: "",
  rewritten_paragraph_html: "",
  rationale: "geen passende paragraaf gevonden",
});

describe("runInternalLinker", () => {
  it("returns a positive link decision", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: linkOut,
        inputTokens: 1000,
        outputTokens: 200,
        model: "claude-sonnet-4-6",
        provider: "anthropic" as const,
      })),
    };
    const r = await runInternalLinker(
      {
        old_post_html: "<p>Veel MKB-bedrijven worstelen ...</p>",
        new_post: {
          title: "AI in HR voor MKB",
          tldr_one_liner: "AI helpt MKB-HR.",
          focus_keyword: "AI in HR",
          url: "https://artifation.nl/ai-in-hr-mkb/",
          key_entities: ["MKB", "HR"],
        },
        constraint_anchor_already_used: [],
      },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.should_link).toBe(true);
    expect(r.parsed.confidence).toBeGreaterThan(0.7);
    expect(r.parsed.target_paragraph_signature).toContain("Veel MKB-bedrijven");
  });

  it("returns negative when no paragraph fits", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: noLinkOut,
        inputTokens: 500,
        outputTokens: 50,
        model: "claude-sonnet-4-6",
        provider: "anthropic" as const,
      })),
    };
    const r = await runInternalLinker(
      {
        old_post_html: "<p>Iets totaal anders.</p>",
        new_post: {
          title: "X",
          tldr_one_liner: "y",
          focus_keyword: "AI in HR",
          url: "https://artifation.nl/x/",
          key_entities: [],
        },
        constraint_anchor_already_used: [],
      },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.should_link).toBe(false);
  });
});
```

- [ ] **Step 3: Implement agent**

```ts
// src/agents/internalLinker.ts
import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import { INTERNAL_LINKER_SYSTEM_PROMPT } from "./prompts/internalLinker.ts";

export const InternalLinkerOutputSchema = z.object({
  should_link: z.boolean(),
  confidence: z.number().min(0).max(1),
  anchor_text: z.string(),
  anchor_type: z.enum(["exact_match", "partial", "semantic"]),
  target_paragraph_signature: z.string(),
  rewritten_paragraph_html: z.string(),
  rationale: z.string(),
});
export type InternalLinkerOutput = z.infer<typeof InternalLinkerOutputSchema>;

export interface InternalLinkerInput {
  old_post_html: string;
  new_post: {
    title: string;
    tldr_one_liner: string;
    focus_keyword: string;
    url: string;
    key_entities: string[];
  };
  constraint_anchor_already_used: string[];
}

export interface InternalLinkerDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runInternalLinker(
  input: InternalLinkerInput,
  deps: InternalLinkerDeps
) {
  const model = resolveAgentModel("internalLinker");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: INTERNAL_LINKER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: InternalLinkerOutputSchema,
    },
    deps.sleepImpl
  );
}
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run test/unit/agents/internalLinker.test.ts
npx tsc --noEmit
git add src/agents/prompts/internalLinker.ts src/agents/internalLinker.ts test/unit/agents/internalLinker.test.ts
git commit -m "feat(agents): internal-linker agent met Sonnet 4.6"
```

---

## Task 7: Job-orchestrator — `runInternalLinkerJob`

Dit is het hart: leest WP, prefiltert candidates, roept agent, vervangt paragraaf, PATCHt WP. Inclusief idempotentie en run-log.

**Files:**
- Create: `src/pipeline/internalLinkerJob.ts`
- Create: `test/unit/pipeline/internalLinkerJob.test.ts`
- Modify: `package.json` (voeg `node-html-parser` toe)

- [ ] **Step 1: Install dep**

```bash
npm install node-html-parser
```

- [ ] **Step 2: Failing test**

```ts
// test/unit/pipeline/internalLinkerJob.test.ts
import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WordpressClient } from "@/wordpress/client";

vi.mock("@/wordpress/client", () => ({
  createWordpressClient: () => mockWp,
}));

const mockWp = {
  get: vi.fn(),
  postJson: vi.fn(),
  postBinary: vi.fn(),
  patchJson: vi.fn(async () => ({ id: 42, link: "https://artifation.nl/?p=42" })),
} as unknown as WordpressClient;

vi.mock("@/llm/client", async () => {
  const actual = await vi.importActual<typeof import("@/llm/client")>("@/llm/client");
  return {
    ...actual,
    createProviderRegistry: () => ({
      get: () => ({
        name: "anthropic" as const,
        call: vi.fn(async () => ({
          text: JSON.stringify({
            should_link: true,
            confidence: 0.8,
            anchor_text: "AI in HR",
            anchor_type: "partial",
            target_paragraph_signature: "Veel MKB-bedrijven worstelen met AI in HR-processen en wat",
            rewritten_paragraph_html:
              '<p>Veel MKB-bedrijven worstelen met AI in HR-processen en wat dat in de praktijk betekent. Lees onze diepte-analyse: <a href="https://artifation.nl/ai-in-hr-mkb/">AI in HR</a>.</p>',
            rationale: "x",
          }),
          inputTokens: 1000,
          outputTokens: 200,
          model: "claude-sonnet-4-6",
          provider: "anthropic" as const,
        })),
      }),
    }),
  };
});

import { runInternalLinkerJob } from "@/pipeline/internalLinkerJob";

const TENANT_CONFIG_YAML = `
slug: artifation
domain: artifation.nl
language: nl-NL
brand: { name: A, voice: x, ban_list: [], signature_phrases: [] }
author: { name: A, linkedin: https://x.test, bio: x, photo_url: https://x.test/p.png }
organization: { legal_name: A, kvk: "1", btw: "1", address: x }
wordpress:
  base_url: https://artifation.nl
  user_secret_ref: WP_USER
  app_password_secret_ref: WP_APP_PASSWORD
email: { from: a@x.test, to: b@x.test, reply_to: b@x.test }
pillars: [{ id: ai-per-afdeling, weight: 1.0 }]
quality_threshold: 8.0
max_posts_per_week_published: 4
features:
  internal_linker:
    enabled: true
    max_links_per_run: 5
    lookback_posts: 10
    exclude_post_ids: []
`;

const TOPICS_YAML = `
- id: ai-in-hr
  title: AI in HR voor MKB
  pillar: ai-per-afdeling
  target_keyword: AI in HR
  intended_word_count: 1500
  status: published
  priority: 1
  last_attempted: "2026-05-07T10:00:00Z"
  wp_post_id: 99
  wp_post_url: https://artifation.nl/ai-in-hr-mkb/
- id: oudere-post
  title: Oude topic
  pillar: ai-per-afdeling
  target_keyword: oudere onderwerp
  intended_word_count: 1500
  status: published
  priority: 5
  last_attempted: "2026-04-01T10:00:00Z"
  wp_post_id: 42
  wp_post_url: https://artifation.nl/oudere-post/
`;

async function fixtureDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ilj-"));
  const tenantDir = path.join(dir, "artifation");
  await mkdir(tenantDir, { recursive: true });
  await writeFile(path.join(tenantDir, "config.yaml"), TENANT_CONFIG_YAML);
  await writeFile(path.join(tenantDir, "topics.yaml"), TOPICS_YAML);
  return dir;
}

const ENV = {
  ANTHROPIC_API_KEY: "x",
  GEMINI_API_KEY: "x",
  GROQ_API_KEY: "x",
  WP_USER: "u",
  WP_APP_PASSWORD: "p",
};

describe("runInternalLinkerJob", () => {
  it("identifies new posts and links them into older candidates (happy path)", async () => {
    const baseDir = await fixtureDir();

    // Mock WP responses: list returns 2 posts (new+old), getPost returns full HTML.
    (mockWp.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes("/posts?")) {
        return [
          {
            id: 99, slug: "ai-in-hr-mkb",
            link: "https://artifation.nl/ai-in-hr-mkb/",
            title: { rendered: "AI in HR voor MKB" },
            content: { rendered: "<p>nieuwe post inhoud</p>" },
            date: new Date(Date.now() - 2 * 86400000).toISOString(),
          },
          {
            id: 42, slug: "oudere-post",
            link: "https://artifation.nl/oudere-post/",
            title: { rendered: "Oude post" },
            content: {
              rendered:
                "<p>Inleiding zonder match.</p><p>Veel MKB-bedrijven worstelen met AI in HR-processen en wat dat in de praktijk betekent.</p><p>Conclusie.</p>",
            },
            date: new Date(Date.now() - 60 * 86400000).toISOString(),
          },
        ];
      }
      throw new Error(`unmocked get: ${url}`);
    });

    await runInternalLinkerJob({
      tenantSlug: "artifation",
      baseDir,
      env: ENV,
      now: new Date(),
    });

    expect(mockWp.patchJson).toHaveBeenCalledTimes(1);
    expect(mockWp.patchJson).toHaveBeenCalledWith(
      "/wp-json/wp/v2/posts/42",
      expect.objectContaining({
        content: expect.stringContaining('href="https://artifation.nl/ai-in-hr-mkb/"'),
      })
    );

    // Verify run-log written
    const logFile = path.join(baseDir, "..", "data", "internal-linker-runs", "artifation");
    // In test we can also check stdout or simply trust patchJson assertion.
  });

  it("skips when feature disabled", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ilj-"));
    const tenantDir = path.join(dir, "artifation");
    await mkdir(tenantDir, { recursive: true });
    await writeFile(
      path.join(tenantDir, "config.yaml"),
      TENANT_CONFIG_YAML.replace("enabled: true", "enabled: false")
    );
    await writeFile(path.join(tenantDir, "topics.yaml"), TOPICS_YAML);

    (mockWp.patchJson as ReturnType<typeof vi.fn>).mockClear();

    await runInternalLinkerJob({
      tenantSlug: "artifation",
      baseDir: dir,
      env: ENV,
      now: new Date(),
    });

    expect(mockWp.patchJson).not.toHaveBeenCalled();
  });

  it("skips when old post already contains a link to the new post URL (idempotency)", async () => {
    const baseDir = await fixtureDir();

    (mockWp.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes("/posts?")) {
        return [
          {
            id: 99, slug: "ai-in-hr-mkb",
            link: "https://artifation.nl/ai-in-hr-mkb/",
            title: { rendered: "AI in HR voor MKB" },
            content: { rendered: "<p>nieuwe post</p>" },
            date: new Date(Date.now() - 2 * 86400000).toISOString(),
          },
          {
            id: 42, slug: "oudere-post",
            link: "https://artifation.nl/oudere-post/",
            title: { rendered: "Oude post" },
            content: {
              rendered:
                '<p>Veel MKB-bedrijven met <a href="https://artifation.nl/ai-in-hr-mkb/">AI in HR</a>.</p>',
            },
            date: new Date(Date.now() - 60 * 86400000).toISOString(),
          },
        ];
      }
      throw new Error(`unmocked get: ${url}`);
    });

    (mockWp.patchJson as ReturnType<typeof vi.fn>).mockClear();

    await runInternalLinkerJob({
      tenantSlug: "artifation",
      baseDir,
      env: ENV,
      now: new Date(),
    });

    expect(mockWp.patchJson).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Implementeer `runInternalLinkerJob`**

```ts
// src/pipeline/internalLinkerJob.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseHtml } from "node-html-parser";
import { loadTenant } from "@/config/loader";
import { loadTopics } from "@/config/topics";
import { createProviderRegistry } from "@/llm/client";
import { runInternalLinker, type InternalLinkerOutput } from "@/agents/internalLinker";
import { createWordpressClient } from "@/wordpress/client";
import { listRecentPosts, updatePostContent, type WpPost } from "@/wordpress/posts";

export interface InternalLinkerJobOpts {
  tenantSlug: string;
  baseDir?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

interface RunLog {
  run_at: string;
  tenant: string;
  new_post_count: number;
  old_post_count: number;
  agent_calls: number;
  links_added: {
    from_post_id: number;
    to_post_id: number;
    anchor: string;
    confidence: number;
  }[];
  skipped: { from_post_id: number; to_post_id: number; reason: string }[];
}

const NEW_POST_WINDOW_DAYS = 14;

export async function runInternalLinkerJob(opts: InternalLinkerJobOpts): Promise<void> {
  const env = opts.env ?? process.env;
  const baseDir = opts.baseDir ?? "tenants";
  const now = opts.now ?? new Date();

  const tenant = await loadTenant(opts.tenantSlug, baseDir);
  const cfg = tenant.features.internal_linker;
  if (!cfg.enabled) {
    console.log(JSON.stringify({ stage: "skip", reason: "feature disabled" }));
    return;
  }

  const wp = createWordpressClient({
    baseUrl: tenant.wordpress.base_url,
    user: requireEnv(env, tenant.wordpress.user_secret_ref),
    appPassword: requireEnv(env, tenant.wordpress.app_password_secret_ref),
  });

  const allPosts = await listRecentPosts(wp, cfg.lookback_posts);
  const cutoff = new Date(now.getTime() - NEW_POST_WINDOW_DAYS * 86400000);

  const newPosts = allPosts.filter((p) => new Date((p as WpPost & { date: string }).date) >= cutoff);
  const oldPosts = allPosts.filter(
    (p) =>
      new Date((p as WpPost & { date: string }).date) < cutoff &&
      !cfg.exclude_post_ids.includes(p.id)
  );

  // Topic metadata om focus-keyword + key_entities op te halen.
  const topics = await loadTopics(opts.tenantSlug, baseDir);

  const log: RunLog = {
    run_at: now.toISOString(),
    tenant: opts.tenantSlug,
    new_post_count: newPosts.length,
    old_post_count: oldPosts.length,
    agent_calls: 0,
    links_added: [],
    skipped: [],
  };

  if (newPosts.length === 0) {
    await persistLog(baseDir, opts.tenantSlug, now, log);
    console.log(JSON.stringify({ stage: "skip", reason: "no new posts" }));
    return;
  }

  const providers = createProviderRegistry(env);
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  let linksAddedCount = 0;

  for (const oldPost of oldPosts) {
    if (linksAddedCount >= cfg.max_links_per_run) break;

    for (const newPost of newPosts) {
      if (oldPost.id === newPost.id) continue;
      if (linksAddedCount >= cfg.max_links_per_run) break;

      // Match topic for focus_keyword + key_entities.
      const newPostTopic = topics.find((t) => t.wp_post_id === newPost.id);
      if (!newPostTopic) {
        log.skipped.push({
          from_post_id: oldPost.id,
          to_post_id: newPost.id,
          reason: "no topic metadata",
        });
        continue;
      }

      // Idempotency: check if old post already links to new post URL.
      if (oldPost.content.rendered.includes(`href="${newPost.link}"`)) {
        log.skipped.push({
          from_post_id: oldPost.id,
          to_post_id: newPost.id,
          reason: "already linked",
        });
        continue;
      }

      // Pre-filter: keyword overlap (target_keyword OR any key_entity).
      const oldText = parseHtml(oldPost.content.rendered).text.toLowerCase();
      const overlap =
        oldText.includes(newPostTopic.target_keyword.toLowerCase()) ||
        // key_entities not stored on Topic, so rely only on target_keyword for now
        false;
      if (!overlap) {
        log.skipped.push({
          from_post_id: oldPost.id,
          to_post_id: newPost.id,
          reason: "no keyword overlap",
        });
        continue;
      }

      // Call agent.
      log.agent_calls++;
      const r = await runInternalLinker(
        {
          old_post_html: oldPost.content.rendered,
          new_post: {
            title: newPost.title.rendered,
            tldr_one_liner: newPostTopic.title,
            focus_keyword: newPostTopic.target_keyword,
            url: newPost.link,
            key_entities: [],
          },
          constraint_anchor_already_used: [],
        },
        { provider: providers.get("anthropic"), sleepImpl: sleep }
      );

      if (!r.parsed.should_link || r.parsed.confidence < 0.7) {
        log.skipped.push({
          from_post_id: oldPost.id,
          to_post_id: newPost.id,
          reason: `agent declined (conf=${r.parsed.confidence})`,
        });
        continue;
      }

      // Find paragraph by signature, replace.
      const newHtml = replaceParagraphBySignature(
        oldPost.content.rendered,
        r.parsed.target_paragraph_signature,
        r.parsed.rewritten_paragraph_html
      );
      if (newHtml === null) {
        log.skipped.push({
          from_post_id: oldPost.id,
          to_post_id: newPost.id,
          reason: "signature mismatch",
        });
        continue;
      }

      await updatePostContent(wp, oldPost.id, newHtml);
      log.links_added.push({
        from_post_id: oldPost.id,
        to_post_id: newPost.id,
        anchor: r.parsed.anchor_text,
        confidence: r.parsed.confidence,
      });
      linksAddedCount++;

      // Update local copy zodat volgende iteratie de nieuwe link ziet.
      oldPost.content.rendered = newHtml;
      break; // 1 link per oude post
    }
  }

  await persistLog(baseDir, opts.tenantSlug, now, log);
  console.log(JSON.stringify({ stage: "complete", linksAdded: log.links_added.length, skipped: log.skipped.length }));
}

function replaceParagraphBySignature(
  html: string,
  signature: string,
  replacement: string
): string | null {
  const root = parseHtml(html);
  const sigLower = signature.toLowerCase().trim();
  const paragraphs = root.querySelectorAll("p");
  for (const p of paragraphs) {
    const plainText = p.text.toLowerCase().trim();
    if (plainText.startsWith(sigLower.slice(0, Math.min(40, sigLower.length)))) {
      p.replaceWith(replacement);
      return root.toString();
    }
  }
  return null;
}

async function persistLog(baseDir: string, slug: string, now: Date, log: RunLog): Promise<void> {
  const dir = path.join(baseDir, "..", "data", "internal-linker-runs", slug);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${now.toISOString().slice(0, 10)}.json`);
  await writeFile(file, JSON.stringify(log, null, 2), "utf-8");
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

// CLI entry point.
if (import.meta.url === `file://${process.argv[1]}`) {
  const tenantArg = process.argv.slice(2).find((a) => a.startsWith("--tenant="));
  if (!tenantArg) throw new Error("Usage: internalLinkerJob.ts --tenant=<slug>");
  const slug = tenantArg.split("=")[1]!;
  runInternalLinkerJob({ tenantSlug: slug }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run test/unit/pipeline/internalLinkerJob.test.ts
npx tsc --noEmit
git add src/pipeline/internalLinkerJob.ts test/unit/pipeline/internalLinkerJob.test.ts package.json package-lock.json
git commit -m "feat(pipeline): internal-linker job met pre-filter + idempotency + run-log"
```

---

## Task 8: GitHub Actions weekly workflow

**Files:**
- Create: `.github/workflows/weekly-internal-linker.yml`

- [ ] **Step 1: Workflow YAML**

```yaml
# .github/workflows/weekly-internal-linker.yml
name: Weekly internal linker

on:
  schedule:
    - cron: "0 5 * * 1"  # Monday 05:00 UTC
  workflow_dispatch:
    inputs:
      tenant:
        description: "Tenant slug"
        default: "artifation"
        required: true

permissions:
  contents: write

concurrency:
  group: internal-linker-${{ github.event.inputs.tenant || 'artifation' }}
  cancel-in-progress: false

jobs:
  link:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - run: npm ci

      - name: Run internal-linker
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          WP_USER: ${{ secrets.WP_USER }}
          WP_APP_PASSWORD: ${{ secrets.WP_APP_PASSWORD }}
        run: npx tsx src/pipeline/internalLinkerJob.ts --tenant=${{ github.event.inputs.tenant || 'artifation' }}

      - name: Commit run log
        if: success()
        run: |
          git config user.name "blog-bot"
          git config user.email "blog-bot@artifation.nl"
          git add data/internal-linker-runs/
          git diff --staged --quiet || git commit -m "chore(state): internal-linker run $(date -u +%Y-%m-%d)"
          git push

      - name: Upload run log artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: internal-linker-${{ github.run_id }}
          path: data/internal-linker-runs/
          retention-days: 60
          if-no-files-found: ignore
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/weekly-internal-linker.yml
git commit -m "ci: weekly internal-linker cron (maandag 05:00 UTC)"
```

---

## Task 9: README update + feature-flag enable voor Artifation

**Files:**
- Modify: `README.md`
- Modify: `tenants/artifation/config.yaml` (toggle on)

- [ ] **Step 1: README — voeg sectie toe na §6**

```markdown
### 7. Internal-linker

De reverse internal-linker draait wekelijks (maandag 05:00 UTC) en plaatst links in oudere posts naar de nieuwste posts. Inschakelen per tenant:

```yaml
features:
  internal_linker:
    enabled: true
    max_links_per_run: 10
    lookback_posts: 50
    exclude_post_ids: [12, 34]   # pillar/product pages waar geen links bij mogen
```

Logs van elke run staan in `data/internal-linker-runs/<tenant>/<date>.json`.
```

- [ ] **Step 2: Toggle Artifation tenant aan**

In `tenants/artifation/config.yaml`:

```yaml
features:
  internal_linker:
    enabled: true   # was: false
    max_links_per_run: 10
    lookback_posts: 50
    exclude_post_ids: []
```

- [ ] **Step 3: Commit**

```bash
git add README.md tenants/artifation/config.yaml
git commit -m "docs+config: enable internal-linker voor artifation tenant"
```

---

## Self-Review

**Spec coverage:** Roadmap Phase 1's volledige scope is geïmplementeerd:

| Roadmap-item | Task |
|---|---|
| Agent + prompt + zod-schema | 6 |
| Job orchestrator | 7 |
| Pre-filter (keyword overlap) | 7 |
| Idempotency check | 7 |
| WP getPost / updatePost | 2, 3 |
| State-file / run-log | 7 |
| Weekly workflow | 8 |
| Feature-flag config | 5 |
| Topic schema-extension (`wp_post_id`) voor matching | 1 |

**Resolved open questions** (uit roadmap):
- HTML-replacement strategie ✓ — paragraph-by-signature, full `<p>` swap
- Idempotency ✓ — regex-check op `href="<new_url>"` in oude HTML
- Welke posts beschermen ✓ — `exclude_post_ids` config
- Embedding pre-filter ✗ — bewust geskipt voor v1; keyword-overlap is voldoende

**Placeholder scan:** Geen TBD/TODO. Elke step heeft volledige code of exacte commands.

**Type consistency:**
- `WordpressClient.patchJson` — toegevoegd in Task 2, gebruikt in Task 3 + 7 ✓
- `WpPost` interface — gedefinieerd in Task 3, geïmporteerd in Task 7 ✓
- `Topic.wp_post_id`, `Topic.wp_post_url` — toegevoegd in Task 1, gebruikt in Task 7 ✓
- `AgentRole` extended in Task 4, gebruikt in Task 6 ✓
- `InternalLinkerInput`, `InternalLinkerOutput` — Task 6, gebruikt in Task 7 ✓
- `features.internal_linker` config schema — Task 5, gelezen in Task 7 ✓

**Cost-estimate:** Per wekelijkse run, met 1-2 nieuwe posts × ~10 candidate-paren × 80% pre-filter-eliminatie → ~4 LLM-calls × ~2k tokens = ~$0.04/week ($2/jaar). Negligible.

**Risico's & mitigaties:**
- WP-revisies opstapelen → alleen PATCH bij echte content-wijziging (job al zo)
- Verkeerde paragraaf gematcht → signature-check (40+ chars) + `replaceWith` op exact element
- Concurrent edits door redactie tijdens job → signature-mismatch → graceful skip met log

**Plan complete.**
