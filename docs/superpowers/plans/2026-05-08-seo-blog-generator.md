# SEO Blog Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bouw een private multi-agent SEO blog-generator die op GitHub Actions cron draait, blogs schrijft via een 5-agent Editorial Mesh + Quality Judge gate, en bij score ≥ 8,0 een concept in WordPress (artifation.nl) plaatst en een email naar `algemeen@artifation.nl` stuurt via Resend.

**Architecture:** Node.js 20 + TypeScript + Vitest. Eén orchestrator-script (`src/pipeline/orchestrator.ts`) draait een topic door 7 agents (Researcher → Strategist → Writer → SEO Editor → Fact-Checker → Quality Judge → Image Prompter), met een provider-agnostische LLM-laag eronder. Alle tenant-specifieke kennis zit in `tenants/<slug>/config.yaml` + `topics.yaml`. State (queue, cost-counter) leeft als JSON/YAML in de repo zelf — geen DB.

**Tech Stack:** Node.js 20, TypeScript, tsx, Vitest, Zod, js-yaml, @anthropic-ai/sdk (Sonnet 4.6 / Haiku 4.5 / Opus 4.7), @google/genai (Gemini 2.5 Pro), groq-sdk, fal-ai/client (Flux 1.1 Pro Ultra), resend, react-email, undici (fetch wrapper), GitHub Actions.

**Spec:** Zie [`docs/superpowers/specs/2026-05-08-seo-blog-generator-design.md`](../specs/2026-05-08-seo-blog-generator-design.md) voor volledige design-rationale, rubric-gewichten, topic-queue, en kostencalculatie.

---

## Phase 0 — Repo & tooling setup

### Task 1: Initialiseer git repo (geneste setup-werk)

De `c:\Users\julia\Desktop\Julian\blog` directory zit binnen een parent git repo (`C:/Users/julia` met origin `Robotninja100/kennisbank`). We moeten deze sub-directory loskoppelen voordat we hier een eigen repo initialiseren.

**Files:**
- Create: `c:\Users\julia\Desktop\Julian\blog\.gitignore`
- Modify: `C:/Users/julia/.gitignore` (parent repo) — add `Desktop/Julian/blog/`

- [ ] **Step 1: Voeg blog-dir toe aan parent .gitignore**

```bash
cd C:/Users/julia
echo "" >> .gitignore
echo "# Eigen project, eigen repo" >> .gitignore
echo "Desktop/Julian/blog/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore Desktop/Julian/blog (own repo)"
```

- [ ] **Step 2: Initialiseer eigen git repo in blog/**

```bash
cd c:/Users/julia/Desktop/Julian/blog
git init
git branch -M main
```

- [ ] **Step 3: Schrijf `.gitignore`**

```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
.vitest-cache/
coverage/

# Runtime artifacts that change every run — kept out of commits
data/runs/
data/cost-counter.json

# Generated images cached locally
data/images/
```

- [ ] **Step 4: Eerste commit (alleen design-spec + .gitignore)**

```bash
git add .gitignore docs/
git commit -m "chore: bootstrap repo with design spec"
```

- [ ] **Step 5: Maak private GitHub repo en push**

Handmatig via GitHub UI of CLI:
```bash
gh repo create artifation/blog-generator --private --source=. --push
```

Verwacht: repo bestaat op github.com/artifation/blog-generator (private). Vervolgcommits worden hier gepusht.

---

### Task 2: Project-skelet (package.json, tsconfig, vitest)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Init package.json**

```bash
npm init -y
npm pkg set type=module
npm pkg set engines.node=">=20"
npm pkg set scripts.run="tsx src/pipeline/orchestrator.ts"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.typecheck="tsc --noEmit"
```

- [ ] **Step 2: Installeer dependencies**

```bash
npm install --save-exact \
  @anthropic-ai/sdk \
  @google/genai \
  groq-sdk \
  @fal-ai/client \
  resend \
  @react-email/components @react-email/render \
  react react-dom \
  js-yaml \
  zod \
  undici

npm install --save-dev --save-exact \
  typescript \
  tsx \
  vitest \
  @types/node \
  @types/react \
  @types/js-yaml
```

- [ ] **Step 3: Schrijf `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "test/**/*", "tenants/**/*"]
}
```

- [ ] **Step 4: Schrijf `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 5: Verifieer setup**

```bash
npx tsc --noEmit
```
Verwacht: geen errors. (Geen src/ files yet — TypeScript draait clean.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts
git commit -m "chore: project skeleton (Node 20 + TS + Vitest)"
```

---

### Task 3: Smoke test setup (verifieer Vitest werkt)

**Files:**
- Create: `test/unit/smoke.test.ts`

- [ ] **Step 1: Schrijf de smoke-test**

```ts
// test/unit/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Run de test**

```bash
npx vitest run test/unit/smoke.test.ts
```
Verwacht: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add test/unit/smoke.test.ts
git commit -m "test: smoke test verifies vitest works"
```

---

## Phase 1 — Configuratie + types foundation

### Task 4: Zod-schema voor tenant-config

**Files:**
- Create: `src/config/tenant.ts`
- Create: `test/unit/config/tenant.test.ts`

- [ ] **Step 1: Schrijf failing test**

```ts
// test/unit/config/tenant.test.ts
import { describe, expect, it } from "vitest";
import { parseTenantConfig } from "@/config/tenant";

describe("parseTenantConfig", () => {
  const valid = {
    slug: "artifation",
    domain: "artifation.nl",
    language: "nl-NL",
    brand: {
      name: "Artifation",
      voice: "informeel-direct",
      ban_list: ["delve"],
      signature_phrases: [],
    },
    author: {
      name: "Test Auteur",
      linkedin: "https://linkedin.com/in/x",
      bio: "Bio",
      photo_url: "https://x.test/photo.png",
    },
    organization: {
      legal_name: "Artifation B.V.",
      kvk: "12345678",
      btw: "NL000000000B01",
      address: "Adres 1, Plaats",
    },
    wordpress: {
      base_url: "https://artifation.nl",
      user_secret_ref: "WP_USER",
      app_password_secret_ref: "WP_APP_PASSWORD",
    },
    email: {
      from: "blog-bot@artifation.nl",
      to: "algemeen@artifation.nl",
      reply_to: "algemeen@artifation.nl",
    },
    pillars: [
      { id: "ai-per-afdeling", weight: 0.5 },
      { id: "ai-act", weight: 0.3 },
      { id: "sector-extensie", weight: 0.2 },
    ],
    quality_threshold: 8.0,
    max_posts_per_week_published: 4,
  };

  it("parses a valid config", () => {
    expect(parseTenantConfig(valid).slug).toBe("artifation");
  });

  it("rejects pillar-weights die geen 1.0 sommeren", () => {
    const bad = { ...valid, pillars: [{ id: "a", weight: 0.5 }] };
    expect(() => parseTenantConfig(bad)).toThrow(/sum to 1/);
  });

  it("rejects quality_threshold buiten 0-10", () => {
    expect(() => parseTenantConfig({ ...valid, quality_threshold: 11 })).toThrow();
  });
});
```

- [ ] **Step 2: Run test (faalt)**

```bash
npx vitest run test/unit/config/tenant.test.ts
```
Verwacht: FAIL — Cannot find module '@/config/tenant'.

- [ ] **Step 3: Implementeer `src/config/tenant.ts`**

```ts
// src/config/tenant.ts
import { z } from "zod";

const PillarSchema = z.object({
  id: z.string().min(1),
  weight: z.number().min(0).max(1),
});

export const TenantConfigSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    domain: z.string().min(3),
    language: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/),

    brand: z.object({
      name: z.string().min(1),
      voice: z.string().min(1),
      ban_list: z.array(z.string()).default([]),
      signature_phrases: z.array(z.string()).default([]),
    }),

    author: z.object({
      name: z.string().min(1),
      linkedin: z.string().url(),
      bio: z.string().min(1),
      photo_url: z.string().url(),
    }),

    organization: z.object({
      legal_name: z.string().min(1),
      kvk: z.string().min(1),
      btw: z.string().min(1),
      address: z.string().min(1),
    }),

    wordpress: z.object({
      base_url: z.string().url(),
      user_secret_ref: z.string().min(1),
      app_password_secret_ref: z.string().min(1),
    }),

    email: z.object({
      from: z.string().email(),
      to: z.string().email(),
      reply_to: z.string().email(),
    }),

    pillars: z.array(PillarSchema).min(1),
    quality_threshold: z.number().min(0).max(10),
    max_posts_per_week_published: z.number().int().min(0),
  })
  .refine(
    (c) => Math.abs(c.pillars.reduce((s, p) => s + p.weight, 0) - 1) < 0.001,
    { message: "pillar weights must sum to 1.0" }
  );

export type TenantConfig = z.infer<typeof TenantConfigSchema>;

export function parseTenantConfig(input: unknown): TenantConfig {
  return TenantConfigSchema.parse(input);
}
```

- [ ] **Step 4: Run test (slaagt)**

```bash
npx vitest run test/unit/config/tenant.test.ts
```
Verwacht: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/config/tenant.ts test/unit/config/tenant.test.ts
git commit -m "feat(config): zod schema voor tenant config"
```

---

### Task 5: YAML loader voor tenant-config

**Files:**
- Create: `src/config/loader.ts`
- Create: `test/unit/config/loader.test.ts`
- Create: `test/fixtures/tenants/example/config.yaml` (test fixture)

- [ ] **Step 1: Schrijf de fixture**

`test/fixtures/tenants/example/config.yaml`:
```yaml
slug: example
domain: example.test
language: nl-NL
brand:
  name: Example
  voice: "test"
  ban_list: []
  signature_phrases: []
author:
  name: A
  linkedin: https://linkedin.com/in/a
  bio: bio
  photo_url: https://example.test/p.png
organization:
  legal_name: Example BV
  kvk: "1"
  btw: "NL1B01"
  address: addr
wordpress:
  base_url: https://example.test
  user_secret_ref: WP_USER
  app_password_secret_ref: WP_APP_PASSWORD
email:
  from: a@example.test
  to: b@example.test
  reply_to: b@example.test
pillars:
  - id: a
    weight: 1.0
quality_threshold: 8.0
max_posts_per_week_published: 4
```

- [ ] **Step 2: Schrijf failing test**

```ts
// test/unit/config/loader.test.ts
import { describe, expect, it } from "vitest";
import { loadTenant } from "@/config/loader";

describe("loadTenant", () => {
  it("loads & validates a tenant config from disk", async () => {
    const t = await loadTenant("example", "test/fixtures/tenants");
    expect(t.slug).toBe("example");
  });

  it("throws for missing tenant", async () => {
    await expect(loadTenant("nope", "test/fixtures/tenants")).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test (faalt)**

```bash
npx vitest run test/unit/config/loader.test.ts
```
Verwacht: FAIL — Cannot find module '@/config/loader'.

- [ ] **Step 4: Implementeer loader**

```ts
// src/config/loader.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { parseTenantConfig, type TenantConfig } from "./tenant.ts";

export async function loadTenant(
  slug: string,
  baseDir: string = "tenants"
): Promise<TenantConfig> {
  const file = path.join(baseDir, slug, "config.yaml");
  const raw = await readFile(file, "utf-8");
  const data = yaml.load(raw);
  return parseTenantConfig(data);
}
```

- [ ] **Step 5: Run test (slaagt)**

```bash
npx vitest run test/unit/config/loader.test.ts
```
Verwacht: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/config/loader.ts test/unit/config/loader.test.ts test/fixtures/
git commit -m "feat(config): YAML tenant loader"
```

---

### Task 6: Topic-queue schema + loader

**Files:**
- Create: `src/config/topics.ts`
- Create: `test/unit/config/topics.test.ts`
- Create: `test/fixtures/tenants/example/topics.yaml`

- [ ] **Step 1: Schrijf fixture**

`test/fixtures/tenants/example/topics.yaml`:
```yaml
- id: ai-hr
  title: "AI in HR"
  pillar: a
  target_keyword: "AI in HR"
  intended_word_count: 1500
  status: queued
  priority: 10
- id: ai-finance
  title: "AI in finance"
  pillar: a
  target_keyword: "AI in finance"
  intended_word_count: 1500
  status: queued
  priority: 5
```

- [ ] **Step 2: Schrijf failing test**

```ts
// test/unit/config/topics.test.ts
import { describe, expect, it } from "vitest";
import { loadTopics, parseTopics } from "@/config/topics";

describe("topics", () => {
  it("parses a list of topics", () => {
    const list = parseTopics([
      { id: "x", title: "X", pillar: "a", target_keyword: "x", intended_word_count: 1500, status: "queued", priority: 1 },
    ]);
    expect(list[0]!.id).toBe("x");
  });

  it("rejects unknown status", () => {
    expect(() =>
      parseTopics([
        { id: "x", title: "X", pillar: "a", target_keyword: "x", intended_word_count: 1500, status: "weird", priority: 1 },
      ])
    ).toThrow();
  });

  it("loads from disk", async () => {
    const list = await loadTopics("example", "test/fixtures/tenants");
    expect(list).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run test (faalt)**

```bash
npx vitest run test/unit/config/topics.test.ts
```

- [ ] **Step 4: Implementeer**

```ts
// src/config/topics.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";

export const TopicStatus = z.enum([
  "queued",
  "in_progress",
  "published",
  "rejected",
  "cap_deferred",
  "cannibalization_skipped",
]);
export type TopicStatusT = z.infer<typeof TopicStatus>;

export const TopicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  pillar: z.string().min(1),
  target_keyword: z.string().min(1),
  intended_word_count: z.number().int().min(500),
  status: TopicStatus,
  priority: z.number().int(),
  last_attempted: z.string().datetime().optional(),
  retry_after: z.string().datetime().optional(),
  reject_reason: z.string().optional(),
});
export type Topic = z.infer<typeof TopicSchema>;

export const TopicsListSchema = z.array(TopicSchema);

export function parseTopics(input: unknown): Topic[] {
  return TopicsListSchema.parse(input);
}

export async function loadTopics(
  tenantSlug: string,
  baseDir: string = "tenants"
): Promise<Topic[]> {
  const file = path.join(baseDir, tenantSlug, "topics.yaml");
  const raw = await readFile(file, "utf-8");
  return parseTopics(yaml.load(raw));
}

export async function saveTopics(
  topics: Topic[],
  tenantSlug: string,
  baseDir: string = "tenants"
): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  const file = path.join(baseDir, tenantSlug, "topics.yaml");
  await writeFile(file, yaml.dump(topics, { lineWidth: 120 }), "utf-8");
}
```

- [ ] **Step 5: Run test (slaagt)**

```bash
npx vitest run test/unit/config/topics.test.ts
```
Verwacht: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/config/topics.ts test/unit/config/topics.test.ts test/fixtures/tenants/example/topics.yaml
git commit -m "feat(config): topic-queue schema + load/save"
```

---

## Phase 2 — LLM abstractie

### Task 7: LLM-types + provider-interface

**Files:**
- Create: `src/llm/types.ts`

- [ ] **Step 1: Schrijf types (geen test — pure types)**

```ts
// src/llm/types.ts
export type LLMProviderName = "anthropic" | "gemini" | "groq";

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  model: string;            // exact model id, e.g. "claude-sonnet-4-6"
  maxTokens: number;
  temperature?: number;
  jsonSchema?: object;      // optional structured-output schema
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: LLMProviderName;
}

export interface LLMProvider {
  name: LLMProviderName;
  call(req: LLMRequest): Promise<LLMResponse>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/llm/types.ts
git commit -m "feat(llm): provider interface + request/response types"
```

---

### Task 8: Anthropic provider

**Files:**
- Create: `src/llm/anthropic.ts`
- Create: `test/unit/llm/anthropic.test.ts`

- [ ] **Step 1: Schrijf failing test**

```ts
// test/unit/llm/anthropic.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class Anthropic {
      messages = {
        create: vi.fn(async (_req: unknown) => ({
          content: [{ type: "text", text: "hello" }],
          usage: { input_tokens: 10, output_tokens: 5 },
          model: "claude-sonnet-4-6",
        })),
      };
    },
  };
});

import { createAnthropicProvider } from "@/llm/anthropic";

describe("anthropic provider", () => {
  it("returns text + token counts", async () => {
    const p = createAnthropicProvider("test-key");
    const r = await p.call({
      systemPrompt: "be helpful",
      userPrompt: "hi",
      model: "claude-sonnet-4-6",
      maxTokens: 100,
    });
    expect(r.text).toBe("hello");
    expect(r.inputTokens).toBe(10);
    expect(r.outputTokens).toBe(5);
    expect(r.provider).toBe("anthropic");
  });
});
```

- [ ] **Step 2: Run test (faalt)**

```bash
npx vitest run test/unit/llm/anthropic.test.ts
```

- [ ] **Step 3: Implementeer**

```ts
// src/llm/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types.ts";

export function createAnthropicProvider(apiKey: string): LLMProvider {
  const client = new Anthropic({ apiKey });

  return {
    name: "anthropic",
    async call(req: LLMRequest): Promise<LLMResponse> {
      const res = await client.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        temperature: req.temperature ?? 1.0,
        system: req.systemPrompt,
        messages: [{ role: "user", content: req.userPrompt }],
      });

      const textBlock = res.content.find(
        (c): c is { type: "text"; text: string } => c.type === "text"
      );
      if (!textBlock) {
        throw new Error("Anthropic response had no text block");
      }

      return {
        text: textBlock.text,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        model: res.model,
        provider: "anthropic",
      };
    },
  };
}
```

- [ ] **Step 4: Run test (slaagt)**

```bash
npx vitest run test/unit/llm/anthropic.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/llm/anthropic.ts test/unit/llm/anthropic.test.ts
git commit -m "feat(llm): anthropic provider (sonnet/haiku/opus)"
```

---

### Task 9: Gemini + Groq providers

