import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WordpressClient } from "@/wordpress/client";

// Shared mutable state, captured at vi.mock hoist-time via vi.hoisted
const state = vi.hoisted(() => ({
  wpCalls: [] as { method: string; path: string; body?: unknown }[],
  emailCalls: [] as { subject: string; html: string }[],
  llmResponses: [] as string[],
  llmIndex: 0,
}));

vi.mock("@/wordpress/client", () => ({
  createWordpressClient: () =>
    ({
      get: vi.fn(),
      postJson: vi.fn(async (p: string, body: unknown) => {
        state.wpCalls.push({ method: "POST", path: p, body });
        if (p === "/wp-json/wp/v2/posts") return { id: 99, link: "https://artifation.nl/?p=99" };
        if (p.includes("rank-math-api")) return { ok: true };
        return { id: 99 };
      }),
      postBinary: vi.fn(async (p: string) => {
        state.wpCalls.push({ method: "POST_BIN", path: p });
        return { id: 42, source_url: "https://artifation.nl/wp-content/uploads/x.png" };
      }),
    }) as unknown as WordpressClient,
}));

vi.mock("@/email/resend", () => ({
  sendEmail: vi.fn(async (req: { subject: string; html: string }) => {
    state.emailCalls.push({ subject: req.subject, html: req.html });
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

vi.mock("@/llm/client", async () => {
  const actual = await vi.importActual<typeof import("@/llm/client")>("@/llm/client");
  return {
    ...actual,
    createProviderRegistry: () => ({
      get: () => ({
        name: "anthropic" as const,
        call: vi.fn(async () => {
          const text = state.llmResponses[state.llmIndex++];
          if (text === undefined) {
            throw new Error(
              `LLM mock exhausted at index ${state.llmIndex - 1} (have ${state.llmResponses.length} responses)`
            );
          }
          return {
            text,
            inputTokens: 100,
            outputTokens: 100,
            model: "claude-sonnet-4-6",
            provider: "anthropic" as const,
          };
        }),
      }),
    }),
  };
});

import { runPipeline } from "@/pipeline/orchestrator";

// --- Response builders ----------------------------------------------------

const RESEARCHER_RESPONSE = JSON.stringify({
  fan_out_subqueries: ["q1", "q2", "q3", "q4", "q5"],
  key_entities: ["e1", "e2", "e3", "e4"],
  internal_link_targets: [
    { url: "https://artifation.nl/ai-scan/", anchor_suggestion: "AI Scan", why: "tool" },
  ],
  external_authority_sources: [
    { url: "https://rvo.nl", title: "RVO", why_authoritative: "overheid" },
  ],
  key_facts: [{ claim: "X", source_url: "https://rvo.nl" }],
  competitor_serp_summary: "x",
});

const STRATEGIST_RESPONSE = JSON.stringify({
  outline: {
    h1_suggestion: "AI in HR voor MKB",
    tldr_one_liner: "TLDR.",
    tldr_direct_answer_40_60w: "AI in HR helpt MKB-bedrijven het volledige proces van werving tot exit te versnellen: slimmer screenen, minder administratieve last, betere planning en datagedreven beslissingen. AVG-proof en transparant ingezet levert dit direct tijdwinst op voor HR-teams die anders verzuipen in handmatig CV-werk en spreadsheets.",
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
      { url: "https://artifation.nl/ai-consultancy/", anchor: "consultancy" },
    ],
    external_links_to_cite: ["https://rvo.nl"],
    schema_choices: ["BlogPosting"],
    faq_block: [],
  },
  anchor_distribution: { exact_match_pct: 20, partial_pct: 40, semantic_pct: 40 },
  contrarian_opinion_hint: "x",
});

const WRITER_RESPONSE = JSON.stringify({
  draft_html: '<div class="tldr">...</div><h2>x</h2>' + "<p>p p p</p>".repeat(200),
  self_score: 8,
  self_critique: "ok",
});

const SEO_EDITOR_RESPONSE = JSON.stringify({
  edited_html:
    '<div class="tldr">...</div><h2>AI in HR</h2><p>' +
    "AI in HR ".repeat(20) +
    "word ".repeat(900) +
    '</p><a href="https://artifation.nl/ai-scan/">AI Scan</a><a href="https://artifation.nl/contact/">contact</a><a href="https://artifation.nl/ai-consultancy/">consultancy</a><p>Plan een /ai-scan/.</p>',
  meta_title: "AI in HR voor MKB | Artifation",
  meta_description:
    "Hoe AI MKB-HR helpt van vacature tot exit. Praktische stappen, tools en valkuilen. Plan een AI Scan vandaag.",
  slug: "ai-in-hr-mkb",
  alt_texts_per_image_placeholder: ["AI in HR header"],
  fixes_applied: [],
});

const FACT_CHECKER_RESPONSE = JSON.stringify({
  verified_claims: [{ claim: "X", source_url: "https://rvo.nl" }],
  unverifiable_claims: [],
  fabricated_claims: [],
  verdict: "pass",
});

const QUALITY_JUDGE_GO = JSON.stringify({
  scores: {
    semantic_completeness: 9,
    originality: 8,
    anti_ai_cliche: 9,
    fact_check: 10,
    seo_meta: 9,
    seo_schema: 8,
    brand_voice: 9,
    readability: 8,
  },
  weighted_total: 8.7,
  hard_fails: [],
  verdict: "GO",
  reasoning: "ok",
  improvement_suggestions: [],
});

const QUALITY_JUDGE_NOGO = JSON.stringify({
  scores: {
    semantic_completeness: 5,
    originality: 4,
    anti_ai_cliche: 6,
    fact_check: 7,
    seo_meta: 5,
    seo_schema: 4,
    brand_voice: 5,
    readability: 6,
  },
  weighted_total: 5.4,
  hard_fails: ["banlist_hits>0"],
  verdict: "NO-GO",
  reasoning: "score too low",
  improvement_suggestions: ["rewrite intro"],
});

const IMAGE_PROMPTER_RESPONSE = JSON.stringify({
  prompt: "editorial blue corporate abstract composition",
  negative_prompt: "people, text",
  alt_text_nl: "Visualisatie van AI in HR voor MKB",
});

// --- Fixture helpers ------------------------------------------------------

const TENANT_CONFIG_YAML = `
slug: artifation
domain: artifation.nl
language: nl-NL
brand:
  name: Artifation
  voice: Informeel-direct
  ban_list: []
  signature_phrases: []
author:
  name: A
  linkedin: https://linkedin.com/in/a
  bio: x
  photo_url: https://x.test/p.png
organization:
  legal_name: Artifation BV
  kvk: "1"
  btw: "1"
  address: x
wordpress:
  base_url: https://artifation.nl
  user_secret_ref: WP_USER
  app_password_secret_ref: WP_APP_PASSWORD
email:
  from: a@x.test
  to: b@x.test
  reply_to: b@x.test
pillars:
  - { id: ai-per-afdeling, weight: 1.0 }
quality_threshold: 8.0
max_posts_per_week_published: 4
`;

const TOPICS_YAML_QUEUED = `
- id: ai-in-hr
  title: AI in HR
  pillar: ai-per-afdeling
  target_keyword: AI in HR
  intended_word_count: 1500
  status: queued
  priority: 1
`;

async function createTenantFixture(topicsYaml: string = TOPICS_YAML_QUEUED): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "orch-"));
  const tenantDir = path.join(dir, "artifation");
  await mkdir(tenantDir, { recursive: true });
  await writeFile(path.join(tenantDir, "config.yaml"), TENANT_CONFIG_YAML);
  await writeFile(path.join(tenantDir, "topics.yaml"), topicsYaml);
  return dir;
}

const RUN_ENV = {
  ANTHROPIC_API_KEY: "x",
  GEMINI_API_KEY: "x",
  GROQ_API_KEY: "x",
  FAL_API_KEY: "x",
  RESEND_API_KEY: "x",
  WP_USER: "u",
  WP_APP_PASSWORD: "p",
} as NodeJS.ProcessEnv;

function resetState(): void {
  state.wpCalls.length = 0;
  state.emailCalls.length = 0;
  state.llmResponses.length = 0;
  state.llmIndex = 0;
}

// --- Tests ----------------------------------------------------------------

describe("orchestrator integration — happy path (GO)", () => {
  beforeEach(() => {
    resetState();
    state.llmResponses.push(
      RESEARCHER_RESPONSE,
      STRATEGIST_RESPONSE,
      WRITER_RESPONSE,
      SEO_EDITOR_RESPONSE,
      FACT_CHECKER_RESPONSE,
      QUALITY_JUDGE_GO,
      IMAGE_PROMPTER_RESPONSE
    );
  });

  it("runs end-to-end and posts a draft + sends success email", async () => {
    const dir = await createTenantFixture();

    await runPipeline({
      tenantSlug: "artifation",
      baseDir: dir,
      env: RUN_ENV,
      now: new Date("2026-05-08T04:15:00Z"),
    });

    // Verifieer: draft post aangemaakt
    const postCall = state.wpCalls.find((c) => c.path === "/wp-json/wp/v2/posts");
    expect(postCall).toBeDefined();
    expect((postCall!.body as { status?: string }).status).toBe("draft");

    // Verifieer: rank math meta gezet
    const metaCall = state.wpCalls.find((c) => c.path.includes("rank-math-api"));
    expect(metaCall).toBeDefined();

    // Verifieer: media upload
    expect(state.wpCalls.some((c) => c.method === "POST_BIN")).toBe(true);

    // Verifieer: success email verstuurd
    expect(state.emailCalls).toHaveLength(1);
    expect(state.emailCalls[0]!.subject).toMatch(/Concept klaar/);

    // Verifieer: topic gemarkeerd als published met wp_post_id
    const topicsAfter = await readFile(
      path.join(dir, "artifation", "topics.yaml"),
      "utf-8"
    );
    expect(topicsAfter).toContain("status: published");
    expect(topicsAfter).toContain("wp_post_id: 99");
    expect(topicsAfter).toContain("wp_post_url: https://artifation.nl/?p=99");
  });
});

describe("orchestrator integration — reject path (NO-GO)", () => {
  beforeEach(() => {
    resetState();
    state.llmResponses.push(
      RESEARCHER_RESPONSE,
      STRATEGIST_RESPONSE,
      WRITER_RESPONSE,
      SEO_EDITOR_RESPONSE,
      FACT_CHECKER_RESPONSE,
      QUALITY_JUDGE_NOGO
      // no imagePrompter — pipeline returns before that
    );
  });

  it("sends reject email, marks topic rejected, and does NOT post to WP", async () => {
    const dir = await createTenantFixture();

    await runPipeline({
      tenantSlug: "artifation",
      baseDir: dir,
      env: RUN_ENV,
      now: new Date("2026-05-08T04:15:00Z"),
    });

    // Geen WP-post of media-upload
    expect(state.wpCalls.find((c) => c.path === "/wp-json/wp/v2/posts")).toBeUndefined();
    expect(state.wpCalls.some((c) => c.method === "POST_BIN")).toBe(false);

    // Reject email verstuurd
    expect(state.emailCalls).toHaveLength(1);
    expect(state.emailCalls[0]!.subject).toMatch(/Reject/);

    // Topic gemarkeerd als rejected
    const topicsAfter = await readFile(
      path.join(dir, "artifation", "topics.yaml"),
      "utf-8"
    );
    expect(topicsAfter).toContain("status: rejected");
  });
});

describe("orchestrator integration — cap reached", () => {
  beforeEach(() => {
    resetState();
    state.llmResponses.push(
      RESEARCHER_RESPONSE,
      STRATEGIST_RESPONSE,
      WRITER_RESPONSE,
      SEO_EDITOR_RESPONSE,
      FACT_CHECKER_RESPONSE,
      QUALITY_JUDGE_GO
      // no imagePrompter — cap hit blocks publishing
    );
  });

  it("sends cap email, marks topic cap_deferred, and does NOT post to WP", async () => {
    // 4 reeds gepubliceerd in dezelfde ISO-week (= cap), plus 1 queued
    // ISO-week 19 in 2026: maandag 2026-05-04 .. zondag 2026-05-10
    const lastAttempted = '"2026-05-05T04:15:00.000Z"';
    const topicsYaml = `
- id: prev-1
  title: Vorig 1
  pillar: ai-per-afdeling
  target_keyword: vorig een
  intended_word_count: 1500
  status: published
  priority: 1
  last_attempted: ${lastAttempted}
- id: prev-2
  title: Vorig 2
  pillar: ai-per-afdeling
  target_keyword: vorig twee
  intended_word_count: 1500
  status: published
  priority: 1
  last_attempted: ${lastAttempted}
- id: prev-3
  title: Vorig 3
  pillar: ai-per-afdeling
  target_keyword: vorig drie
  intended_word_count: 1500
  status: published
  priority: 1
  last_attempted: ${lastAttempted}
- id: prev-4
  title: Vorig 4
  pillar: ai-per-afdeling
  target_keyword: vorig vier
  intended_word_count: 1500
  status: published
  priority: 1
  last_attempted: ${lastAttempted}
- id: ai-in-hr
  title: AI in HR
  pillar: ai-per-afdeling
  target_keyword: AI in HR
  intended_word_count: 1500
  status: queued
  priority: 5
`;
    const dir = await createTenantFixture(topicsYaml);

    await runPipeline({
      tenantSlug: "artifation",
      baseDir: dir,
      env: RUN_ENV,
      now: new Date("2026-05-08T04:15:00Z"),
    });

    // Geen WP-post of media-upload
    expect(state.wpCalls.find((c) => c.path === "/wp-json/wp/v2/posts")).toBeUndefined();
    expect(state.wpCalls.some((c) => c.method === "POST_BIN")).toBe(false);

    // Cap email verstuurd
    expect(state.emailCalls).toHaveLength(1);
    expect(state.emailCalls[0]!.subject).toMatch(/Cap bereikt/);

    // Topic gemarkeerd als cap_deferred
    const topicsAfter = await readFile(
      path.join(dir, "artifation", "topics.yaml"),
      "utf-8"
    );
    expect(topicsAfter).toContain("status: cap_deferred");
  });
});
