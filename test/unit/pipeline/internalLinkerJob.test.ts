import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
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

// Shared mutable state, captured at vi.mock hoist-time via vi.hoisted
const state = vi.hoisted(() => ({
  llmResponse: "" as string,
  llmThrowCount: 0,
  linkerThrowCount: 0,
}));

const DEFAULT_AGENT_OUT = JSON.stringify({
  should_link: true,
  confidence: 0.8,
  anchor_text: "AI in HR",
  anchor_type: "partial",
  target_paragraph_signature: "Veel MKB-bedrijven worstelen met AI in HR-processen en wat",
  rewritten_paragraph_html:
    '<p>Veel MKB-bedrijven worstelen met AI in HR-processen en wat dat in de praktijk betekent. Lees onze diepte-analyse: <a href="https://artifation.nl/ai-in-hr-mkb/">AI in HR</a>.</p>',
  rationale: "x",
});

const MISMATCH_AGENT_OUT = JSON.stringify({
  should_link: true,
  confidence: 0.8,
  anchor_text: "AI in HR",
  anchor_type: "partial",
  target_paragraph_signature: "DEZE BESTAAT NIET IN DE OUDE POST_____",
  rewritten_paragraph_html:
    '<p>DEZE BESTAAT NIET IN DE OUDE POST_____. Lees onze diepte-analyse: <a href="https://artifation.nl/ai-in-hr-mkb/">AI in HR</a>.</p>',
  rationale: "x",
});

vi.mock("@/llm/client", async () => {
  const actual = await vi.importActual<typeof import("@/llm/client")>("@/llm/client");
  return {
    ...actual,
    createProviderRegistry: () => ({
      has: () => true,
      get: () => ({
        name: "anthropic" as const,
        call: vi.fn(async () => {
          if (state.llmThrowCount > 0) {
            state.llmThrowCount--;
            throw new Error("LLM down");
          }
          return {
            text: state.llmResponse,
            inputTokens: 1000,
            outputTokens: 200,
            model: "claude-sonnet-4-6",
            provider: "anthropic" as const,
          };
        }),
      }),
    }),
  };
});