**Files:**
- Create: `src/llm/gemini.ts`
- Create: `src/llm/groq.ts`
- Create: `test/unit/llm/gemini.test.ts`
- Create: `test/unit/llm/groq.test.ts`

- [ ] **Step 1: Failing test voor Gemini**

```ts
// test/unit/llm/gemini.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async () => ({
        text: "world",
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 },
      })),
    };
  },
}));

import { createGeminiProvider } from "@/llm/gemini";

describe("gemini provider", () => {
  it("returns text + token counts", async () => {
    const p = createGeminiProvider("test-key");
    const r = await p.call({
      systemPrompt: "s",
      userPrompt: "u",
      model: "gemini-2.5-pro",
      maxTokens: 1000,
    });
    expect(r.text).toBe("world");
    expect(r.inputTokens).toBe(7);
    expect(r.provider).toBe("gemini");
  });
});
```

- [ ] **Step 2: Failing test voor Groq**

```ts
// test/unit/llm/groq.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("groq-sdk", () => ({
  default: class Groq {
    chat = {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: "groq-out" } }],
          usage: { prompt_tokens: 4, completion_tokens: 6 },
          model: "llama-3.3-70b-versatile",
        })),
      },
    };
  },
}));

import { createGroqProvider } from "@/llm/groq";

describe("groq provider", () => {
  it("returns text + token counts", async () => {
    const p = createGroqProvider("test-key");
    const r = await p.call({
      systemPrompt: "s",
      userPrompt: "u",
      model: "llama-3.3-70b-versatile",
      maxTokens: 200,
    });
    expect(r.text).toBe("groq-out");
    expect(r.inputTokens).toBe(4);
    expect(r.provider).toBe("groq");
  });
});
```

- [ ] **Step 3: Run beide tests (falen)**

```bash
npx vitest run test/unit/llm/gemini.test.ts test/unit/llm/groq.test.ts
```

- [ ] **Step 4: Implementeer Gemini**

```ts
// src/llm/gemini.ts
import { GoogleGenAI } from "@google/genai";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types.ts";

export function createGeminiProvider(apiKey: string): LLMProvider {
  const client = new GoogleGenAI({ apiKey });

  return {
    name: "gemini",
    async call(req: LLMRequest): Promise<LLMResponse> {
      const res = await client.models.generateContent({
        model: req.model,
        contents: [
          { role: "user", parts: [{ text: `${req.systemPrompt}\n\n${req.userPrompt}` }] },
        ],
        config: {
          maxOutputTokens: req.maxTokens,
          temperature: req.temperature ?? 1.0,
        },
      });

      return {
        text: res.text ?? "",
        inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
        model: req.model,
        provider: "gemini",
      };
    },
  };
}
```

- [ ] **Step 5: Implementeer Groq**

```ts
// src/llm/groq.ts
import Groq from "groq-sdk";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types.ts";

export function createGroqProvider(apiKey: string): LLMProvider {
  const client = new Groq({ apiKey });

  return {
    name: "groq",
    async call(req: LLMRequest): Promise<LLMResponse> {
      const res = await client.chat.completions.create({
        model: req.model,
        max_tokens: req.maxTokens,
        temperature: req.temperature ?? 1.0,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userPrompt },
        ],
      });

      return {
        text: res.choices[0]?.message.content ?? "",
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
        model: res.model,
        provider: "groq",
      };
    },
  };
}
```

- [ ] **Step 6: Run beide tests (slagen)**

```bash
npx vitest run test/unit/llm/gemini.test.ts test/unit/llm/groq.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/llm/gemini.ts src/llm/groq.ts test/unit/llm/gemini.test.ts test/unit/llm/groq.test.ts
git commit -m "feat(llm): gemini + groq providers"
```

---

### Task 10: Generieke `runAgent` met retry + JSON-extractie

Eén utility die alle agents gebruiken: roept een provider aan, retry'd 3x exponential backoff, parsed JSON-output volgens een Zod-schema.

**Files:**
- Create: `src/llm/runAgent.ts`
- Create: `test/unit/llm/runAgent.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/llm/runAgent.test.ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { LLMProvider } from "@/llm/types";

function provider(text: string): LLMProvider {
  return {
    name: "anthropic",
    call: vi.fn(async () => ({
      text,
      inputTokens: 1,
      outputTokens: 1,
      model: "x",
      provider: "anthropic" as const,
    })),
  };
}

describe("runAgent", () => {
  const schema = z.object({ greeting: z.string() });

  it("parses valid JSON response", async () => {
    const r = await runAgent({
      provider: provider('```json\n{"greeting":"hi"}\n```'),
      systemPrompt: "s",
      userPrompt: "u",
      model: "x",
      schema,
      maxTokens: 100,
    });
    expect(r.parsed.greeting).toBe("hi");
  });

  it("extracts JSON without code fence", async () => {
    const r = await runAgent({
      provider: provider('Here you go: {"greeting":"hello"}'),
      systemPrompt: "s",
      userPrompt: "u",
      model: "x",
      schema,
      maxTokens: 100,
    });
    expect(r.parsed.greeting).toBe("hello");
  });

  it("retries on parse failure (max 3 attempts)", async () => {
    const calls: string[] = ["bad", "still bad", '{"greeting":"ok"}'];
    let i = 0;
    const p: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: calls[i++]!,
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "anthropic" as const,
      })),
    };
    const r = await runAgent({
      provider: p,
      systemPrompt: "s",
      userPrompt: "u",
      model: "x",
      schema,
      maxTokens: 100,
    });
    expect(r.parsed.greeting).toBe("ok");
    expect(p.call).toHaveBeenCalledTimes(3);
  });

  it("throws after 3 failed retries", async () => {
    const p: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: "garbage",
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "anthropic" as const,
      })),
    };
    await expect(
      runAgent({
        provider: p,
        systemPrompt: "s",
        userPrompt: "u",
        model: "x",
        schema,
        maxTokens: 100,
      })
    ).rejects.toThrow(/parse/);
  });
});
```

- [ ] **Step 2: Run (faalt)**

```bash
npx vitest run test/unit/llm/runAgent.test.ts
```

- [ ] **Step 3: Implementeer**

```ts
// src/llm/runAgent.ts
import type { z } from "zod";
import type { LLMProvider, LLMResponse } from "./types.ts";

export interface RunAgentInput<T extends z.ZodTypeAny> {
  provider: LLMProvider;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
  temperature?: number;
  schema: T;
  maxAttempts?: number;
}

export interface RunAgentResult<T extends z.ZodTypeAny> {
  parsed: z.infer<T>;
  raw: LLMResponse;
}

export async function runAgent<T extends z.ZodTypeAny>(
  input: RunAgentInput<T>
): Promise<RunAgentResult<T>> {
  const maxAttempts = input.maxAttempts ?? 3;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = await input.provider.call({
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        model: input.model,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
      });

      const json = extractJson(raw.text);
      const parsed = input.schema.parse(json);
      return { parsed, raw };
    } catch (err) {
      lastError = err as Error;
      if (attempt === maxAttempts) break;
      await sleep(2 ** attempt * 1000);
    }
  }
  throw new Error(`runAgent failed to parse after ${maxAttempts} attempts: ${lastError?.message}`);
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const candidate = fence ? fence[1]! : text;
  const start = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  const begin =
    start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
  if (begin === -1) throw new Error("No JSON found in response");
  const slice = candidate.slice(begin);
  return JSON.parse(slice);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 4: Pas test aan voor retry-test (sleep mocken)**

Voor de retry-test wordt een echte `sleep` 8s+ wachten — niet acceptabel. Pas `runAgent.ts` aan om sleep injectable te maken, of gebruik vitest fake timers. Eenvoudiger: maak `sleepImpl` injectable.

Wijzig de signatuur:
```ts
export async function runAgent<T extends z.ZodTypeAny>(
  input: RunAgentInput<T>,
  sleepImpl: (ms: number) => Promise<void> = sleep
): Promise<RunAgentResult<T>> { ... }
```

En vervang `await sleep(...)` door `await sleepImpl(...)`. In de tests pass `() => Promise.resolve()` zodat retries instant zijn.

Update test "retries on parse failure" en "throws after 3 failed retries" om als 7e arg `() => Promise.resolve()` mee te geven via een options-bag.

- [ ] **Step 5: Run alle tests**

```bash
npx vitest run test/unit/llm/runAgent.test.ts
```
Verwacht: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/llm/runAgent.ts test/unit/llm/runAgent.test.ts
git commit -m "feat(llm): runAgent met retry + JSON extraction"
```

---

### Task 11: LLM-router (kies provider per agent-rol)

**Files:**
- Create: `src/llm/client.ts`
- Create: `test/unit/llm/client.test.ts`

Doel: één plek waar staat dat Researcher → gemini, Strategist/Writer → anthropic-sonnet, etc. Plus laden van API-keys uit env.

- [ ] **Step 1: Failing test**

```ts
// test/unit/llm/client.test.ts
import { describe, expect, it } from "vitest";
import { resolveAgentModel } from "@/llm/client";

describe("resolveAgentModel", () => {
  it("returns model + provider for known role", () => {
    expect(resolveAgentModel("researcher").provider).toBe("gemini");
    expect(resolveAgentModel("strategist").provider).toBe("anthropic");
    expect(resolveAgentModel("writer").provider).toBe("anthropic");
    expect(resolveAgentModel("seoEditor").provider).toBe("anthropic");
    expect(resolveAgentModel("factChecker").provider).toBe("anthropic");
    expect(resolveAgentModel("qualityJudge").provider).toBe("anthropic");
    expect(resolveAgentModel("imagePrompter").provider).toBe("groq");
  });
});
```

- [ ] **Step 2: Implementeer**

```ts
// src/llm/client.ts
import { createAnthropicProvider } from "./anthropic.ts";
import { createGeminiProvider } from "./gemini.ts";
import { createGroqProvider } from "./groq.ts";
import type { LLMProvider, LLMProviderName } from "./types.ts";

export type AgentRole =
  | "researcher"
  | "strategist"
  | "writer"
  | "seoEditor"
  | "factChecker"
  | "qualityJudge"
  | "imagePrompter";

export interface AgentModelChoice {
  provider: LLMProviderName;
  model: string;
  maxTokens: number;
}

const ROLE_TO_MODEL: Record<AgentRole, AgentModelChoice> = {
  researcher: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 8000 },
  strategist: { provider: "anthropic", model: "claude-sonnet-4-6", maxTokens: 4000 },
  writer: { provider: "anthropic", model: "claude-sonnet-4-6", maxTokens: 8000 },
  seoEditor: { provider: "anthropic", model: "claude-haiku-4-5-20251001", maxTokens: 8000 },
  factChecker: { provider: "anthropic", model: "claude-opus-4-7", maxTokens: 4000 },
  qualityJudge: { provider: "anthropic", model: "claude-opus-4-7", maxTokens: 4000 },
  imagePrompter: { provider: "groq", model: "llama-3.3-70b-versatile", maxTokens: 1000 },
};

export function resolveAgentModel(role: AgentRole): AgentModelChoice {
  return ROLE_TO_MODEL[role];
}

export interface ProviderRegistry {
  get(name: LLMProviderName): LLMProvider;
}

export function createProviderRegistry(env: NodeJS.ProcessEnv = process.env): ProviderRegistry {
  const cache = new Map<LLMProviderName, LLMProvider>();
  return {
    get(name) {
      if (cache.has(name)) return cache.get(name)!;
      const p = (() => {
        if (name === "anthropic") return createAnthropicProvider(requireEnv(env, "ANTHROPIC_API_KEY"));
        if (name === "gemini") return createGeminiProvider(requireEnv(env, "GEMINI_API_KEY"));
        if (name === "groq") return createGroqProvider(requireEnv(env, "GROQ_API_KEY"));
        throw new Error(`Unknown provider: ${name}`);
      })();
      cache.set(name, p);
      return p;
    },
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}
```

- [ ] **Step 3: Run test (slaagt)**

```bash
npx vitest run test/unit/llm/client.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/llm/client.ts test/unit/llm/client.test.ts
git commit -m "feat(llm): role->model router + provider registry"
```

---

## Phase 3 — Topic-state + cannibalization

### Task 12: Topic-selector

**Files:**
- Create: `src/pipeline/topicSelector.ts`
- Create: `test/unit/pipeline/topicSelector.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/pipeline/topicSelector.test.ts
import { describe, expect, it } from "vitest";
import { selectNextTopic } from "@/pipeline/topicSelector";
import type { Topic } from "@/config/topics";

const queued = (over: Partial<Topic>): Topic => ({
  id: "x",
  title: "X",
  pillar: "a",
  target_keyword: "x",
  intended_word_count: 1500,
  status: "queued",
  priority: 1,
  ...over,
});

describe("selectNextTopic", () => {
  it("picks highest priority queued topic", () => {
    const list = [queued({ id: "a", priority: 1 }), queued({ id: "b", priority: 5 })];
    expect(selectNextTopic(list, new Date())?.id).toBe("b");
  });

  it("skips non-queued", () => {
    const list = [
      { ...queued({ id: "a", priority: 5 }), status: "published" as const },
      queued({ id: "b", priority: 1 }),
    ];
    expect(selectNextTopic(list, new Date())?.id).toBe("b");
  });

  it("respects retry_after", () => {
    const future = new Date("2099-01-01");
    const past = new Date("2000-01-01");
    const list = [
      queued({ id: "a", priority: 5, retry_after: future.toISOString() }),
      queued({ id: "b", priority: 1, retry_after: past.toISOString() }),
    ];
    expect(selectNextTopic(list, new Date("2025-01-01"))?.id).toBe("b");
  });

  it("returns undefined on empty queue", () => {
    expect(selectNextTopic([], new Date())).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implementeer**

```ts
// src/pipeline/topicSelector.ts
import type { Topic } from "@/config/topics";

export function selectNextTopic(topics: Topic[], now: Date): Topic | undefined {
  const eligible = topics.filter((t) => {
    if (t.status !== "queued" && t.status !== "cap_deferred") return false;
    if (t.retry_after && new Date(t.retry_after) > now) return false;
    return true;
  });
  if (eligible.length === 0) return undefined;
  return eligible.reduce((a, b) => (b.priority > a.priority ? b : a));
}
```

- [ ] **Step 3: Run test (slaagt)**

```bash
npx vitest run test/unit/pipeline/topicSelector.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/topicSelector.ts test/unit/pipeline/topicSelector.test.ts
git commit -m "feat(pipeline): topic selector met priority + retry"
```

---

### Task 13: Cannibalization-check

**Files:**
- Create: `src/pipeline/cannibalization.ts`
- Create: `test/unit/pipeline/cannibalization.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/pipeline/cannibalization.test.ts
import { describe, expect, it } from "vitest";
import { detectCannibalization } from "@/pipeline/cannibalization";

describe("detectCannibalization", () => {
  it("detects keyword in existing slug", () => {
    const r = detectCannibalization({
      targetKeyword: "AI in HR",
      existingSlugs: ["ai-in-hr-stappenplan", "iets-anders"],
      existingTitles: ["Stappenplan AI in HR", "Iets anders"],
    });
    expect(r.isCannibalized).toBe(true);
    expect(r.reason).toContain("slug");
  });

  it("detects strong title overlap (>50% words)", () => {
    const r = detectCannibalization({
      targetKeyword: "AI voor accountants",
      existingSlugs: ["bla"],
      existingTitles: ["AI voor accountants in Nederland"],
    });
    expect(r.isCannibalized).toBe(true);
  });

  it("passes when no overlap", () => {
    const r = detectCannibalization({
      targetKeyword: "AI in HR",
      existingSlugs: ["ai-act-uitleg"],
      existingTitles: ["Wat is de AI Act"],
    });
    expect(r.isCannibalized).toBe(false);
  });
});
```

- [ ] **Step 2: Implementeer**

```ts
// src/pipeline/cannibalization.ts
export interface CannibalizationInput {
  targetKeyword: string;
  existingSlugs: string[];
  existingTitles: string[];
}

export interface CannibalizationResult {
  isCannibalized: boolean;
  reason?: string;
}

export function detectCannibalization(input: CannibalizationInput): CannibalizationResult {
  const kwTokens = tokenize(input.targetKeyword);
  const kwSlug = kwTokens.join("-");

  for (const slug of input.existingSlugs) {
    if (slug.includes(kwSlug)) {
      return { isCannibalized: true, reason: `keyword appears in existing slug: ${slug}` };
    }
  }

  for (const title of input.existingTitles) {
    const tTokens = tokenize(title);
    const overlap = kwTokens.filter((t) => tTokens.includes(t)).length;
    const ratio = overlap / kwTokens.length;
    if (ratio > 0.5) {
      return { isCannibalized: true, reason: `>50% keyword-token overlap with title: ${title}` };
    }
  }

  return { isCannibalized: false };
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set(["de", "het", "een", "in", "op", "voor", "van", "en", "of", "te", "om", "the", "and", "a", "an", "of", "to", "for"]);
```

- [ ] **Step 3: Run (slaagt)**

```bash
npx vitest run test/unit/pipeline/cannibalization.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/cannibalization.ts test/unit/pipeline/cannibalization.test.ts
git commit -m "feat(pipeline): cannibalization detection"
```

---

### Task 14: Sitemap-fetcher voor cannibalization input

**Files:**
- Create: `src/pipeline/sitemap.ts`
- Create: `test/unit/pipeline/sitemap.test.ts`

- [ ] **Step 1: Failing test (mock fetch)**

```ts
// test/unit/pipeline/sitemap.test.ts
import { describe, expect, it, vi } from "vitest";
import { fetchSitemapEntries } from "@/pipeline/sitemap";

describe("fetchSitemapEntries", () => {
  it("parses index + sub-sitemap and returns posts", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <sitemapindex>
            <sitemap><loc>https://x.test/post-sitemap.xml</loc></sitemap>
          </sitemapindex>`,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <urlset>
            <url><loc>https://x.test/blog/foo/</loc></url>
            <url><loc>https://x.test/blog/bar/</loc></url>
          </urlset>`,
      });

    const r = await fetchSitemapEntries("https://x.test/sitemap.xml", { fetch });
    expect(r.map((e) => e.slug)).toEqual(["foo", "bar"]);
  });
});
```

- [ ] **Step 2: Implementeer**

```ts
// src/pipeline/sitemap.ts
export interface SitemapEntry {
  url: string;
  slug: string;
}

