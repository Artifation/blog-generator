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
const state = vi.hoisted(() => ({ llmResponse: "" as string }));

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
      get: () => ({
        name: "anthropic" as const,
        call: vi.fn(async () => ({
          text: state.llmResponse,
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
  beforeEach(() => {
    (mockWp.get as ReturnType<typeof vi.fn>).mockReset();
    (mockWp.patchJson as ReturnType<typeof vi.fn>).mockReset();
    (mockWp.patchJson as ReturnType<typeof vi.fn>).mockImplementation(
      async () => ({ id: 42, link: "https://artifation.nl/?p=42" })
    );
    state.llmResponse = DEFAULT_AGENT_OUT;
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
});