vi.mock("@/agents/internalLinker", async () => {
  const actual = await vi.importActual<typeof import("@/agents/internalLinker")>(
    "@/agents/internalLinker"
  );
  return {
    ...actual,
    runInternalLinker: vi.fn(async () => {
      if (state.linkerThrowCount > 0) {
        state.linkerThrowCount--;
        throw new Error("LLM down");
      }
      const parsed = JSON.parse(state.llmResponse);
      return { parsed, raw: { text: state.llmResponse, inputTokens: 10, outputTokens: 10, model: "x", provider: "anthropic" } };
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
  beforeEach(() => {
    (mockWp.get as ReturnType<typeof vi.fn>).mockReset();
    (mockWp.patchJson as ReturnType<typeof vi.fn>).mockReset();
    (mockWp.patchJson as ReturnType<typeof vi.fn>).mockImplementation(
      async () => ({ id: 42, link: "https://artifation.nl/?p=42" })
    );
    state.llmResponse = DEFAULT_AGENT_OUT;
    state.llmThrowCount = 0;
    state.linkerThrowCount = 0;
  });

  it("identifies new posts and links them into older candidates (happy path)", async () => {
    const baseDir = await fixtureDir();

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

    await runInternalLinkerJob({
      tenantSlug: "artifation",
      baseDir,
      env: ENV,
      now: new Date(),
    });

    expect(mockWp.patchJson).not.toHaveBeenCalled();
  });

  it("skips PATCH when agent returns a signature that does not match any paragraph (signature mismatch)", async () => {
    const baseDir = await fixtureDir();

    state.llmResponse = MISMATCH_AGENT_OUT;

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

    expect(mockWp.patchJson).not.toHaveBeenCalled();
  });

  it("Test 5: max_links_per_run cap is honored", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ilj-"));
    const tenantDir = path.join(dir, "artifation");
    await mkdir(tenantDir, { recursive: true });
    // Set max_links_per_run: 1
    await writeFile(
      path.join(tenantDir, "config.yaml"),
      TENANT_CONFIG_YAML.replace("max_links_per_run: 5", "max_links_per_run: 1")
    );
    // Topics yaml with the new post (id=99) mapped, plus two old posts needing separate topic entries
    const topicsYaml = `
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
- id: oudere-post-1
  title: Oude topic 1
  pillar: ai-per-afdeling
  target_keyword: oudere onderwerp
  intended_word_count: 1500
  status: published
  priority: 5
  last_attempted: "2026-04-01T10:00:00Z"
  wp_post_id: 42
  wp_post_url: https://artifation.nl/oudere-post-1/
- id: oudere-post-2
  title: Oude topic 2
  pillar: ai-per-afdeling
  target_keyword: oudere onderwerp 2
  intended_word_count: 1500
  status: published
  priority: 6
  last_attempted: "2026-04-01T10:00:00Z"
  wp_post_id: 43
  wp_post_url: https://artifation.nl/oudere-post-2/
`;
    await writeFile(path.join(tenantDir, "topics.yaml"), topicsYaml);

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
            id: 42, slug: "oudere-post-1",
            link: "https://artifation.nl/oudere-post-1/",
            title: { rendered: "Oude post 1" },
            content: {
              rendered:
                "<p>Veel MKB-bedrijven worstelen met AI in HR-processen en wat dat in de praktijk betekent.</p>",
            },
            date: new Date(Date.now() - 60 * 86400000).toISOString(),
          },
          {
            id: 43, slug: "oudere-post-2",
            link: "https://artifation.nl/oudere-post-2/",
            title: { rendered: "Oude post 2" },
            content: {
              rendered:
                "<p>Veel MKB-bedrijven worstelen met AI in HR-processen en wat dat in de praktijk betekent.</p>",
            },
            date: new Date(Date.now() - 60 * 86400000).toISOString(),
          },
        ];
      }
      throw new Error(`unmocked get: ${url}`);
    });

    await runInternalLinkerJob({
      tenantSlug: "artifation",
      baseDir: dir,
      env: ENV,
      now: new Date(),
    });

    // Only 1 patch despite 2 matching old posts, because max_links_per_run: 1
    expect(mockWp.patchJson).toHaveBeenCalledTimes(1);
  });

  it("Test 6: exclude_post_ids skips the excluded old post", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ilj-"));
    const tenantDir = path.join(dir, "artifation");
    await mkdir(tenantDir, { recursive: true });
    // Exclude post id 42
    await writeFile(
      path.join(tenantDir, "config.yaml"),
      TENANT_CONFIG_YAML.replace("exclude_post_ids: []", "exclude_post_ids: [42]")
    );
    await writeFile(path.join(tenantDir, "topics.yaml"), TOPICS_YAML);

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
                "<p>Veel MKB-bedrijven worstelen met AI in HR-processen en wat dat in de praktijk betekent.</p>",
            },
            date: new Date(Date.now() - 60 * 86400000).toISOString(),
          },
        ];
      }
      throw new Error(`unmocked get: ${url}`);
    });

    await runInternalLinkerJob({
      tenantSlug: "artifation",
      baseDir: dir,
      env: ENV,
      now: new Date(),
    });

    // Post 42 is excluded as a source, so no patch should happen
    expect(mockWp.patchJson).not.toHaveBeenCalled();
  });

  it("Test 7: LLM error on first call is isolated; second pair is processed normally", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ilj-"));
    const tenantDir = path.join(dir, "artifation");
    await mkdir(tenantDir, { recursive: true });
    await writeFile(path.join(tenantDir, "config.yaml"), TENANT_CONFIG_YAML);
    // Two old posts, two new posts mapped via topics
    const topicsYaml = `
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
- id: oudere-post-1
  title: Oude topic 1
  pillar: ai-per-afdeling
  target_keyword: oudere onderwerp
  intended_word_count: 1500
  status: published
  priority: 5
  last_attempted: "2026-04-01T10:00:00Z"
  wp_post_id: 42
  wp_post_url: https://artifation.nl/oudere-post-1/
- id: oudere-post-2
  title: Oude topic 2
  pillar: ai-per-afdeling
  target_keyword: oudere onderwerp 2
  intended_word_count: 1500
  status: published
  priority: 6
  last_attempted: "2026-04-01T10:00:00Z"
  wp_post_id: 43
  wp_post_url: https://artifation.nl/oudere-post-2/
`;
    await writeFile(path.join(tenantDir, "topics.yaml"), topicsYaml);

    // runInternalLinker throws on first call (fault-isolated), succeeds on second
    state.linkerThrowCount = 1;

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
            id: 42, slug: "oudere-post-1",
            link: "https://artifation.nl/oudere-post-1/",
            title: { rendered: "Oude post 1" },
            content: {
              rendered:
                "<p>Veel MKB-bedrijven worstelen met AI in HR-processen en wat dat in de praktijk betekent.</p>",
            },
            date: new Date(Date.now() - 60 * 86400000).toISOString(),
          },
          {
            id: 43, slug: "oudere-post-2",
            link: "https://artifation.nl/oudere-post-2/",
            title: { rendered: "Oude post 2" },
            content: {
              rendered:
                "<p>Veel MKB-bedrijven worstelen met AI in HR-processen en wat dat in de praktijk betekent.</p>",
            },
            date: new Date(Date.now() - 60 * 86400000).toISOString(),
          },
        ];
      }
      throw new Error(`unmocked get: ${url}`);
    });

    await runInternalLinkerJob({
      tenantSlug: "artifation",
      baseDir: dir,
      env: ENV,
      now: new Date(),
    });

    // First old post (id=42) agent call threw → skipped. Second (id=43) succeeded → 1 patch.
    expect(mockWp.patchJson).toHaveBeenCalledTimes(1);
  });

  it("Test 8: WP updatePostContent error on first call is isolated; second succeeds", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ilj-"));
    const tenantDir = path.join(dir, "artifation");
    await mkdir(tenantDir, { recursive: true });
    await writeFile(path.join(tenantDir, "config.yaml"), TENANT_CONFIG_YAML);
    const topicsYaml = `
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
- id: oudere-post-1
  title: Oude topic 1
  pillar: ai-per-afdeling
  target_keyword: oudere onderwerp
  intended_word_count: 1500
  status: published
  priority: 5
  last_attempted: "2026-04-01T10:00:00Z"
  wp_post_id: 42
  wp_post_url: https://artifation.nl/oudere-post-1/
- id: oudere-post-2
  title: Oude topic 2
  pillar: ai-per-afdeling
  target_keyword: oudere onderwerp 2
  intended_word_count: 1500
  status: published
  priority: 6
  last_attempted: "2026-04-01T10:00:00Z"
  wp_post_id: 43
  wp_post_url: https://artifation.nl/oudere-post-2/
`;
    await writeFile(path.join(tenantDir, "topics.yaml"), topicsYaml);

    // patchJson throws on first call, succeeds on second
    (mockWp.patchJson as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error("WP 401");
    });
    // subsequent calls use the default implementation from beforeEach reset — but since we already
    // reset and re-set in beforeEach and then overrode with mockImplementationOnce, subsequent calls
    // fall through to the mockImplementationOnce queue exhausted state. We need to add a second impl:
    (mockWp.patchJson as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => ({ id: 43, link: "https://artifation.nl/?p=43" })
    );

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
            id: 42, slug: "oudere-post-1",
            link: "https://artifation.nl/oudere-post-1/",
            title: { rendered: "Oude post 1" },
            content: {
              rendered:
                "<p>Veel MKB-bedrijven worstelen met AI in HR-processen en wat dat in de praktijk betekent.</p>",
            },
            date: new Date(Date.now() - 60 * 86400000).toISOString(),
          },
          {
            id: 43, slug: "oudere-post-2",
            link: "https://artifation.nl/oudere-post-2/",
            title: { rendered: "Oude post 2" },
            content: {
              rendered:
                "<p>Veel MKB-bedrijven worstelen met AI in HR-processen en wat dat in de praktijk betekent.</p>",
            },
            date: new Date(Date.now() - 60 * 86400000).toISOString(),
          },
        ];
      }
      throw new Error(`unmocked get: ${url}`);
    });

    await runInternalLinkerJob({
      tenantSlug: "artifation",
      baseDir: dir,
      env: ENV,
      now: new Date(),
    });

    // First patch threw (WP 401) → caught → second old post processed → second patch succeeded
    // Total patchJson calls: 2 (first threw, second succeeded)
    expect(mockWp.patchJson).toHaveBeenCalledTimes(2);
  });
});