export interface FetchOpts {
  fetch?: typeof fetch;
}

export async function fetchSitemapEntries(
  rootUrl: string,
  opts: FetchOpts = {}
): Promise<SitemapEntry[]> {
  const f = opts.fetch ?? globalThis.fetch;
  const indexRes = await f(rootUrl);
  if (!indexRes.ok) throw new Error(`sitemap fetch failed: ${indexRes.status}`);
  const indexXml = await indexRes.text();

  const subSitemaps = matchAll(indexXml, /<loc>([^<]+)<\/loc>/g);
  const postSitemaps = subSitemaps.filter((u) => u.includes("post"));
  if (postSitemaps.length === 0) {
    return parseUrlSet(indexXml);
  }

  const entries: SitemapEntry[] = [];
  for (const sm of postSitemaps) {
    const r = await f(sm);
    if (!r.ok) continue;
    entries.push(...parseUrlSet(await r.text()));
  }
  return entries;
}

function parseUrlSet(xml: string): SitemapEntry[] {
  return matchAll(xml, /<loc>([^<]+)<\/loc>/g).map((url) => ({
    url,
    slug: extractSlug(url),
  }));
}

function extractSlug(url: string): string {
  const path = new URL(url).pathname.replace(/\/$/, "");
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function matchAll(s: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(re)) out.push(m[1]!);
  return out;
}
```

- [ ] **Step 3: Run test (slaagt)**

```bash
npx vitest run test/unit/pipeline/sitemap.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/sitemap.ts test/unit/pipeline/sitemap.test.ts
git commit -m "feat(pipeline): sitemap fetcher voor cannibalization input"
```

---

## Phase 4 — Editorial agents

Pattern: elke agent-bestand heeft een (a) Zod-schema voor de output, (b) een `runX(input, deps)` functie, (c) een system-prompt apart in `src/agents/prompts/<role>.ts`.

### Task 15: Researcher agent

**Files:**
- Create: `src/agents/prompts/researcher.ts`
- Create: `src/agents/researcher.ts`
- Create: `test/unit/agents/researcher.test.ts`

- [ ] **Step 1: Schrijf system prompt**

```ts
// src/agents/prompts/researcher.ts
export const RESEARCHER_SYSTEM_PROMPT = `Je bent een SEO-onderzoeker voor B2B Nederlandse content. Je krijgt:
- target_keyword
- topic_title
- pillar
- existing_site_urls (sitemap-snapshot van de eigen site)

Je taak: produceer onderzoek voor één blogpost.

Output (strict JSON, geen tekst eromheen):
{
  "fan_out_subqueries": [string, ...],          // 5-8 subvragen die Google's query-fanout zou uitbreiden
  "key_entities": [string, ...],                 // 5-12 entiteiten/concepten/personen/tools die expliciet genoemd moeten worden
  "internal_link_targets": [{"url": string, "anchor_suggestion": string, "why": string}, ...], // 3-5 uit existing_site_urls
  "external_authority_sources": [{"url": string, "title": string, "why_authoritative": string}, ...], // 4-6 NL/EU autoritaire bronnen
  "key_facts": [{"claim": string, "source_url": string}, ...],                                     // 8-15 verifieerbare feiten met bron
  "competitor_serp_summary": string                                                                // 2-3 zinnen over wat top-10 SERP biedt en wat ontbreekt
}

Strikte regels:
- Alleen Nederlandse of EU-autoritaire bronnen voor external_authority_sources (RVO, AP, Europese Commissie, NLdigital, KvK, Frankwatching, Marketingfacts, Emerce, vakliteratuur).
- Geen verzonnen URLs. Als je twijfelt over een URL, laat 'm weg.
- Geen marketingbureaus uit andere landen.
- Geen content-farms.`;
```

- [ ] **Step 2: Failing test**

```ts
// test/unit/agents/researcher.test.ts
import { describe, expect, it, vi } from "vitest";
import { runResearcher } from "@/agents/researcher";
import type { LLMProvider } from "@/llm/types";

const mockOutput = JSON.stringify({
  fan_out_subqueries: ["q1", "q2", "q3", "q4", "q5"],
  key_entities: ["e1", "e2", "e3", "e4", "e5"],
  internal_link_targets: [{ url: "https://artifation.nl/ai-scan/", anchor_suggestion: "AI Scan", why: "scan tool" }],
  external_authority_sources: [{ url: "https://rvo.nl/wbso", title: "WBSO", why_authoritative: "overheid" }],
  key_facts: [{ claim: "X", source_url: "https://rvo.nl/wbso" }],
  competitor_serp_summary: "summary",
});

const provider: LLMProvider = {
  name: "gemini",
  call: vi.fn(async () => ({
    text: mockOutput,
    inputTokens: 10,
    outputTokens: 10,
    model: "gemini-2.5-pro",
    provider: "gemini",
  })),
};

describe("runResearcher", () => {
  it("returns parsed research output", async () => {
    const r = await runResearcher(
      {
        target_keyword: "AI in HR",
        topic_title: "AI in HR voor MKB",
        pillar: "ai-per-afdeling",
        existing_site_urls: ["https://artifation.nl/ai-scan/"],
      },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.fan_out_subqueries).toHaveLength(5);
    expect(r.parsed.key_entities).toHaveLength(5);
  });
});
```

- [ ] **Step 3: Implementeer**

```ts
// src/agents/researcher.ts
import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { LLMProvider } from "@/llm/types";
import { resolveAgentModel } from "@/llm/client";
import { RESEARCHER_SYSTEM_PROMPT } from "./prompts/researcher.ts";

export const ResearchOutputSchema = z.object({
  fan_out_subqueries: z.array(z.string()).min(3),
  key_entities: z.array(z.string()).min(3),
  internal_link_targets: z
    .array(z.object({ url: z.string().url(), anchor_suggestion: z.string(), why: z.string() }))
    .min(0),
  external_authority_sources: z
    .array(z.object({ url: z.string().url(), title: z.string(), why_authoritative: z.string() }))
    .min(0),
  key_facts: z.array(z.object({ claim: z.string(), source_url: z.string().url() })).min(0),
  competitor_serp_summary: z.string(),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

export interface ResearcherInput {
  target_keyword: string;
  topic_title: string;
  pillar: string;
  existing_site_urls: string[];
}

export interface ResearcherDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runResearcher(input: ResearcherInput, deps: ResearcherDeps) {
  const model = resolveAgentModel("researcher");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: RESEARCHER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: ResearchOutputSchema,
    },
    deps.sleepImpl
  );
}
```

(Dit vereist dat `runAgent` 2 argumenten accepteert: input-object + sleepImpl. Pas in Task 10 doe ik dat al, dus dit klopt.)

- [ ] **Step 4: Run test (slaagt)**

```bash
npx vitest run test/unit/agents/researcher.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/agents/prompts/researcher.ts src/agents/researcher.ts test/unit/agents/researcher.test.ts
git commit -m "feat(agents): researcher agent met Gemini 2.5 Pro"
```

---

### Task 16: Strategist agent

**Files:**
- Create: `src/agents/prompts/strategist.ts`
- Create: `src/agents/strategist.ts`
- Create: `test/unit/agents/strategist.test.ts`

- [ ] **Step 1: System prompt**

```ts
// src/agents/prompts/strategist.ts
export const STRATEGIST_SYSTEM_PROMPT = `Je bent een SEO-content-strateeg. Je krijgt research-output van de Researcher en moet een outline maken.

Output (strict JSON):
{
  "outline": {
    "h1_suggestion": string,                         // ≤60 ch, focus keyword + brand-aspect
    "tldr_one_liner": string,                        // ≤160 ch, AIO-citeerbaar antwoord
    "tldr_summary_134_words": string,                // exact ~134 woorden, self-contained
    "h2_chunks": [
      {
        "h2": string,
        "subquestion_answered": string,              // welke fan-out subquery beantwoordt dit?
        "intended_word_count": number,               // 134-167
        "must_include": [string, ...],               // entities/facts die in dit chunk moeten
        "h3s": [string, ...]                         // optioneel
      }
    ],                                                // 5-9 chunks
    "internal_links_to_inject": [{"url": string, "anchor": string}, ...],  // ≥3
    "external_links_to_cite": [string, ...],
    "schema_choices": [string, ...],                  // bv. ["BlogPosting", "FAQPage"]
    "faq_block": [{"q": string, "a_short": string}, ...] // 0-5
  },
  "anchor_distribution": {                            // hoe verdelen we exact/partial/semantic anchors?
    "exact_match_pct": number,
    "partial_pct": number,
    "semantic_pct": number
  },
  "contrarian_opinion_hint": string                   // korte aanwijzing voor de Writer
}

Strikte regels:
- Minimaal 5 h2_chunks, maximaal 9.
- TL;DR-summary moet zonder paginacontext begrijpelijk zijn.
- anchor_distribution moet ongeveer sommen tot 100.
- Geen H2 zonder must_include.`;
```

- [ ] **Step 2: Failing test**

```ts
// test/unit/agents/strategist.test.ts
import { describe, expect, it, vi } from "vitest";
import { runStrategist } from "@/agents/strategist";
import type { LLMProvider } from "@/llm/types";

const out = {
  outline: {
    h1_suggestion: "AI in HR voor MKB: stappenplan 2026",
    tldr_one_liner: "AI helpt MKB-HR vanaf vacature tot exit, mits AVG-proof.",
    tldr_summary_134_words: "x".repeat(700),
    h2_chunks: Array.from({ length: 5 }, (_, i) => ({
      h2: `H2-${i}`,
      subquestion_answered: `q${i}`,
      intended_word_count: 150,
      must_include: ["e1"],
      h3s: [],
    })),
    internal_links_to_inject: [
      { url: "https://artifation.nl/ai-scan/", anchor: "AI Scan" },
      { url: "https://artifation.nl/contact/", anchor: "neem contact op" },
      { url: "https://artifation.nl/ai-consultancy/", anchor: "AI consultancy" },
    ],
    external_links_to_cite: ["https://rvo.nl/wbso"],
    schema_choices: ["BlogPosting"],
    faq_block: [],
  },
  anchor_distribution: { exact_match_pct: 20, partial_pct: 40, semantic_pct: 40 },
  contrarian_opinion_hint: "MKB-HR overschat AI's vermogen om empathie te tonen.",
};

const provider: LLMProvider = {
  name: "anthropic",
  call: vi.fn(async () => ({
    text: JSON.stringify(out),
    inputTokens: 100,
    outputTokens: 200,
    model: "claude-sonnet-4-6",
    provider: "anthropic",
  })),
};

describe("runStrategist", () => {
  it("returns parsed outline", async () => {
    const r = await runStrategist(
      { research: {} as any, brand_voice: "informeel", target_keyword: "AI in HR" },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.outline.h2_chunks).toHaveLength(5);
  });
});
```

- [ ] **Step 3: Implementeer**

```ts
// src/agents/strategist.ts
import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import type { ResearchOutput } from "./researcher.ts";
import { STRATEGIST_SYSTEM_PROMPT } from "./prompts/strategist.ts";

export const StrategistOutputSchema = z.object({
  outline: z.object({
    h1_suggestion: z.string().max(80),
    tldr_one_liner: z.string().max(180),
    tldr_summary_134_words: z.string().min(100),
    h2_chunks: z
      .array(
        z.object({
          h2: z.string(),
          subquestion_answered: z.string(),
          intended_word_count: z.number().min(100).max(220),
          must_include: z.array(z.string()).min(1),
          h3s: z.array(z.string()).default([]),
        })
      )
      .min(5)
      .max(9),
    internal_links_to_inject: z.array(z.object({ url: z.string().url(), anchor: z.string() })).min(3),
    external_links_to_cite: z.array(z.string().url()),
    schema_choices: z.array(z.string()).min(1),
    faq_block: z.array(z.object({ q: z.string(), a_short: z.string() })).max(5),
  }),
  anchor_distribution: z.object({
    exact_match_pct: z.number(),
    partial_pct: z.number(),
    semantic_pct: z.number(),
  }),
  contrarian_opinion_hint: z.string(),
});
export type StrategistOutput = z.infer<typeof StrategistOutputSchema>;

export interface StrategistInput {
  research: ResearchOutput;
  brand_voice: string;
  target_keyword: string;
}

export interface StrategistDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runStrategist(input: StrategistInput, deps: StrategistDeps) {
  const model = resolveAgentModel("strategist");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: STRATEGIST_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: StrategistOutputSchema,
    },
    deps.sleepImpl
  );
}
```

- [ ] **Step 4: Run test (slaagt)**

```bash
npx vitest run test/unit/agents/strategist.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/agents/prompts/strategist.ts src/agents/strategist.ts test/unit/agents/strategist.test.ts
git commit -m "feat(agents): strategist agent met Sonnet 4.6"
```

---

### Task 17: Writer agent met reflection-loop

**Files:**
- Create: `src/agents/prompts/writer.ts`
- Create: `src/agents/writer.ts`
- Create: `test/unit/agents/writer.test.ts`

- [ ] **Step 1: System-prompt (writer + critic in één agent-file)**

```ts
// src/agents/prompts/writer.ts
export const WRITER_SYSTEM_PROMPT = (brandVoice: string, banList: string[]) => `Je bent een ervaren NL B2B contentschrijver voor Artifation.

BRAND VOICE: ${brandVoice}

JE KRIJGT: outline (h1, tldr, h2_chunks met subvragen + must_include, internal/external links, contrarian_opinion_hint).

JE OUTPUT: één strict JSON-object:
{
  "draft_html": string,             // volledige Gutenberg-HTML van de blog
  "self_score": number,             // 0-10, je eigen inschatting
  "self_critique": string           // 1-3 zinnen wat verbeterd kan worden
}

REGELS VOOR DE INHOUD (strict):
- Begin met een <div class="tldr">...</div> blok met tldr_one_liner als <strong> en tldr_summary_134_words direct daarachter.
- Daarna 5-9 <h2>...</h2> secties uit de outline. Elke H2-sectie 134-167 woorden, self-contained, beantwoordt z'n subvraag.
- Tussen de H2's: minimaal 3 internal links (uit outline.internal_links_to_inject) met de gegeven anchors.
- Externe links inline (uit outline.external_links_to_cite), 2-4 totaal.
- Verwerk minstens één originaliteits-element: eigen rekenvoorbeeld, NL-casus, of contrarian opinion (zie contrarian_opinion_hint).
- Sluit af met een conclusie-paragraaf met EXACT ÉÉN duidelijke CTA naar /ai-scan/ of /contact/. Geen "tot slot" of "in conclusion".
- Optioneel: eindig met FAQ-block uit outline.faq_block, gewikkeld in <div class="faq">.

VERBODEN ZINNEN/WOORDEN (banlist + standaard):
${[...banList, "in conclusion", "to sum up", "tot slot", "samenvattend", "in een wereld waar", "delve", "leverage", "harness the power of", "moreover", "furthermore", "additionally", "notably", "it's worth noting", "in de steeds veranderende wereld"].map((b) => `- ${b}`).join("\n")}

STIJL:
- NL, "je"-vorm.
- Mix korte zinnen (5-10 wd) met langere (20+); burstiness verplicht.
- Mix paragraaflengte (1-zin paragrafen toegestaan en aanmoedigd).
- Em-dash <= 1 per 300 woorden.
- Concrete getallen, geen vage adjectieven.

NA HET SCHRIJVEN: lees je draft kritisch. self_score 0-10 op originaliteit, voice, structuur. Bij score < 7: noteer in self_critique wat moet verbeteren.`;
```

- [ ] **Step 2: Failing test**

```ts
// test/unit/agents/writer.test.ts
import { describe, expect, it, vi } from "vitest";
import { runWriter } from "@/agents/writer";
import type { LLMProvider } from "@/llm/types";

const draftPass = JSON.stringify({
  draft_html: "<div class='tldr'>...</div><h2>x</h2>" + "p ".repeat(2000),
  self_score: 8.5,
  self_critique: "ok",
});

const draftLow = JSON.stringify({
  draft_html: "<h2>weak</h2>",
  self_score: 5,
  self_critique: "te kort",
});

describe("runWriter", () => {
  it("returns first draft if self_score >= 7", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({ text: draftPass, inputTokens: 1, outputTokens: 1, model: "x", provider: "anthropic" })),
    };
    const r = await runWriter(
      { outline: {} as any, brand_voice: "x", ban_list: [], contrarian_hint: "" },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.iterations).toBe(1);
    expect(provider.call).toHaveBeenCalledTimes(1);
  });

  it("re-iterates on self_score < 7 (max 2 extra)", async () => {
    const calls = [draftLow, draftLow, draftPass];
    let i = 0;
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({ text: calls[i++]!, inputTokens: 1, outputTokens: 1, model: "x", provider: "anthropic" })),
    };
    const r = await runWriter(
      { outline: {} as any, brand_voice: "x", ban_list: [], contrarian_hint: "" },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.iterations).toBe(3);
    expect(provider.call).toHaveBeenCalledTimes(3);
  });

  it("caps at 3 iterations even if score stays low", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({ text: draftLow, inputTokens: 1, outputTokens: 1, model: "x", provider: "anthropic" })),
    };
    const r = await runWriter(
      { outline: {} as any, brand_voice: "x", ban_list: [], contrarian_hint: "" },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.iterations).toBe(3);
    expect(provider.call).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 3: Implementeer (met reflection-loop, max 3 iterations totaal = 1 first + 2 retries)**

```ts
// src/agents/writer.ts
import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import type { StrategistOutput } from "./strategist.ts";
import { WRITER_SYSTEM_PROMPT } from "./prompts/writer.ts";

export const WriterOutputSchema = z.object({
  draft_html: z.string().min(500),
  self_score: z.number().min(0).max(10),
  self_critique: z.string(),
});
export type WriterOutput = z.infer<typeof WriterOutputSchema>;

export interface WriterInput {
  outline: StrategistOutput["outline"];
  brand_voice: string;
  ban_list: string[];
  contrarian_hint: string;
}

export interface WriterDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface WriterResult {
  parsed: WriterOutput;
  iterations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

const SELF_SCORE_THRESHOLD = 7;
const MAX_ITERATIONS = 3;

export async function runWriter(input: WriterInput, deps: WriterDeps): Promise<WriterResult> {
  const model = resolveAgentModel("writer");
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let last: WriterOutput | undefined;
  let iterations = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++;
    const userPrompt = i === 0
      ? JSON.stringify({ outline: input.outline, contrarian_hint: input.contrarian_hint }, null, 2)
      : JSON.stringify({
          outline: input.outline,
          contrarian_hint: input.contrarian_hint,
          previous_draft: last?.draft_html,
          previous_critique: last?.self_critique,
          instruction: "Verbeter de vorige draft op basis van de critique. Behoud structuur, fix de issues.",
        }, null, 2);

    const r = await runAgent(
      {
        provider: deps.provider,
        systemPrompt: WRITER_SYSTEM_PROMPT(input.brand_voice, input.ban_list),
        userPrompt,
        model: model.model,
        maxTokens: model.maxTokens,
        schema: WriterOutputSchema,
      },
      deps.sleepImpl
    );

    totalInputTokens += r.raw.inputTokens;
    totalOutputTokens += r.raw.outputTokens;
    last = r.parsed;

    if (r.parsed.self_score >= SELF_SCORE_THRESHOLD) break;
  }

  return { parsed: last!, iterations, totalInputTokens, totalOutputTokens };
}
```

- [ ] **Step 4: Run test (slaagt)**

```bash
npx vitest run test/unit/agents/writer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/agents/prompts/writer.ts src/agents/writer.ts test/unit/agents/writer.test.ts
git commit -m "feat(agents): writer agent met reflection-loop (max 3 iter)"
```

---

### Task 18: SEO Editor agent

**Files:**
- Create: `src/agents/prompts/seoEditor.ts`
- Create: `src/agents/seoEditor.ts`
- Create: `test/unit/agents/seoEditor.test.ts`

- [ ] **Step 1: System prompt**

```ts
// src/agents/prompts/seoEditor.ts
export const SEO_EDITOR_SYSTEM_PROMPT = `Je bent een SEO-editor die een draft technisch en stilistisch corrigeert.

JE KRIJGT: draft_html, target_keyword, internal_links_target_list, ban_list.

JE OUTPUT (strict JSON):
{
  "edited_html": string,             // gecorrigeerde draft
  "meta_title": string,              // ≤60 tekens, focus keyword vooraan
  "meta_description": string,        // ≤155 tekens, focus keyword + value prop + CTA-werkwoord
  "slug": string,                    // kebab-case, ≤6 woorden, focus keyword vooraan
  "alt_texts_per_image_placeholder": [string, ...],  // 1 per <img> placeholder
  "fixes_applied": [string, ...]     // log: welke ban-list items vervangen, welke H2 te kort/lang, etc.
}

REGELS:
- Vervang alle ban-list-hits door geschikte alternatieven.
- Zorg dat focus keyword voorkomt in: meta_title (vooraan), meta_description, slug, eerste 100 woorden, minstens 1 H2.
- Focus keyword density 0,5-1,5% van totale woorden.
- Verifieer dat ALLE internal_links_target_list URLs voorkomen in de draft. Voeg toe waar nodig.
- Verifieer ≥3 internal links totaal.
- Geen veranderingen aan TL;DR-block, contrarian opinion, of FAQ-block tenzij ban-list-hit.
- alt_texts in NL, beschrijvend, focus keyword licht verwerkt.`;
```

- [ ] **Step 2: Failing test**

```ts
// test/unit/agents/seoEditor.test.ts
import { describe, expect, it, vi } from "vitest";
import { runSeoEditor } from "@/agents/seoEditor";
import type { LLMProvider } from "@/llm/types";

const out = JSON.stringify({
  edited_html: "<div class='tldr'>...</div>" + "x".repeat(2000),
  meta_title: "AI in HR voor MKB | Artifation",
  meta_description: "Hoe AI MKB-HR helpt van vacature tot exit. Praktische stappen, tools en valkuilen. Plan een AI Scan vandaag.",
  slug: "ai-in-hr-mkb-stappenplan",
  alt_texts_per_image_placeholder: ["AI in HR header"],
  fixes_applied: ["replaced 'leverage' x2"],
});

const provider: LLMProvider = {
  name: "anthropic",
  call: vi.fn(async () => ({ text: out, inputTokens: 1, outputTokens: 1, model: "x", provider: "anthropic" })),
};

describe("runSeoEditor", () => {
  it("returns edited draft + meta", async () => {
    const r = await runSeoEditor(
      {
        draft_html: "<h2>x</h2>",
        target_keyword: "AI in HR",
        internal_links_target_list: [{ url: "https://artifation.nl/ai-scan/", anchor: "AI Scan" }],
        ban_list: ["leverage"],
      },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.meta_title.length).toBeLessThanOrEqual(80);
    expect(r.parsed.slug).toMatch(/^[a-z0-9-]+$/);
  });
});
```

- [ ] **Step 3: Implementeer**

```ts
// src/agents/seoEditor.ts
import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import { SEO_EDITOR_SYSTEM_PROMPT } from "./prompts/seoEditor.ts";

export const SeoEditorOutputSchema = z.object({
  edited_html: z.string().min(500),
  meta_title: z.string().min(10).max(80),
  meta_description: z.string().min(50).max(180),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80),
  alt_texts_per_image_placeholder: z.array(z.string()),
  fixes_applied: z.array(z.string()),
});
export type SeoEditorOutput = z.infer<typeof SeoEditorOutputSchema>;

export interface SeoEditorInput {
  draft_html: string;
  target_keyword: string;
  internal_links_target_list: { url: string; anchor: string }[];
  ban_list: string[];
}

export interface SeoEditorDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runSeoEditor(input: SeoEditorInput, deps: SeoEditorDeps) {
  const model = resolveAgentModel("seoEditor");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: SEO_EDITOR_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: SeoEditorOutputSchema,
    },
    deps.sleepImpl
  );
}
```

- [ ] **Step 4: Run + Commit**

```bash
npx vitest run test/unit/agents/seoEditor.test.ts
git add src/agents/prompts/seoEditor.ts src/agents/seoEditor.ts test/unit/agents/seoEditor.test.ts
git commit -m "feat(agents): SEO editor agent met Haiku 4.5"
```

---

### Task 19: Fact-Checker agent

**Files:**
- Create: `src/agents/prompts/factChecker.ts`
- Create: `src/agents/factChecker.ts`
- Create: `test/unit/agents/factChecker.test.ts`

- [ ] **Step 1: System prompt**

```ts
// src/agents/prompts/factChecker.ts
export const FACT_CHECKER_SYSTEM_PROMPT = `Je bent een fact-checker. Je krijgt een edited_html en een lijst key_facts (met source_url uit de Researcher).

OUTPUT (strict JSON):
{
  "verified_claims": [{"claim": string, "source_url": string}, ...],
  "unverifiable_claims": [{"claim": string, "reason": string}, ...],   // claim staat in draft maar niet in bronnen
  "fabricated_claims": [{"claim": string, "reason": string}, ...],     // duidelijk verzonnen (specifieke cijfers, namen, statistieken zonder bron)
  "verdict": "pass" | "fail"                                            // fail als ANY fabricated_claim
}

REGELS:
- Markeer ALLE specifieke getallen, namen, percentages, jaartallen, organisatie-namen.
- Een claim is "verified" alleen als de source_url de claim ondersteunt EN in de bronnenlijst staat.
- Een claim is "fabricated" als het een specifieke statistiek/cijfer/quote is zonder enige onderbouwing.
- Niet-specifieke generieke uitspraken ("AI groeit snel") zijn niet fact-checkbaar en hoef je niet te markeren.`;
```

- [ ] **Step 2: Failing test**

```ts
// test/unit/agents/factChecker.test.ts
import { describe, expect, it, vi } from "vitest";
import { runFactChecker } from "@/agents/factChecker";
import type { LLMProvider } from "@/llm/types";

const passOut = JSON.stringify({
  verified_claims: [{ claim: "X", source_url: "https://rvo.nl" }],
  unverifiable_claims: [],
  fabricated_claims: [],
  verdict: "pass",
});

const failOut = JSON.stringify({
  verified_claims: [],
  unverifiable_claims: [],
  fabricated_claims: [{ claim: "74,4% van NL MKB", reason: "geen bron" }],
  verdict: "fail",
});

describe("runFactChecker", () => {
  it("returns pass when no fabricated", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({ text: passOut, inputTokens: 1, outputTokens: 1, model: "x", provider: "anthropic" })),
    };
    const r = await runFactChecker(
      { edited_html: "x", key_facts: [{ claim: "X", source_url: "https://rvo.nl" }] },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.verdict).toBe("pass");
  });

  it("returns fail when fabricated", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({ text: failOut, inputTokens: 1, outputTokens: 1, model: "x", provider: "anthropic" })),
    };
    const r = await runFactChecker(
      { edited_html: "x", key_facts: [] },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.verdict).toBe("fail");
  });
});
```

- [ ] **Step 3: Implementeer**

```ts
// src/agents/factChecker.ts
import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import { FACT_CHECKER_SYSTEM_PROMPT } from "./prompts/factChecker.ts";

export const FactCheckerOutputSchema = z.object({
  verified_claims: z.array(z.object({ claim: z.string(), source_url: z.string().url() })),
  unverifiable_claims: z.array(z.object({ claim: z.string(), reason: z.string() })),
  fabricated_claims: z.array(z.object({ claim: z.string(), reason: z.string() })),
  verdict: z.enum(["pass", "fail"]),
});
export type FactCheckerOutput = z.infer<typeof FactCheckerOutputSchema>;

export interface FactCheckerInput {
  edited_html: string;
  key_facts: { claim: string; source_url: string }[];
}

export interface FactCheckerDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runFactChecker(input: FactCheckerInput, deps: FactCheckerDeps) {
  const model = resolveAgentModel("factChecker");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: FACT_CHECKER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: FactCheckerOutputSchema,
    },
    deps.sleepImpl
  );
}
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run test/unit/agents/factChecker.test.ts
git add src/agents/prompts/factChecker.ts src/agents/factChecker.ts test/unit/agents/factChecker.test.ts
git commit -m "feat(agents): fact-checker agent met Opus 4.7"
```

---

## Phase 5 — Quality Judge + rubric

### Task 20: Rubric-helpers (deterministische pre-scoring)

Sommige rubric-dimensies zijn deterministisch te scoren zonder LLM (banlist-count, em-dash density, internal-link-count, keyword-density). Deze geven we als input aan de Quality Judge zodat hij niet hoeft te tellen.

**Files:**
- Create: `src/pipeline/rubric.ts`
- Create: `test/unit/pipeline/rubric.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/pipeline/rubric.test.ts
import { describe, expect, it } from "vitest";
import { computeDeterministicRubricSignals } from "@/pipeline/rubric";

describe("computeDeterministicRubricSignals", () => {
  it("counts ban-list hits", () => {
    const r = computeDeterministicRubricSignals({
      html: "<p>we leverage AI to delve into things</p>",
      banList: ["leverage", "delve"],
      targetKeyword: "AI",
      internalUrls: [],
    });
    expect(r.banlist_hits).toBe(2);
  });

  it("computes em-dash density", () => {
    const r = computeDeterministicRubricSignals({
      html: "x — y — z. " + "word ".repeat(100),
      banList: [],
      targetKeyword: "x",
      internalUrls: [],
    });
    expect(r.emdash_per_1000_words).toBeGreaterThan(0);
  });

  it("counts internal links", () => {
    const r = computeDeterministicRubricSignals({
      html: '<a href="https://artifation.nl/a">x</a><a href="https://artifation.nl/b">y</a>',
      banList: [],
      targetKeyword: "x",
      internalUrls: ["https://artifation.nl/a", "https://artifation.nl/b"],
    });
    expect(r.internal_link_count).toBe(2);
  });

  it("computes word count + keyword density", () => {
    const r = computeDeterministicRubricSignals({
      html: "<p>" + "AI ".repeat(10) + "word ".repeat(990) + "</p>",
      banList: [],
      targetKeyword: "AI",
      internalUrls: [],
    });
    expect(r.word_count).toBeGreaterThan(900);
    expect(r.keyword_density_pct).toBeGreaterThan(0.5);
    expect(r.keyword_density_pct).toBeLessThan(1.5);
  });
});
```

- [ ] **Step 2: Implementeer**

```ts
// src/pipeline/rubric.ts
export interface RubricSignalsInput {
  html: string;
  banList: string[];
  targetKeyword: string;
  internalUrls: string[];
}

export interface RubricSignals {
  word_count: number;
  banlist_hits: number;
  banlist_hits_per_1000_words: number;
  emdash_count: number;
  emdash_per_1000_words: number;
  internal_link_count: number;
  external_link_count: number;
  keyword_density_pct: number;
  has_tldr_block: boolean;
  has_cta: boolean;
  paragraph_length_variance: number;
}

export function computeDeterministicRubricSignals(input: RubricSignalsInput): RubricSignals {
  const text = stripHtml(input.html);
  const words = text.split(/\s+/).filter(Boolean);
  const wc = words.length;

  const lowerText = text.toLowerCase();
  const lowerKw = input.targetKeyword.toLowerCase();

  const banlistHits = input.banList.reduce(
    (sum, b) => sum + countOccurrences(lowerText, b.toLowerCase()),
    0
  );

  const emdashCount = (input.html.match(/—/g) || []).length;

  const allLinks = [...input.html.matchAll(/<a\s+[^>]*href="([^"]+)"/gi)].map((m) => m[1]!);
  const internalLinkCount = allLinks.filter((u) =>
    input.internalUrls.some((iu) => u.startsWith(iu) || u === iu)
  ).length;
  const externalLinkCount = allLinks.length - internalLinkCount;

  const kwOccurrences = countOccurrences(lowerText, lowerKw);
  const keywordDensityPct = wc > 0 ? (kwOccurrences * lowerKw.split(/\s+/).length * 100) / wc : 0;

  const hasTldr = /<div[^>]*class=["'][^"']*tldr[^"']*["']/i.test(input.html);
  const hasCta =
    /\/ai-scan\//.test(input.html) || /\/contact\//.test(input.html);

  const paragraphs = [...input.html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) =>
    stripHtml(m[1]!).split(/\s+/).filter(Boolean).length
  );
  const variance = paragraphs.length > 1 ? stdev(paragraphs) : 0;

  return {
    word_count: wc,
    banlist_hits: banlistHits,
    banlist_hits_per_1000_words: wc > 0 ? (banlistHits * 1000) / wc : 0,
    emdash_count: emdashCount,
    emdash_per_1000_words: wc > 0 ? (emdashCount * 1000) / wc : 0,
    internal_link_count: internalLinkCount,
    external_link_count: externalLinkCount,
    keyword_density_pct: keywordDensityPct,
    has_tldr_block: hasTldr,
    has_cta: hasCta,
    paragraph_length_variance: variance,
  };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let i = 0, count = 0;
  while (true) {
    const idx = haystack.indexOf(needle, i);
    if (idx === -1) return count;
    count++;
    i = idx + needle.length;
  }
}

function stdev(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sq = arr.map((x) => (x - mean) ** 2);
  return Math.sqrt(sq.reduce((a, b) => a + b, 0) / arr.length);
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run test/unit/pipeline/rubric.test.ts
git add src/pipeline/rubric.ts test/unit/pipeline/rubric.test.ts
git commit -m "feat(pipeline): deterministische rubric-signals (banlist, density, links)"
```

---

### Task 21: Quality Judge agent

**Files:**
- Create: `src/agents/prompts/qualityJudge.ts`
- Create: `src/agents/qualityJudge.ts`
- Create: `test/unit/agents/qualityJudge.test.ts`

- [ ] **Step 1: System prompt**

```ts
// src/agents/prompts/qualityJudge.ts
export const QUALITY_JUDGE_SYSTEM_PROMPT = `Je bent een SEO-Quality-Judge. Je krijgt:
- edited_html (de definitieve draft)
- target_keyword
- deterministic_signals (banlist_hits, emdash_per_1000_words, internal_link_count, etc.)
- fact_check_verdict ("pass" of "fail")
- fabricated_claims_count

JE OUTPUT (strict JSON):
{
  "scores": {
    "semantic_completeness": number,    // 0-10: zijn H2's self-contained, 134-167 wd, beantwoorden subvragen?
    "originality": number,              // 0-10: aanwezig: eigen data/voorbeeld/contrarian opinion? HARD FAIL <6.
    "anti_ai_cliche": number,           // 0-10: gebruik deterministic signals
    "fact_check": number,               // 10 als verdict=pass, 0 als fail
    "seo_tech": number,                 // 0-10: meta, slug, alt, ≥3 internal links, schema
    "brand_voice": number,              // 0-10: NL "je"-vorm, Artifation-toon
    "readability": number               // 0-10: burstiness, paragraaf-mix
  },
  "weighted_total": number,             // bereken: 0.20*sem + 0.25*orig + 0.15*cliche + 0.15*fact + 0.10*seo + 0.10*voice + 0.05*read
  "hard_fails": [string, ...],          // lijst getriggerde hard fails
  "verdict": "GO" | "NO-GO",            // NO-GO als weighted_total < 8.0 OF één hard_fail
  "reasoning": string,                  // 3-5 zinnen waarom
  "improvement_suggestions": [string, ...]
}

HARD FAILS:
- originality < 6
- fact_check = 0 (verdict=fail)
- banlist_hits_per_1000_words > 3

Wees STRENG. Een 8.0-drempel betekent serieus serieus.`;
```

- [ ] **Step 2: Failing test**

```ts
// test/unit/agents/qualityJudge.test.ts
import { describe, expect, it, vi } from "vitest";
import { runQualityJudge } from "@/agents/qualityJudge";
import type { LLMProvider } from "@/llm/types";

const goOut = JSON.stringify({
  scores: {
    semantic_completeness: 8.5,
    originality: 8,
    anti_ai_cliche: 9,
    fact_check: 10,
    seo_tech: 8,
    brand_voice: 9,
    readability: 8,
  },
  weighted_total: 8.6,
  hard_fails: [],
  verdict: "GO",
  reasoning: "alles goed",
  improvement_suggestions: [],
});

const noGoOut = JSON.stringify({
  scores: {
    semantic_completeness: 7,
    originality: 5,
    anti_ai_cliche: 7,
    fact_check: 10,
    seo_tech: 6,
    brand_voice: 7,
    readability: 7,
  },
  weighted_total: 6.5,
  hard_fails: ["originality < 6"],
  verdict: "NO-GO",
  reasoning: "te generiek",
  improvement_suggestions: ["voeg eigen casus toe"],
});

describe("runQualityJudge", () => {
  it("returns GO verdict on high scores", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({ text: goOut, inputTokens: 1, outputTokens: 1, model: "x", provider: "anthropic" })),
    };
    const r = await runQualityJudge(
      { edited_html: "x", target_keyword: "y", deterministic_signals: {} as any, fact_check_verdict: "pass", fabricated_claims_count: 0 },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.verdict).toBe("GO");
  });

  it("returns NO-GO with hard fail", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({ text: noGoOut, inputTokens: 1, outputTokens: 1, model: "x", provider: "anthropic" })),
    };
    const r = await runQualityJudge(
      { edited_html: "x", target_keyword: "y", deterministic_signals: {} as any, fact_check_verdict: "pass", fabricated_claims_count: 0 },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.verdict).toBe("NO-GO");
    expect(r.parsed.hard_fails).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Implementeer**

```ts
// src/agents/qualityJudge.ts
import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import type { RubricSignals } from "@/pipeline/rubric";
import { QUALITY_JUDGE_SYSTEM_PROMPT } from "./prompts/qualityJudge.ts";

export const QualityJudgeOutputSchema = z.object({
  scores: z.object({
    semantic_completeness: z.number().min(0).max(10),
    originality: z.number().min(0).max(10),
    anti_ai_cliche: z.number().min(0).max(10),
    fact_check: z.number().min(0).max(10),
    seo_tech: z.number().min(0).max(10),
    brand_voice: z.number().min(0).max(10),
    readability: z.number().min(0).max(10),
  }),
  weighted_total: z.number().min(0).max(10),
  hard_fails: z.array(z.string()),
  verdict: z.enum(["GO", "NO-GO"]),
  reasoning: z.string(),
  improvement_suggestions: z.array(z.string()),
});
export type QualityJudgeOutput = z.infer<typeof QualityJudgeOutputSchema>;

export interface QualityJudgeInput {
  edited_html: string;
  target_keyword: string;
  deterministic_signals: RubricSignals;
  fact_check_verdict: "pass" | "fail";
  fabricated_claims_count: number;
}

export interface QualityJudgeDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runQualityJudge(input: QualityJudgeInput, deps: QualityJudgeDeps) {
  const model = resolveAgentModel("qualityJudge");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: QUALITY_JUDGE_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: QualityJudgeOutputSchema,
    },
    deps.sleepImpl
  );
}
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run test/unit/agents/qualityJudge.test.ts
git add src/agents/prompts/qualityJudge.ts src/agents/qualityJudge.ts test/unit/agents/qualityJudge.test.ts
git commit -m "feat(agents): quality judge met rubric-eval"
```

---

## Phase 6 — Image pipeline

### Task 22: Image Prompter agent

**Files:**
- Create: `src/agents/prompts/imagePrompter.ts`
- Create: `src/agents/imagePrompter.ts`
- Create: `test/unit/agents/imagePrompter.test.ts`

- [ ] **Step 1: Prompt**

```ts
// src/agents/prompts/imagePrompter.ts
export const IMAGE_PROMPTER_SYSTEM_PROMPT = `Je krijgt een blog-titel + samenvatting + brand-style. Je schrijft één Flux-1.1-Pro-Ultra image-prompt voor een editorial blog-header (1024x1024).

OUTPUT (strict JSON):
{
  "prompt": string,           // engelstalig, gedetailleerd, editorial-stijl, brand-passend
  "negative_prompt": string,  // wat niet
  "alt_text_nl": string       // NL alt-text, beschrijvend, ≤100 ch, focus keyword licht verwerkt
}

REGELS:
- Geen mensen-in-focus (B2B, neutrale uitstraling).
- Geen logos/merken.
- Editorial / corporate / abstract-modern.
- Brand-kleuren als hint: blauw + donkerblauw.
- Geen tekst in de afbeelding.`;
```

- [ ] **Step 2: Failing test**

```ts
// test/unit/agents/imagePrompter.test.ts
import { describe, expect, it, vi } from "vitest";
import { runImagePrompter } from "@/agents/imagePrompter";
import type { LLMProvider } from "@/llm/types";

describe("runImagePrompter", () => {
  it("returns prompt + negative + alt", async () => {
    const provider: LLMProvider = {
      name: "groq",
      call: vi.fn(async () => ({
        text: JSON.stringify({
          prompt: "editorial corporate blue gradient abstract data flow",
          negative_prompt: "people, faces, logos, text",
          alt_text_nl: "Abstracte visualisatie van AI in HR voor MKB",
        }),
        inputTokens: 1, outputTokens: 1, model: "x", provider: "groq",
      })),
    };
    const r = await runImagePrompter(
      { title: "AI in HR", tldr: "summary", brand_style: "blue corporate" },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.prompt.length).toBeGreaterThan(0);
    expect(r.parsed.alt_text_nl.length).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 3: Implementeer**

```ts
// src/agents/imagePrompter.ts
import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import { IMAGE_PROMPTER_SYSTEM_PROMPT } from "./prompts/imagePrompter.ts";

export const ImagePrompterOutputSchema = z.object({
  prompt: z.string().min(20),
  negative_prompt: z.string(),
  alt_text_nl: z.string().min(10).max(100),
});
export type ImagePrompterOutput = z.infer<typeof ImagePrompterOutputSchema>;

export interface ImagePrompterInput {
  title: string;
  tldr: string;
  brand_style: string;
}

export interface ImagePrompterDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runImagePrompter(input: ImagePrompterInput, deps: ImagePrompterDeps) {
  const model = resolveAgentModel("imagePrompter");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: IMAGE_PROMPTER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: ImagePrompterOutputSchema,
    },
    deps.sleepImpl
  );
}
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run test/unit/agents/imagePrompter.test.ts
git add src/agents/prompts/imagePrompter.ts src/agents/imagePrompter.ts test/unit/agents/imagePrompter.test.ts
git commit -m "feat(agents): image prompter agent met Groq"
```

---

### Task 23: Fal.ai image-generator (+ optional Cloudflare fallback)

**Files:**
- Create: `src/image/fal.ts`
- Create: `src/image/cloudflare.ts`
- Create: `src/image/index.ts`
- Create: `test/unit/image/fal.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/image/fal.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(async () => ({
      data: { images: [{ url: "https://fal.test/img.png" }] },
    })),
  },
}));

import { generateImageWithFal } from "@/image/fal";

describe("generateImageWithFal", () => {
  it("returns image url + dimensions", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      headers: new Headers({ "content-type": "image/png" }),
    } as Response));

    const r = await generateImageWithFal({
      prompt: "x",
      negative_prompt: "y",
      apiKey: "test",
      fetchImpl,
    });
    expect(r.url).toBe("https://fal.test/img.png");
    expect(r.bytes).toBeInstanceOf(Buffer);
  });
});
```

- [ ] **Step 2: Implementeer Fal.ai**

```ts
// src/image/fal.ts
import { fal } from "@fal-ai/client";

export interface GenerateImageInput {
  prompt: string;
  negative_prompt: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface GeneratedImage {
  url: string;
  bytes: Buffer;
  contentType: string;
}

export async function generateImageWithFal(input: GenerateImageInput): Promise<GeneratedImage> {
  fal.config({ credentials: input.apiKey });

  const result = await fal.subscribe("fal-ai/flux-pro/v1.1-ultra", {
    input: {
      prompt: input.prompt,
      negative_prompt: input.negative_prompt,
      num_images: 1,
      enable_safety_checker: true,
      output_format: "png",
      aspect_ratio: "1:1",
    },
  });

  const url = (result as { data: { images: { url: string }[] } }).data.images[0]?.url;
  if (!url) throw new Error("Fal.ai returned no image URL");

  const f = input.fetchImpl ?? fetch;
  const res = await f(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const arr = await res.arrayBuffer();

  return {
    url,
    bytes: Buffer.from(arr),
    contentType: res.headers.get("content-type") ?? "image/png",
  };
}
```

- [ ] **Step 3: Cloudflare fallback (stub-implementatie, optioneel)**

```ts
// src/image/cloudflare.ts
import type { GenerateImageInput, GeneratedImage } from "./fal.ts";

export async function generateImageWithCloudflare(
  input: GenerateImageInput & { accountId: string }
): Promise<GeneratedImage> {
  const f = input.fetchImpl ?? fetch;
  const url = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const res = await f(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: input.prompt }),
  });
  if (!res.ok) throw new Error(`Cloudflare image gen failed: ${res.status}`);
  const json = (await res.json()) as { result: { image: string } };
  const bytes = Buffer.from(json.result.image, "base64");
  return { url: "cf://generated", bytes, contentType: "image/jpeg" };
}
```

- [ ] **Step 4: Index met fallback-router**

```ts
// src/image/index.ts
import { generateImageWithFal } from "./fal.ts";
import { generateImageWithCloudflare } from "./cloudflare.ts";

export interface ImageGenInput {
  prompt: string;
  negative_prompt: string;
  fetchImpl?: typeof fetch;
}

export interface ImageGenEnv {
  FAL_API_KEY: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
}

export async function generateBlogImage(
  input: ImageGenInput,
  env: ImageGenEnv
): Promise<{ url: string; bytes: Buffer; contentType: string; fallbackUsed: boolean }> {
  let lastErr: Error | undefined;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await generateImageWithFal({ ...input, apiKey: env.FAL_API_KEY });
      return { ...r, fallbackUsed: false };
    } catch (err) {
      lastErr = err as Error;
    }
  }
  if (env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
    const r = await generateImageWithCloudflare({
      ...input,
      apiKey: env.CF_API_TOKEN,
      accountId: env.CF_ACCOUNT_ID,
    });
    return { ...r, fallbackUsed: true };
  }
  throw new Error(`Image generation failed: ${lastErr?.message}`);
}
```

- [ ] **Step 5: Run + commit**

```bash
npx vitest run test/unit/image/fal.test.ts
git add src/image/ test/unit/image/
git commit -m "feat(image): Fal.ai Flux 1.1 Pro Ultra + optional CF fallback"
```

---

## Phase 7 — WordPress client

### Task 24: WordPress base client (auth)

**Files:**
- Create: `src/wordpress/client.ts`
- Create: `test/unit/wordpress/client.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/wordpress/client.test.ts
import { describe, expect, it, vi } from "vitest";
import { createWordpressClient } from "@/wordpress/client";

describe("WordpressClient", () => {
  it("sends Basic auth header", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response));

    const c = createWordpressClient({
      baseUrl: "https://x.test",
      user: "u",
      appPassword: "p",
      fetchImpl,
    });

    await c.get("/wp-json/wp/v2/posts");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://x.test/wp-json/wp/v2/posts",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from("u:p").toString("base64")}`,
        }),
      })
    );
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    } as Response));

    const c = createWordpressClient({
      baseUrl: "https://x.test", user: "u", appPassword: "p", fetchImpl,
    });

    await expect(c.get("/wp-json/wp/v2/posts")).rejects.toThrow(/401/);
  });
});
```

- [ ] **Step 2: Implementeer**

```ts
// src/wordpress/client.ts
export interface WordpressClientOpts {
  baseUrl: string;
  user: string;
  appPassword: string;
  fetchImpl?: typeof fetch;
}

export interface WordpressClient {
  get<T>(path: string): Promise<T>;
  postJson<T>(path: string, body: unknown): Promise<T>;
  postBinary<T>(path: string, body: Buffer, contentType: string, filename: string): Promise<T>;
}

export function createWordpressClient(opts: WordpressClientOpts): WordpressClient {
  const f = opts.fetchImpl ?? fetch;
  const auth = `Basic ${Buffer.from(`${opts.user}:${opts.appPassword}`).toString("base64")}`;

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await f(`${opts.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: auth, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`WP ${init.method ?? "GET"} ${path} failed: ${res.status} ${body}`);
    }
    return (await res.json()) as T;
  }

  return {
    get: (path) => call(path, { method: "GET" }),
    postJson: (path, body) =>
      call(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    postBinary: (path, body, contentType, filename) =>
      call(path, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
        body,
      }),
  };
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run test/unit/wordpress/client.test.ts
git add src/wordpress/client.ts test/unit/wordpress/client.test.ts
git commit -m "feat(wordpress): base client met App-Password auth"
```

---

### Task 25: WordPress media + posts

**Files:**
- Create: `src/wordpress/media.ts`
- Create: `src/wordpress/posts.ts`
- Create: `src/wordpress/rankMath.ts`
- Create: `test/unit/wordpress/media.test.ts`
- Create: `test/unit/wordpress/posts.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// test/unit/wordpress/media.test.ts
import { describe, expect, it, vi } from "vitest";
import { uploadMedia } from "@/wordpress/media";

describe("uploadMedia", () => {
  it("posts binary and returns media id + url", async () => {
    const c = {
      get: vi.fn(),
      postJson: vi.fn(),
      postBinary: vi.fn(async () => ({ id: 42, source_url: "https://x.test/i.png" })),
    };
    const r = await uploadMedia(c, {
      bytes: Buffer.from("x"),
      contentType: "image/png",
      filename: "header.png",
      altText: "Alt",
    });
    expect(r.id).toBe(42);
    expect(c.postBinary).toHaveBeenCalledWith(
      "/wp-json/wp/v2/media",
      expect.any(Buffer),
      "image/png",
      "header.png"
    );
  });
});
```

```ts
// test/unit/wordpress/posts.test.ts
import { describe, expect, it, vi } from "vitest";
import { createDraftPost } from "@/wordpress/posts";

describe("createDraftPost", () => {
  it("posts JSON with status=draft", async () => {
    const c = {
      get: vi.fn(),
      postJson: vi.fn(async () => ({ id: 99, link: "https://x.test/?p=99" })),
      postBinary: vi.fn(),
    };
    const r = await createDraftPost(c, {
      title: "T",
      content: "C",
      slug: "s",
      excerpt: "e",
      featuredMediaId: 42,
      categories: [],
      tags: [],
    });
    expect(r.id).toBe(99);
    expect(c.postJson).toHaveBeenCalledWith(
      "/wp-json/wp/v2/posts",
      expect.objectContaining({ status: "draft", featured_media: 42 })
    );
  });
});
```

- [ ] **Step 2: Implementeer media + posts + rankMath**

```ts
// src/wordpress/media.ts
import type { WordpressClient } from "./client.ts";

export interface UploadMediaInput {
  bytes: Buffer;
  contentType: string;
  filename: string;
  altText: string;
}

export interface UploadMediaResult {
  id: number;
  source_url: string;
}

export async function uploadMedia(
  client: WordpressClient,
  input: UploadMediaInput
): Promise<UploadMediaResult> {
  const created = await client.postBinary<UploadMediaResult>(
    "/wp-json/wp/v2/media",
    input.bytes,
    input.contentType,
    input.filename
  );
  await client.postJson(`/wp-json/wp/v2/media/${created.id}`, { alt_text: input.altText });
  return created;
}
```

```ts
// src/wordpress/posts.ts
import type { WordpressClient } from "./client.ts";

export interface CreatePostInput {
  title: string;
  content: string;
  slug: string;
  excerpt: string;
  featuredMediaId: number;
  categories: number[];
  tags: number[];
}

export interface CreatePostResult {
  id: number;
  link: string;
}

export async function createDraftPost(
  client: WordpressClient,
  input: CreatePostInput
): Promise<CreatePostResult> {
  return client.postJson<CreatePostResult>("/wp-json/wp/v2/posts", {
    status: "draft",
    title: input.title,
    content: input.content,
    excerpt: input.excerpt,
    slug: input.slug,
    featured_media: input.featuredMediaId,
    categories: input.categories,
    tags: input.tags,
  });
}

export function buildEditUrl(baseUrl: string, postId: number): string {
  return `${baseUrl}/wp-admin/post.php?post=${postId}&action=edit`;
}
```

```ts
// src/wordpress/rankMath.ts
import type { WordpressClient } from "./client.ts";

export interface RankMathMeta {
  rank_math_title: string;
  rank_math_description: string;
  rank_math_focus_keyword: string;
  rank_math_canonical_url?: string;
}

export async function setRankMathMeta(
  client: WordpressClient,
  postId: number,
  meta: RankMathMeta
): Promise<void> {
  // Vereist: Rank Math API Manager plugin (zie spec §14)
  await client.postJson(`/wp-json/rank-math-api/v1/updateMeta`, {
    objectID: postId,
    objectType: "post",
    meta,
  });
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run test/unit/wordpress/
git add src/wordpress/ test/unit/wordpress/
git commit -m "feat(wordpress): media upload + draft post + Rank Math meta"
```

---

## Phase 8 — Email

### Task 26: Email templates (react-email)

**Files:**
- Create: `src/email/templates/Success.tsx`
- Create: `src/email/templates/Reject.tsx`
- Create: `src/email/templates/CapReached.tsx`
- Create: `src/email/templates/Error.tsx`
- Create: `test/unit/email/templates.test.ts`

- [ ] **Step 1: Implementeer Success-template**

```tsx
// src/email/templates/Success.tsx
import { Html, Body, Container, Heading, Section, Text, Link, Img } from "@react-email/components";
import * as React from "react";

export interface SuccessProps {
  title: string;
  weightedTotal: number;
  scoreBreakdown: Record<string, number>;
  tldr: string;
  imageUrl: string;
  editUrl: string;
  previewUrl: string;
  targetKeyword: string;
  internalLinksUsed: { url: string; anchor: string }[];
}

export const Success: React.FC<SuccessProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>✅ Concept klaar voor review</Heading>
        <Text><strong>{p.title}</strong></Text>
        <Text>Score: <strong>{p.weightedTotal.toFixed(1)}</strong> / 10</Text>
        <Section>
          <Text>Score-breakdown:</Text>
          <ul>
            {Object.entries(p.scoreBreakdown).map(([k, v]) => (
              <li key={k}>{k}: {v.toFixed(1)}</li>
            ))}
          </ul>
        </Section>
        <Img src={p.imageUrl} alt="featured" width={600} />
        <Section>
          <Text>{p.tldr}</Text>
        </Section>
        <Section>
          <Link href={p.editUrl}>📝 Open in WordPress (concept)</Link><br />
          <Link href={p.previewUrl}>👁️ Live preview</Link>
        </Section>
        <Text>Target keyword: <code>{p.targetKeyword}</code></Text>
        <Text>Internal links gebruikt:</Text>
        <ul>
          {p.internalLinksUsed.map((l) => (
            <li key={l.url}><a href={l.url}>{l.anchor}</a></li>
          ))}
        </ul>
      </Container>
    </Body>
  </Html>
);
```

- [ ] **Step 2: Implementeer Reject-template**

```tsx
// src/email/templates/Reject.tsx
import { Html, Body, Container, Heading, Section, Text } from "@react-email/components";
import * as React from "react";

export interface RejectProps {
  title: string;
  weightedTotal: number;
  scoreBreakdown: Record<string, number>;
  hardFails: string[];
  reasoning: string;
  improvementSuggestions: string[];
}

export const Reject: React.FC<RejectProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>❌ Reject — draft viel onder de drempel</Heading>
        <Text><strong>{p.title}</strong></Text>
        <Text>Score: <strong>{p.weightedTotal.toFixed(1)}</strong> / 10 — drempel 8.0</Text>
        {p.hardFails.length > 0 && (
          <Section>
            <Text><strong>Hard fails getriggerd:</strong></Text>
            <ul>{p.hardFails.map((h) => <li key={h}>{h}</li>)}</ul>
          </Section>
        )}
        <Section>
          <Text>Score-breakdown:</Text>
          <ul>
            {Object.entries(p.scoreBreakdown).map(([k, v]) => (
              <li key={k}>{k}: {v.toFixed(1)}</li>
            ))}
          </ul>
        </Section>
        <Section>
          <Text><strong>Judge reasoning:</strong></Text>
          <Text>{p.reasoning}</Text>
        </Section>
        <Section>
          <Text><strong>Verbeter-suggesties:</strong></Text>
          <ul>{p.improvementSuggestions.map((s) => <li key={s}>{s}</li>)}</ul>
        </Section>
        <Text>De volledige draft + outline staat als bijlage bij deze email.</Text>
      </Container>
    </Body>
  </Html>
);
```

- [ ] **Step 3: CapReached + Error templates (analoge structuur)**

```tsx
// src/email/templates/CapReached.tsx
import { Html, Body, Container, Heading, Text } from "@react-email/components";
import * as React from "react";

export interface CapReachedProps {
  title: string;
  weightedTotal: number;
  weeklyCap: number;
  publishedThisWeek: number;
}

export const CapReached: React.FC<CapReachedProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>📦 Cap bereikt — draft bewaard</Heading>
        <Text><strong>{p.title}</strong> haalde {p.weightedTotal.toFixed(1)} / 10.</Text>
        <Text>Deze week zijn al {p.publishedThisWeek}/{p.weeklyCap} concepten gepubliceerd. De draft staat als bijlage.</Text>
      </Container>
    </Body>
  </Html>
);
```

```tsx
// src/email/templates/Error.tsx
import { Html, Body, Container, Heading, Text, Link } from "@react-email/components";
import * as React from "react";

export interface ErrorProps {
  date: string;
  stage: string;
  message: string;
  runUrl?: string;
}

export const ErrorMail: React.FC<ErrorProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>⚠️ Pipeline-fout op {p.date}</Heading>
        <Text>Stage: <strong>{p.stage}</strong></Text>
        <Text>Error: <code>{p.message}</code></Text>
        {p.runUrl && <Text><Link href={p.runUrl}>Bekijk Actions-run</Link></Text>}
      </Container>
    </Body>
  </Html>
);
```

- [ ] **Step 4: Snapshot-test voor templates**

```ts
// test/unit/email/templates.test.ts
import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { Success } from "@/email/templates/Success";
import { Reject } from "@/email/templates/Reject";

describe("email templates render", () => {
  it("renders success", async () => {
    const html = await render(Success({
      title: "T",
      weightedTotal: 8.5,
      scoreBreakdown: { semantic_completeness: 9 },
      tldr: "tldr",
      imageUrl: "https://x.test/i.png",
      editUrl: "https://x.test/edit",
      previewUrl: "https://x.test/preview",
      targetKeyword: "kw",
      internalLinksUsed: [{ url: "https://x.test/a", anchor: "a" }],
    }));
    expect(html).toContain("Concept klaar");
    expect(html).toContain("8.5");
  });

  it("renders reject", async () => {
    const html = await render(Reject({
      title: "T",
      weightedTotal: 6.2,
      scoreBreakdown: { originality: 5 },
      hardFails: ["originality < 6"],
      reasoning: "te generiek",
      improvementSuggestions: ["voeg casus toe"],
    }));
    expect(html).toContain("Reject");
    expect(html).toContain("6.2");
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
npx vitest run test/unit/email/templates.test.ts
git add src/email/templates/ test/unit/email/templates.test.ts
git commit -m "feat(email): react-email templates (success/reject/cap/error)"
```

---

### Task 27: Resend sender

**Files:**
- Create: `src/email/resend.ts`
- Create: `test/unit/email/resend.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/email/resend.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: vi.fn(async (req: any) => ({ data: { id: "msg-1" }, error: null, _req: req })),
    };
  },
}));

import { sendEmail } from "@/email/resend";

describe("sendEmail", () => {
  it("calls Resend SDK with rendered HTML + attachments", async () => {
    const r = await sendEmail({
      apiKey: "key",
      from: "a@x.test",
      to: "b@x.test",
      replyTo: "c@x.test",
      subject: "S",
      html: "<p>hi</p>",
      attachments: [{ filename: "draft.html", content: Buffer.from("<x/>") }],
    });
    expect(r.id).toBe("msg-1");
  });
});
```

- [ ] **Step 2: Implementeer**

```ts
// src/email/resend.ts
import { Resend } from "resend";

export interface SendEmailInput {
  apiKey: string;
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const client = new Resend(input.apiKey);
  const res = await client.emails.send({
    from: input.from,
    to: input.to,
    reply_to: input.replyTo,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  } as Parameters<Resend["emails"]["send"]>[0]);

  if (res.error) throw new Error(`Resend error: ${res.error.message}`);
  return { id: res.data?.id ?? "" };
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run test/unit/email/resend.test.ts
git add src/email/resend.ts test/unit/email/resend.test.ts
git commit -m "feat(email): resend sender met attachments"
```

---

## Phase 9 — Pipeline orchestrator

### Task 28: Cost-tracker

**Files:**
- Create: `src/pipeline/costTracker.ts`
- Create: `test/unit/pipeline/costTracker.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/pipeline/costTracker.test.ts
import { describe, expect, it } from "vitest";
import { computeRunCost } from "@/pipeline/costTracker";

describe("computeRunCost", () => {
  it("computes cost from token counts per provider/model", () => {
    const cost = computeRunCost([
      { provider: "anthropic", model: "claude-sonnet-4-6", inputTokens: 2000, outputTokens: 3000 },
      { provider: "anthropic", model: "claude-haiku-4-5-20251001", inputTokens: 3000, outputTokens: 3000 },
      { provider: "anthropic", model: "claude-opus-4-7", inputTokens: 2000, outputTokens: 800 },
      { provider: "gemini", model: "gemini-2.5-pro", inputTokens: 8000, outputTokens: 1000 },
      { provider: "groq", model: "llama-3.3-70b-versatile", inputTokens: 500, outputTokens: 200 },
    ]);
    expect(cost.totalUsd).toBeGreaterThan(0);
    expect(cost.totalUsd).toBeLessThan(0.5);
    expect(cost.breakdown.length).toBe(5);
  });
});
```

- [ ] **Step 2: Implementeer**

```ts
// src/pipeline/costTracker.ts
import type { LLMProviderName } from "@/llm/types";

export interface UsageEntry {
  provider: LLMProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CostBreakdownEntry extends UsageEntry {
  costUsd: number;
}

export interface CostResult {
  totalUsd: number;
  breakdown: CostBreakdownEntry[];
}

interface PriceTier {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

const PRICES: Record<string, PriceTier> = {
  "claude-opus-4-7": { inputUsdPerMillion: 5, outputUsdPerMillion: 25 },
  "claude-sonnet-4-6": { inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
  "claude-haiku-4-5-20251001": { inputUsdPerMillion: 1, outputUsdPerMillion: 5 },
  "gemini-2.5-pro": { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 },
  "llama-3.3-70b-versatile": { inputUsdPerMillion: 0, outputUsdPerMillion: 0 }, // Groq free tier
};

export function computeRunCost(usage: UsageEntry[]): CostResult {
  const breakdown = usage.map((u) => {
    const p = PRICES[u.model] ?? { inputUsdPerMillion: 0, outputUsdPerMillion: 0 };
    const costUsd =
      (u.inputTokens * p.inputUsdPerMillion + u.outputTokens * p.outputUsdPerMillion) / 1_000_000;
    return { ...u, costUsd };
  });
  return {
    totalUsd: breakdown.reduce((s, e) => s + e.costUsd, 0),
    breakdown,
  };
}

export interface RollingCounter {
  totalUsdLast7Days: number;
  history: { dateIso: string; costUsd: number }[];
}

export function appendRunCost(counter: RollingCounter, costUsd: number, now: Date): RollingCounter {
  const history = [
    ...counter.history,
    { dateIso: now.toISOString(), costUsd },
  ];
  const cutoff = new Date(now.getTime() - 7 * 86400_000);
  const recent = history.filter((h) => new Date(h.dateIso) >= cutoff);
  return {
    totalUsdLast7Days: recent.reduce((s, h) => s + h.costUsd, 0),
    history: recent,
  };
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run test/unit/pipeline/costTracker.test.ts
git add src/pipeline/costTracker.ts test/unit/pipeline/costTracker.test.ts
git commit -m "feat(pipeline): cost tracker met 7-day rolling counter"
```

---

### Task 29: State-helpers (queue read/write + run-log)

**Files:**
- Create: `src/pipeline/state.ts`
- Create: `test/unit/pipeline/state.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/pipeline/state.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { countPublishedThisIsoWeek, markTopicStatus } from "@/pipeline/state";
import type { Topic } from "@/config/topics";

const t = (over: Partial<Topic>): Topic => ({
  id: "x", title: "X", pillar: "a", target_keyword: "x",
  intended_word_count: 1500, status: "queued", priority: 1, ...over,
});

describe("state helpers", () => {
  it("counts published topics in same ISO week", () => {
    const now = new Date("2026-05-08T10:00:00Z"); // Friday week 19
    const list = [
      t({ id: "a", status: "published", last_attempted: "2026-05-05T10:00Z" }), // Tue same week
      t({ id: "b", status: "published", last_attempted: "2026-05-04T10:00Z" }), // Mon same week
      t({ id: "c", status: "published", last_attempted: "2026-04-28T10:00Z" }), // prev week
    ];
    expect(countPublishedThisIsoWeek(list, now)).toBe(2);
  });

  it("marks topic status", () => {
    const list = [t({ id: "a" }), t({ id: "b" })];
    const updated = markTopicStatus(list, "a", "published", new Date("2026-05-08"));
    expect(updated.find((x) => x.id === "a")?.status).toBe("published");
    expect(updated.find((x) => x.id === "a")?.last_attempted).toBeDefined();
  });
});
```

- [ ] **Step 2: Implementeer**

```ts
// src/pipeline/state.ts
import type { Topic, TopicStatusT } from "@/config/topics";

export function countPublishedThisIsoWeek(topics: Topic[], now: Date): number {
  const week = isoWeek(now);
  return topics.filter((t) => {
    if (t.status !== "published") return false;
    if (!t.last_attempted) return false;
    return isoWeek(new Date(t.last_attempted)) === week;
  }).length;
}

export function markTopicStatus(
  topics: Topic[],
  topicId: string,
  status: TopicStatusT,
  now: Date,
  patch: Partial<Topic> = {}
): Topic[] {
  return topics.map((t) =>
    t.id === topicId ? { ...t, ...patch, status, last_attempted: now.toISOString() } : t
  );
}

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run test/unit/pipeline/state.test.ts
git add src/pipeline/state.ts test/unit/pipeline/state.test.ts
git commit -m "feat(pipeline): state helpers (iso-week count, status mark)"
```

---

### Task 30: Pipeline orchestrator

Het glue-bestand dat alles aan elkaar knoopt. Lang maar straightforward.

**Files:**
- Create: `src/pipeline/orchestrator.ts`
- Create: `test/integration/orchestrator-mocked.test.ts` (integration test met alle providers gemockt)

- [ ] **Step 1: Implementeer orchestrator**

```ts
// src/pipeline/orchestrator.ts
import { render } from "@react-email/render";
import { loadTenant } from "@/config/loader";
import { loadTopics, saveTopics } from "@/config/topics";
import { selectNextTopic } from "./topicSelector.ts";
import { detectCannibalization } from "./cannibalization.ts";
import { fetchSitemapEntries } from "./sitemap.ts";
import { computeDeterministicRubricSignals } from "./rubric.ts";
import { computeRunCost, type UsageEntry } from "./costTracker.ts";
import { countPublishedThisIsoWeek, markTopicStatus } from "./state.ts";
import { createProviderRegistry } from "@/llm/client";
import { runResearcher } from "@/agents/researcher";
import { runStrategist } from "@/agents/strategist";
import { runWriter } from "@/agents/writer";
import { runSeoEditor } from "@/agents/seoEditor";
import { runFactChecker } from "@/agents/factChecker";
import { runQualityJudge } from "@/agents/qualityJudge";
import { runImagePrompter } from "@/agents/imagePrompter";
import { generateBlogImage } from "@/image";
import { createWordpressClient } from "@/wordpress/client";
import { uploadMedia } from "@/wordpress/media";
import { createDraftPost, buildEditUrl } from "@/wordpress/posts";
import { setRankMathMeta } from "@/wordpress/rankMath";
import { sendEmail } from "@/email/resend";
import { Success } from "@/email/templates/Success";
import { Reject } from "@/email/templates/Reject";
import { CapReached } from "@/email/templates/CapReached";
import { ErrorMail } from "@/email/templates/Error";

export interface OrchestratorOpts {
  tenantSlug: string;
  baseDir?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

export async function runPipeline(opts: OrchestratorOpts): Promise<void> {
  const env = opts.env ?? process.env;
  const baseDir = opts.baseDir ?? "tenants";
  const now = opts.now ?? new Date();

  const tenant = await loadTenant(opts.tenantSlug, baseDir);
  let topics = await loadTopics(opts.tenantSlug, baseDir);

  const next = selectNextTopic(topics, now);
  if (!next) {
    await sendErrorEmail(env, tenant, now, "topic-selector", "Topic queue is leeg.");
    return;
  }

  const usage: UsageEntry[] = [];
  const stage = (s: string) => s;
  let currentStage = stage("init");

  try {
    // 1. Sitemap + cannibalization check
    currentStage = "sitemap";
    const sitemap = await fetchSitemapEntries(`${tenant.wordpress.base_url}/sitemap.xml`);
    const cann = detectCannibalization({
      targetKeyword: next.target_keyword,
      existingSlugs: sitemap.map((e) => e.slug),
      existingTitles: sitemap.map((e) => e.slug.replace(/-/g, " ")),
    });
    if (cann.isCannibalized) {
      topics = markTopicStatus(topics, next.id, "cannibalization_skipped", now, {
        reject_reason: cann.reason,
      });
      await saveTopics(topics, opts.tenantSlug, baseDir);
      return;
    }

    // 2. Pipeline-agents
    const providers = createProviderRegistry(env);
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    currentStage = "researcher";
    const research = await runResearcher(
      {
        target_keyword: next.target_keyword,
        topic_title: next.title,
        pillar: next.pillar,
        existing_site_urls: sitemap.map((e) => e.url),
      },
      { provider: providers.get("gemini"), sleepImpl: sleep }
    );
    usage.push({ provider: "gemini", model: research.raw.model, inputTokens: research.raw.inputTokens, outputTokens: research.raw.outputTokens });

    currentStage = "strategist";
    const outline = await runStrategist(
      { research: research.parsed, brand_voice: tenant.brand.voice, target_keyword: next.target_keyword },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    usage.push({ provider: "anthropic", model: outline.raw.model, inputTokens: outline.raw.inputTokens, outputTokens: outline.raw.outputTokens });

    currentStage = "writer";
    const writer = await runWriter(
      {
        outline: outline.parsed.outline,
        brand_voice: tenant.brand.voice,
        ban_list: tenant.brand.ban_list,
        contrarian_hint: outline.parsed.contrarian_opinion_hint,
      },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    usage.push({ provider: "anthropic", model: "claude-sonnet-4-6", inputTokens: writer.totalInputTokens, outputTokens: writer.totalOutputTokens });

    currentStage = "seoEditor";
    const seo = await runSeoEditor(
      {
        draft_html: writer.parsed.draft_html,
        target_keyword: next.target_keyword,
        internal_links_target_list: outline.parsed.outline.internal_links_to_inject,
        ban_list: tenant.brand.ban_list,
      },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    usage.push({ provider: "anthropic", model: seo.raw.model, inputTokens: seo.raw.inputTokens, outputTokens: seo.raw.outputTokens });

    currentStage = "factChecker";
    const fc = await runFactChecker(
      { edited_html: seo.parsed.edited_html, key_facts: research.parsed.key_facts },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    usage.push({ provider: "anthropic", model: fc.raw.model, inputTokens: fc.raw.inputTokens, outputTokens: fc.raw.outputTokens });

    // 3. Deterministic rubric signals
    const signals = computeDeterministicRubricSignals({
      html: seo.parsed.edited_html,
      banList: tenant.brand.ban_list,
      targetKeyword: next.target_keyword,
      internalUrls: outline.parsed.outline.internal_links_to_inject.map((l) => l.url),
    });

    // 4. Quality Judge
    currentStage = "qualityJudge";
    const judge = await runQualityJudge(
      {
        edited_html: seo.parsed.edited_html,
        target_keyword: next.target_keyword,
        deterministic_signals: signals,
        fact_check_verdict: fc.parsed.verdict,
        fabricated_claims_count: fc.parsed.fabricated_claims.length,
      },
      { provider: providers.get("anthropic"), sleepImpl: sleep }
    );
    usage.push({ provider: "anthropic", model: judge.raw.model, inputTokens: judge.raw.inputTokens, outputTokens: judge.raw.outputTokens });

    // 5. Branch on verdict
    if (judge.parsed.verdict === "NO-GO") {
      const html = await render(Reject({
        title: outline.parsed.outline.h1_suggestion,
        weightedTotal: judge.parsed.weighted_total,
        scoreBreakdown: judge.parsed.scores,
        hardFails: judge.parsed.hard_fails,
        reasoning: judge.parsed.reasoning,
        improvementSuggestions: judge.parsed.improvement_suggestions,
      }));
      await sendEmail({
        apiKey: requireEnv(env, "RESEND_API_KEY"),
        from: tenant.email.from,
        to: tenant.email.to,
        replyTo: tenant.email.reply_to,
        subject: `[${tenant.brand.name}] Reject: ${outline.parsed.outline.h1_suggestion} — score ${judge.parsed.weighted_total.toFixed(1)}`,
        html,
        attachments: [
          { filename: "draft.html", content: Buffer.from(seo.parsed.edited_html, "utf-8") },
          { filename: "outline.json", content: Buffer.from(JSON.stringify(outline.parsed, null, 2), "utf-8") },
        ],
      });
      topics = markTopicStatus(topics, next.id, "rejected", now, {
        reject_reason: judge.parsed.hard_fails.join("; ") || "score < threshold",
        retry_after: new Date(now.getTime() + 7 * 86400_000).toISOString(),
      });
      await saveTopics(topics, opts.tenantSlug, baseDir);
      return;
    }

    // 6. Weekly cap check
    const publishedThisWeek = countPublishedThisIsoWeek(topics, now);
    if (publishedThisWeek >= tenant.max_posts_per_week_published) {
      const html = await render(CapReached({
        title: outline.parsed.outline.h1_suggestion,
        weightedTotal: judge.parsed.weighted_total,
        weeklyCap: tenant.max_posts_per_week_published,
        publishedThisWeek,
      }));
      await sendEmail({
        apiKey: requireEnv(env, "RESEND_API_KEY"),
        from: tenant.email.from, to: tenant.email.to, replyTo: tenant.email.reply_to,
        subject: `[${tenant.brand.name}] Cap bereikt — draft bewaard: ${outline.parsed.outline.h1_suggestion}`,
        html,
        attachments: [{ filename: "draft.html", content: Buffer.from(seo.parsed.edited_html, "utf-8") }],
      });
      topics = markTopicStatus(topics, next.id, "cap_deferred", now, {
        retry_after: nextMondayIso(now),
      });
      await saveTopics(topics, opts.tenantSlug, baseDir);
      return;
    }

    // 7. Image
    currentStage = "imagePrompter";
    const ip = await runImagePrompter(
      { title: outline.parsed.outline.h1_suggestion, tldr: outline.parsed.outline.tldr_one_liner, brand_style: "blue corporate editorial" },
      { provider: providers.get("groq"), sleepImpl: sleep }
    );
    usage.push({ provider: "groq", model: ip.raw.model, inputTokens: ip.raw.inputTokens, outputTokens: ip.raw.outputTokens });

    currentStage = "imageGen";
    const image = await generateBlogImage(
      { prompt: ip.parsed.prompt, negative_prompt: ip.parsed.negative_prompt },
      {
        FAL_API_KEY: requireEnv(env, "FAL_API_KEY"),
        CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
        CF_API_TOKEN: env.CF_API_TOKEN,
      }
    );

    // 8. Publish to WordPress
    currentStage = "wordpress";
    const wp = createWordpressClient({
      baseUrl: tenant.wordpress.base_url,
      user: requireEnv(env, tenant.wordpress.user_secret_ref),
      appPassword: requireEnv(env, tenant.wordpress.app_password_secret_ref),
    });
    const media = await uploadMedia(wp, {
      bytes: image.bytes,
      contentType: image.contentType,
      filename: `${seo.parsed.slug}.png`,
      altText: ip.parsed.alt_text_nl,
    });
    const post = await createDraftPost(wp, {
      title: outline.parsed.outline.h1_suggestion,
      content: seo.parsed.edited_html,
      slug: seo.parsed.slug,
      excerpt: outline.parsed.outline.tldr_one_liner,
      featuredMediaId: media.id,
      categories: [],
      tags: [],
    });
    await setRankMathMeta(wp, post.id, {
      rank_math_title: seo.parsed.meta_title,
      rank_math_description: seo.parsed.meta_description,
      rank_math_focus_keyword: next.target_keyword,
      rank_math_canonical_url: `${tenant.wordpress.base_url}/${seo.parsed.slug}/`,
    });

    // 9. Success email
    currentStage = "email";
    const editUrl = buildEditUrl(tenant.wordpress.base_url, post.id);
    const html = await render(Success({
      title: outline.parsed.outline.h1_suggestion,
      weightedTotal: judge.parsed.weighted_total,
      scoreBreakdown: judge.parsed.scores,
      tldr: outline.parsed.outline.tldr_one_liner,
      imageUrl: media.source_url,
      editUrl,
      previewUrl: post.link,
      targetKeyword: next.target_keyword,
      internalLinksUsed: outline.parsed.outline.internal_links_to_inject,
    }));
    await sendEmail({
      apiKey: requireEnv(env, "RESEND_API_KEY"),
      from: tenant.email.from, to: tenant.email.to, replyTo: tenant.email.reply_to,
      subject: `[${tenant.brand.name}] Concept klaar: ${outline.parsed.outline.h1_suggestion} — score ${judge.parsed.weighted_total.toFixed(1)}`,
      html,
    });

    // 10. Mark topic as published
    topics = markTopicStatus(topics, next.id, "published", now);
    await saveTopics(topics, opts.tenantSlug, baseDir);

    // 11. Cost log
    const cost = computeRunCost(usage);
    console.log(JSON.stringify({ stage: "complete", topicId: next.id, postId: post.id, costUsd: cost.totalUsd, score: judge.parsed.weighted_total }));

  } catch (err) {
    await sendErrorEmail(env, tenant, now, currentStage, (err as Error).message);
    throw err;
  }
}

async function sendErrorEmail(
  env: NodeJS.ProcessEnv,
  tenant: Awaited<ReturnType<typeof loadTenant>>,
  now: Date,
  stage: string,
  message: string
): Promise<void> {
  try {
    const html = await render(ErrorMail({
      date: now.toISOString().slice(0, 10),
      stage,
      message,
      runUrl: env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
        ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
        : undefined,
    }));
    await sendEmail({
      apiKey: env.RESEND_API_KEY ?? "",
      from: tenant.email.from, to: tenant.email.to, replyTo: tenant.email.reply_to,
      subject: `[${tenant.brand.name}] Pipeline-fout op ${now.toISOString().slice(0, 10)}`,
      html,
    });
  } catch {
    // niets we kunnen doen
  }
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function nextMondayIso(d: Date): string {
  const next = new Date(d);
  const dow = next.getUTCDay();
  const diff = (8 - dow) % 7 || 7;
  next.setUTCDate(next.getUTCDate() + diff);
  next.setUTCHours(4, 15, 0, 0);
  return next.toISOString();
}

// Entry point voor `tsx src/pipeline/orchestrator.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  if (!tenantArg) throw new Error("Usage: orchestrator.ts --tenant=<slug>");
  const slug = tenantArg.split("=")[1]!;
  runPipeline({ tenantSlug: slug }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Integration test (alle externals gemockt, happy path)**

```ts
// test/integration/orchestrator-mocked.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("@/llm/client", async () => {
  const actual = await vi.importActual<typeof import("@/llm/client")>("@/llm/client");
  return {
    ...actual,
    createProviderRegistry: () => ({
      get: () => ({
        name: "anthropic",
        call: vi.fn().mockResolvedValueOnce({ /* researcher */
          text: JSON.stringify({
            fan_out_subqueries: ["q1","q2","q3"],
            key_entities: ["e1","e2","e3"],
            internal_link_targets: [],
            external_authority_sources: [{ url: "https://rvo.nl", title: "RVO", why_authoritative: "" }],
            key_facts: [],
            competitor_serp_summary: "x",
          }),
          inputTokens: 100, outputTokens: 100, model: "gemini-2.5-pro", provider: "gemini",
        })
        // ... etc — vereist heel veel mocking. Voor v1 maak je dit alleen GO-pad.
      }),
    }),
  };
});

// Volledige integratie-test is omvangrijk; voor v1 wordt deze pas in Task 35 echt opgepoetst.
describe("orchestrator integration (placeholder)", () => {
  it.skip("happy path — drukt concept naar WP en stuurt success email", () => {
    // Skipped tot Task 35 (integratie-test bouwen)
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run
git add src/pipeline/orchestrator.ts test/integration/
git commit -m "feat(pipeline): orchestrator (researcher → ... → publish/reject/cap)"
```

---

## Phase 10 — GitHub Actions + secrets docs

### Task 31: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/daily-blog.yml`

- [ ] **Step 1: Schrijf workflow**

```yaml
# .github/workflows/daily-blog.yml
name: Daily blog generator

on:
  schedule:
    - cron: "15 4 * * *"  # 04:15 UTC daily
  workflow_dispatch:
    inputs:
      tenant:
        description: "Tenant slug"
        default: "artifation"
        required: true

permissions:
  contents: write  # om topics.yaml updates te committen

concurrency:
  group: daily-blog-${{ github.event.inputs.tenant || 'artifation' }}
  cancel-in-progress: false

jobs:
  generate:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - run: npm ci

      - name: Run pipeline
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          FAL_API_KEY: ${{ secrets.FAL_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          WP_USER: ${{ secrets.WP_USER }}
          WP_APP_PASSWORD: ${{ secrets.WP_APP_PASSWORD }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
        run: npx tsx src/pipeline/orchestrator.ts --tenant=${{ github.event.inputs.tenant || 'artifation' }}

      - name: Commit topics.yaml updates
        if: success()
        run: |
          git config user.name "blog-bot"
          git config user.email "blog-bot@artifation.nl"
          git add tenants/*/topics.yaml
          git diff --staged --quiet || git commit -m "chore(state): topic queue update from $(date -u +%Y-%m-%dT%H:%MZ)"
          git push

      - name: Upload run log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: run-log-${{ github.run_id }}
          path: data/runs/
          retention-days: 30
          if-no-files-found: ignore
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/daily-blog.yml
git commit -m "ci: daily blog cron workflow"
```

---

### Task 32: README met setup-instructies

**Files:**
- Create: `README.md`

- [ ] **Step 1: Schrijf README**

```markdown
# Artifation Blog Generator

Privé multi-agent SEO blog-generator. Draait op GitHub Actions cron, schrijft NL B2B blogs voor MKB-AI-niche, plaatst als concept in WordPress, mailt preview naar redactie.

## Architectuur
Zie [`docs/superpowers/specs/2026-05-08-seo-blog-generator-design.md`](docs/superpowers/specs/2026-05-08-seo-blog-generator-design.md).

## Setup

### 1. WordPress voorbereiden
1. Maak een dedicated WordPress-user `agent-blog` met rol **Editor**.
2. Genereer een **Application Password** voor die user (Users → Profile → Application Passwords).
3. Installeer de **Rank Math API Manager** plugin (`https://github.com/Devora-AS/rank-math-api-manager`) op artifation.nl. Activeer.

### 2. Domein-DNS voor email
1. Verifieer `artifation.nl` op resend.com.
2. Voeg de DNS-records (DKIM, SPF, return-path) toe bij je domeinhost.
3. Wacht tot Resend "verified" toont.

### 3. API-accounts
- [Anthropic](https://platform.claude.com) — voor Sonnet 4.6, Haiku 4.5, Opus 4.7.
- [Google AI Studio](https://aistudio.google.com) — voor Gemini 2.5 Pro.
- [Groq](https://console.groq.com) — gratis tier voor Llama 3.3.
- [Fal.ai](https://fal.ai) — voor Flux 1.1 Pro Ultra image generation.
- [Resend](https://resend.com) — voor email.
- (Optioneel) [Cloudflare](https://dash.cloudflare.com) — voor Workers AI image fallback.

### 4. GitHub-secrets
Repo Settings → Secrets and variables → Actions → New repository secret:

| Secret | Bron |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic dashboard |
| `GEMINI_API_KEY` | Google AI Studio |
| `GROQ_API_KEY` | Groq console |
| `FAL_API_KEY` | Fal.ai dashboard |
| `RESEND_API_KEY` | Resend dashboard |
| `WP_USER` | `agent-blog` |
| `WP_APP_PASSWORD` | WP Application Password |
| `CF_ACCOUNT_ID` | (optioneel) Cloudflare dashboard |
| `CF_API_TOKEN` | (optioneel) Cloudflare dashboard |

### 5. Lokaal draaien (test)

```bash
npm install
cp .env.example .env  # vul in
npx tsx src/pipeline/orchestrator.ts --tenant=artifation
```

### 6. Een nieuwe tenant toevoegen

1. Kopieer `tenants/artifation/` naar `tenants/<nieuwe-slug>/`.
2. Pas `config.yaml` en `topics.yaml` aan.
3. Voeg tenant-specifieke secrets toe.
4. (Optioneel) Voeg een 2e workflow-job toe voor de nieuwe tenant.

## Tests

```bash
npm test                # alle unit + integration
npm run test:watch      # watch-mode
npm run typecheck       # tsc --noEmit
```

## Kosten
±€0,17 per gepubliceerde post. ±€2-3/maand bij 3 published/week + 4/week reject.
```

- [ ] **Step 2: Schrijf `.env.example`**

```
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
FAL_API_KEY=
RESEND_API_KEY=
WP_USER=agent-blog
WP_APP_PASSWORD=
CF_ACCOUNT_ID=
CF_API_TOKEN=
```

- [ ] **Step 3: Commit**

```bash
git add README.md .env.example
git commit -m "docs: README + .env.example"
```

---

## Phase 11 — Initial Artifation tenant data

### Task 33: Tenant config voor Artifation

**Files:**
- Create: `tenants/artifation/config.yaml`

- [ ] **Step 1: Vul config in**

```yaml
# tenants/artifation/config.yaml
slug: artifation
domain: artifation.nl
language: nl-NL

brand:
  name: Artifation
  voice: |
    Informeel-direct, jij/jouw-vorm. Probleem-eerst (begin met de pijn van de MKB-eigenaar).
    Concrete getallen en ROI-focus boven abstracte beloften. Korte zinnen mixen met langere.
    Geen jargon zonder uitleg, maar engelse AI-termen ("prompt", "agent") zijn OK.
  ban_list:
    - "in conclusion"
    - "to sum up"
    - "tot slot"
    - "samenvattend"
    - "in een wereld waar"
    - "in today's fast-paced"
    - "in de steeds veranderende wereld"
    - "delve"
    - "leverage"
    - "harness the power of"
    - "unlock the potential"
    - "navigate the complexities"
    - "moreover"
    - "furthermore"
    - "additionally"
    - "notably"
    - "it's worth noting"
    - "het is belangrijk om op te merken"
  signature_phrases:
    - "Wij kijken verder dan de hype"
    - "De kortste weg naar een schaalbaar bedrijf"

# TODO: vul in voor productie (zie spec §14 open vragen)
author:
  name: "REPLACE_ME"
  linkedin: "https://linkedin.com/in/REPLACE_ME"
  bio: "REPLACE_ME"
  photo_url: "https://artifation.nl/REPLACE_ME.jpg"

organization:
  legal_name: "Artifation B.V."
  kvk: "REPLACE_ME"
  btw: "REPLACE_ME"
  address: "REPLACE_ME"

wordpress:
  base_url: https://artifation.nl
  user_secret_ref: WP_USER
  app_password_secret_ref: WP_APP_PASSWORD

email:
  from: "blog-bot@artifation.nl"
  to: "algemeen@artifation.nl"
  reply_to: "algemeen@artifation.nl"

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

- [ ] **Step 2: Commit**

```bash
git add tenants/artifation/config.yaml
git commit -m "feat(tenant): artifation config (placeholder author/org)"
```

---

### Task 34: Initiële topic-queue voor Artifation

**Files:**
- Create: `tenants/artifation/topics.yaml`

- [ ] **Step 1: Vul de queue (uit spec §6.3)**

```yaml
# tenants/artifation/topics.yaml
# Pillar A — AI per afdeling (focus eerste 6 weken)
- id: ai-per-afdeling-pillar
  title: "Welke AI past bij welke afdeling? Compleet overzicht voor MKB-bedrijven"
  pillar: ai-per-afdeling
  target_keyword: "AI per afdeling MKB"
  intended_word_count: 3000
  status: queued
  priority: 100
- id: ai-in-hr
  title: "AI in HR: van vacature tot exitgesprek"
  pillar: ai-per-afdeling
  target_keyword: "AI in HR Nederland"
  intended_word_count: 1800
  status: queued
  priority: 90
- id: ai-in-finance
  title: "AI in finance: facturatie, debiteuren, forecasting"
  pillar: ai-per-afdeling
  target_keyword: "AI voor finance MKB"
  intended_word_count: 1800
  status: queued
  priority: 88
- id: ai-in-sales
  title: "AI in sales: lead scoring & follow-up automatisering"
  pillar: ai-per-afdeling
  target_keyword: "AI voor sales MKB"
  intended_word_count: 1800
  status: queued
  priority: 86
- id: ai-in-marketing
  title: "AI in marketing: contentproductie & SEO voor MKB"
  pillar: ai-per-afdeling
  target_keyword: "AI marketing MKB"
  intended_word_count: 1800
  status: queued
  priority: 84
- id: ai-in-inkoop
  title: "AI in inkoop: leveranciersanalyse & contractcheck"
  pillar: ai-per-afdeling
  target_keyword: "AI in inkoop MKB"
  intended_word_count: 1800
  status: queued
  priority: 82
- id: ai-in-customer-service
  title: "AI in customer service: chatbots & e-mail triage"
  pillar: ai-per-afdeling
  target_keyword: "AI klantenservice MKB"
  intended_word_count: 1800
  status: queued
  priority: 80
- id: ai-in-operations
  title: "AI in operations: voorraad & planning"
  pillar: ai-per-afdeling
  target_keyword: "AI in operations MKB"
  intended_word_count: 1800
  status: queued
  priority: 78

# Pillar B — AI Act
- id: ai-act-pillar
  title: "EU AI Act voor MKB: complete gids 2026 (zonder juridische bullshit)"
  pillar: ai-act
  target_keyword: "AI Act MKB"
  intended_word_count: 3000
  status: queued
  priority: 95
- id: ai-register-opzetten
  title: "AI-register opzetten in 1 dag — stappenplan voor MKB"
  pillar: ai-act
  target_keyword: "AI register MKB"
  intended_word_count: 1500
  status: queued
  priority: 75
- id: ai-policy-template
  title: "Hoe schrijf je een AI-policy voor je MKB? (gratis template)"
  pillar: ai-act
  target_keyword: "AI policy MKB"
  intended_word_count: 1500
  status: queued
  priority: 73
- id: ai-geletterdheid-team
  title: "AI-geletterdheid: training voor je team verplicht volgens AI Act"
  pillar: ai-act
  target_keyword: "AI geletterdheid MKB"
  intended_word_count: 1500
  status: queued
  priority: 71
- id: ai-tools-avg-proof
  title: "Welke AI-tools zijn AVG-proof? Lijst voor MKB"
  pillar: ai-act
  target_keyword: "AI tools AVG MKB"
  intended_word_count: 1800
  status: queued
  priority: 69
- id: ai-act-boetes
  title: "AI Act-boetes voor MKB: wat staat er op het spel?"
  pillar: ai-act
  target_keyword: "AI Act boetes MKB"
  intended_word_count: 1500
  status: queued
  priority: 67

# Pillar C — Sector-extensie
- id: ai-voor-accountants
  title: "AI voor accountants: 8 use cases die nu al productiviteit verdubbelen"
  pillar: sector-extensie
  target_keyword: "AI voor accountants Nederland"
  intended_word_count: 1800
  status: queued
  priority: 60
- id: ai-voor-advocaten
  title: "AI voor advocaten en notarissen: kansen, risico's en AI Act-grenzen"
  pillar: sector-extensie
  target_keyword: "AI voor advocaten Nederland"
  intended_word_count: 1800
  status: queued
  priority: 58
- id: ai-voor-horeca
  title: "AI voor horeca: van reserveringen tot voorraadbeheer"
  pillar: sector-extensie
  target_keyword: "AI voor horeca"
  intended_word_count: 1500
  status: queued
  priority: 56
- id: ai-voor-transport
  title: "AI voor transport en logistiek: route, capaciteit, en compliance"
  pillar: sector-extensie
  target_keyword: "AI voor transport en logistiek"
  intended_word_count: 1500
  status: queued
  priority: 54
```

- [ ] **Step 2: Commit**

```bash
git add tenants/artifation/topics.yaml
git commit -m "feat(tenant): initiële topic queue (12 weken, 3 pillars)"
```

---

## Phase 12 — End-to-end verificatie

### Task 35: Volledige integration test (mocked externals, GO-pad + NO-GO-pad)

**Files:**
- Modify: `test/integration/orchestrator-mocked.test.ts`

- [ ] **Step 1: Schrijf de end-to-end test**

```ts
// test/integration/orchestrator-mocked.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Stub WordPress + Resend + Fal.ai voordat orchestrator binnenkomt
const wpCalls: { method: string; path: string; body?: unknown }[] = [];
const emailCalls: { subject: string; html: string }[] = [];

vi.mock("@/wordpress/client", () => ({
  createWordpressClient: () => ({
    get: vi.fn(),
    postJson: vi.fn(async (path: string, body: unknown) => {
      wpCalls.push({ method: "POST", path, body });
      if (path.includes("/posts")) return { id: 99, link: "https://artifation.nl/?p=99" };
      if (path.includes("rank-math-api")) return { ok: true };
      return { id: 99 };
    }),
    postBinary: vi.fn(async (path: string) => {
      wpCalls.push({ method: "POST_BIN", path });
      return { id: 42, source_url: "https://artifation.nl/wp-content/uploads/x.png" };
    }),
  }),
  __esModule: true,
}));

vi.mock("@/email/resend", () => ({
  sendEmail: vi.fn(async (req: any) => {
    emailCalls.push({ subject: req.subject, html: req.html });
    return { id: "msg-1" };
  }),
}));

vi.mock("@/image", () => ({
  generateBlogImage: vi.fn(async () => ({
    url: "https://fal.test/i.png",
    bytes: Buffer.from("img"),
    contentType: "image/png",
    fallbackUsed: false,
  })),
}));

vi.mock("@/pipeline/sitemap", () => ({
  fetchSitemapEntries: vi.fn(async () => [
    { url: "https://artifation.nl/ai-scan/", slug: "ai-scan" },
  ]),
}));

// Mock alle providers via één registry-stub: elk agent-call returneert geldig schema-output
vi.mock("@/llm/client", async () => {
  const actual = await vi.importActual<typeof import("@/llm/client")>("@/llm/client");
  const responses = [
    // researcher
    JSON.stringify({
      fan_out_subqueries: ["q1","q2","q3","q4","q5"],
      key_entities: ["e1","e2","e3","e4"],
      internal_link_targets: [
        { url: "https://artifation.nl/ai-scan/", anchor_suggestion: "AI Scan", why: "tool" },
      ],
      external_authority_sources: [{ url: "https://rvo.nl", title: "RVO", why_authoritative: "" }],
      key_facts: [{ claim: "X", source_url: "https://rvo.nl" }],
      competitor_serp_summary: "x",
    }),
    // strategist
    JSON.stringify({
      outline: {
        h1_suggestion: "AI in HR voor MKB",
        tldr_one_liner: "TLDR.",
        tldr_summary_134_words: "x".repeat(700),
        h2_chunks: Array.from({ length: 5 }, (_, i) => ({
          h2: `H2-${i}`, subquestion_answered: `q${i}`,
          intended_word_count: 150, must_include: ["e1"], h3s: [],
        })),
        internal_links_to_inject: [
          { url: "https://artifation.nl/ai-scan/", anchor: "AI Scan" },
          { url: "https://artifation.nl/contact/", anchor: "neem contact op" },
          { url: "https://artifation.nl/ai-consultancy/", anchor: "consultancy" },
        ],
        external_links_to_cite: ["https://rvo.nl"],
        schema_choices: ["BlogPosting"],
        faq_block: [],
      },
      anchor_distribution: { exact_match_pct: 20, partial_pct: 40, semantic_pct: 40 },
      contrarian_opinion_hint: "x",
    }),
    // writer (1 iter, score >= 7)
    JSON.stringify({
      draft_html: '<div class="tldr">...</div><h2>x</h2>' + "<p>p p p</p>".repeat(200),
      self_score: 8,
      self_critique: "ok",
    }),
    // seoEditor
    JSON.stringify({
      edited_html: '<div class="tldr">...</div><h2>AI in HR</h2><p>' + "AI in HR ".repeat(20) + "word ".repeat(900) + '</p><a href="https://artifation.nl/ai-scan/">AI Scan</a><a href="https://artifation.nl/contact/">contact</a><a href="https://artifation.nl/ai-consultancy/">consultancy</a><p>Plan een /ai-scan/.</p>',
      meta_title: "AI in HR voor MKB | Artifation",
      meta_description: "Hoe AI MKB-HR helpt van vacature tot exit. Praktische stappen, tools en valkuilen. Plan een AI Scan vandaag.",
      slug: "ai-in-hr-mkb",
      alt_texts_per_image_placeholder: ["AI in HR header"],
      fixes_applied: [],
    }),
    // factChecker
    JSON.stringify({
      verified_claims: [{ claim: "X", source_url: "https://rvo.nl" }],
      unverifiable_claims: [], fabricated_claims: [], verdict: "pass",
    }),
    // qualityJudge — GO
    JSON.stringify({
      scores: { semantic_completeness: 9, originality: 8, anti_ai_cliche: 9, fact_check: 10, seo_tech: 9, brand_voice: 9, readability: 8 },
      weighted_total: 8.7, hard_fails: [], verdict: "GO", reasoning: "ok", improvement_suggestions: [],
    }),
    // imagePrompter
    JSON.stringify({
      prompt: "editorial blue corporate abstract",
      negative_prompt: "people, text",
      alt_text_nl: "Visualisatie van AI in HR voor MKB",
    }),
  ];
  let i = 0;
  return {
    ...actual,
    createProviderRegistry: () => ({
      get: () => ({
        name: "anthropic" as const,
        call: vi.fn(async () => ({
          text: responses[i++]!,
          inputTokens: 100,
          outputTokens: 100,
          model: "claude-sonnet-4-6",
          provider: "anthropic" as const,
        })),
      }),
    }),
  };
});

import { runPipeline } from "@/pipeline/orchestrator";

describe("orchestrator integration — happy path", () => {
  beforeEach(() => {
    wpCalls.length = 0;
    emailCalls.length = 0;
  });

  it("runs end-to-end and posts a draft + sends success email", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "orch-"));
    const tenantDir = path.join(dir, "artifation");
    await mkdir(tenantDir, { recursive: true });

    // minimal tenant config
    await writeFile(path.join(tenantDir, "config.yaml"), `
slug: artifation
domain: artifation.nl
language: nl-NL
brand: { name: Artifation, voice: x, ban_list: [], signature_phrases: [] }
author: { name: A, linkedin: https://linkedin.com/in/a, bio: x, photo_url: https://x.test/p.png }
organization: { legal_name: Artifation BV, kvk: "1", btw: "1", address: "x" }
wordpress: { base_url: https://artifation.nl, user_secret_ref: WP_USER, app_password_secret_ref: WP_APP_PASSWORD }
email: { from: a@x.test, to: b@x.test, reply_to: b@x.test }
pillars:
  - { id: ai-per-afdeling, weight: 1.0 }
quality_threshold: 8.0
max_posts_per_week_published: 4
`);

    await writeFile(path.join(tenantDir, "topics.yaml"), `
- id: ai-in-hr
  title: AI in HR
  pillar: ai-per-afdeling
  target_keyword: AI in HR
  intended_word_count: 1500
  status: queued
  priority: 1
`);

    await runPipeline({
      tenantSlug: "artifation",
      baseDir: dir,
      env: {
        ANTHROPIC_API_KEY: "x", GEMINI_API_KEY: "x", GROQ_API_KEY: "x",
        FAL_API_KEY: "x", RESEND_API_KEY: "x",
        WP_USER: "u", WP_APP_PASSWORD: "p",
      } as NodeJS.ProcessEnv,
      now: new Date("2026-05-08T04:15:00Z"),
    });

    // Verifieer: draft post aangemaakt
    const postCall = wpCalls.find((c) => c.path === "/wp-json/wp/v2/posts");
    expect(postCall).toBeDefined();
    expect((postCall!.body as any).status).toBe("draft");

    // Verifieer: rank math meta gezet
    const metaCall = wpCalls.find((c) => c.path.includes("rank-math-api"));
    expect(metaCall).toBeDefined();

    // Verifieer: media upload
    expect(wpCalls.some((c) => c.method === "POST_BIN")).toBe(true);

    // Verifieer: success email verstuurd
    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0]!.subject).toMatch(/Concept klaar/);

    // Verifieer: topic gemarkeerd als published
    const topicsAfter = await readFile(path.join(tenantDir, "topics.yaml"), "utf-8");
    expect(topicsAfter).toContain("status: published");
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run test/integration/orchestrator-mocked.test.ts
```

Verwacht: 1 passed.

- [ ] **Step 3: Run alle tests**

```bash
npm test
```

Verwacht: alles groen.

- [ ] **Step 4: Final commit**

```bash
git add test/integration/orchestrator-mocked.test.ts
git commit -m "test(integration): end-to-end happy path met gemockte externals"
```

---

### Task 36: Manuele live-run verificatie (acceptatie-criteria spec §15)

Geen code-task. Volg deze checklist na merge naar main:

- [ ] **Stap 1: Trigger workflow handmatig via GitHub Actions UI** (`workflow_dispatch`).
- [ ] **Stap 2: Verifieer in WordPress** dat een concept-post is aangemaakt onder Berichten → Concepten, met featured image en correcte Rank Math meta.
- [ ] **Stap 3: Verifieer email** ontvangen bij `algemeen@artifation.nl` met juiste structuur en werkende links.
- [ ] **Stap 4: Test reject-pad** door tijdelijk `quality_threshold` op 9.5 te zetten in config.yaml — verifieer dat reject-email binnenkomt en geen WP-post wordt aangemaakt.
- [ ] **Stap 5: Test queue-leeg** door alle topics op `status: published` te zetten — verifieer dat error-email "queue is leeg" binnenkomt.
- [ ] **Stap 6: Reset config + topics** voor productie.
- [ ] **Stap 7: Acceptatie-criteria spec §15** afvinken — alle 8 punten verificatie.

---

## Self-Review

**Spec coverage check:**

| Spec sectie | Geadresseerd in tasks |
|---|---|
| §1 Doel & context | Task 1, 33, README |
| §3 High-level architectuur | Task 30 (orchestrator) |
| §4 Multi-agent pipeline (10 agents) | Tasks 15-19, 21, 22, 23 (Researcher, Strategist, Writer, SEO Editor, Fact-Checker, Quality Judge, Image Prompter + Image Generator + Publisher in orchestrator + Notifier in email tasks) |
| §4.2 Reflection-loop op Writer | Task 17 |
| §4.3 Originaliteits-requirement | Spec wordt in system-prompts (Task 17 Writer) afgedwongen, plus rubric (Task 21) |
| §5 Quality Judge rubric | Tasks 20 (deterministic) + 21 (LLM-judge) |
| §6.1 Topic-queue | Task 6 |
| §6.2 Cannibalization | Tasks 13 + 14 |
| §6.3 Initiële queue | Task 34 |
| §6.4 Rotation | Task 12 |
| §6.5 Weekly publish-cap | Task 30 (in orchestrator state-flow) |
| §7 Per-post output | Spec via prompts (Tasks 16 Strategist, 17 Writer) + Task 25 (Rank Math) |
| §8 Tech-stack | Tasks 2, 8-11, 23, 24-25, 27 |
| §9 Multi-tenant config | Task 4 (zod) + Task 33 (artifation) |
| §10 Email-flow (4 typen) | Task 26 (templates) + Task 30 (in orchestrator) |
| §11 Failure handling | Task 30 (try/catch + sendErrorEmail), Task 23 (image fallback), Task 10 (LLM retry) |
| §12 Repo-layout | Tasks 1-2 (skeleton), elke vervolgtask vult specifieke files |
| §13 Veiligheid & privacy | Task 1 (private repo), Task 24 (auth), Task 31 (secrets in workflow), Task 32 (README) |
| §14 Open vragen | Task 33 placeholders (REPLACE_ME), Task 36 manuele verificatie |
| §15 Acceptatie-criteria | Task 35 (integration) + Task 36 (manueel) |

**Placeholder scan:** `REPLACE_ME` in `tenants/artifation/config.yaml` is een bewuste placeholder uit spec §14 (auteur-data, KvK, BTW). Geen "TBD" of "TODO implement later" in de tasks zelf. De `it.skip` in Task 30 step 2 is bewust — wordt vervangen door volledige test in Task 35.

**Type consistency:** `runAgent` heeft één signatuur (input-object + optionele sleepImpl) — gebruikt consistent in Tasks 15-22. `LLMProvider` interface ongewijzigd vanaf Task 7. `WordpressClient` interface ongewijzigd vanaf Task 24.

---

## Plan complete

Het plan is opgeslagen in `docs/superpowers/plans/2026-05-08-seo-blog-generator.md`. 36 tasks verdeeld over 12 phases. Iedere task heeft TDD-stappen (failing test → impl → green test → commit).
