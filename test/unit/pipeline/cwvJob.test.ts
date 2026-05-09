import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Mock email
// ---------------------------------------------------------------------------

const emailCalls = vi.hoisted(() => [] as { subject: string; html: string }[]);

vi.mock("@/email/resend", () => ({
  sendEmail: vi.fn(async (req: { subject: string; html: string }) => {
    emailCalls.push({ subject: req.subject, html: req.html });
    return { id: "msg-cwv-1" };
  }),
}));

// ---------------------------------------------------------------------------
// Mock PSI — controlled per test via shared state
// ---------------------------------------------------------------------------

const psiState = vi.hoisted(() => ({
  results: [] as Array<{
    lcp_ms: number;
    inp_ms: number;
    cls: number;
    performance_score: number;
    status?: string;
  }>,
  callIndex: 0,
  shouldThrow: false,
}));

vi.mock("@/integrations/pageSpeedInsights", () => ({
  fetchPsi: vi.fn(async (input: { url: string }) => {
    if (psiState.shouldThrow) throw new Error("PSI timeout");
    const r = psiState.results[psiState.callIndex++];
    if (!r) throw new Error(`PSI mock exhausted at index ${psiState.callIndex - 1}`);
    return {
      url: input.url,
      lcp_ms: r.lcp_ms,
      inp_ms: r.inp_ms,
      cls: r.cls,
      performance_score: r.performance_score,
      fetched_at: new Date().toISOString(),
    };
  }),
  classifyCwv: vi.fn((result: { lcp_ms: number; inp_ms: number; cls: number }) => {
    // Simple passthrough classification matching the real logic
    const lcp = result.lcp_ms < 2500 ? "good" : result.lcp_ms < 4000 ? "needs_improvement" : "poor";
    const inp = result.inp_ms < 200 ? "good" : result.inp_ms < 500 ? "needs_improvement" : "poor";
    const cls = result.cls < 0.1 ? "good" : result.cls < 0.25 ? "needs_improvement" : "poor";
    const statuses = [lcp, inp, cls];
    const overall = statuses.includes("poor")
      ? "poor"
      : statuses.includes("needs_improvement")
      ? "needs_improvement"
      : "good";
    return { lcp, inp, cls, overall };
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { runCwvJob } from "@/pipeline/cwvJob";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_CONFIG_YAML = `
slug: artifation
domain: artifation.nl
language: nl-NL
brand: { name: Artifation, voice: x, ban_list: [], signature_phrases: [] }
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
  cwv_monitoring:
    enabled: true
    alert_on_poor: true
    psi_api_key_secret_ref: PSI_API_KEY
`;

const TENANT_CONFIG_DISABLED_YAML = TENANT_CONFIG_YAML.replace(
  "enabled: true",
  "enabled: false"
);

const TENANT_CONFIG_NO_ALERT_YAML = TENANT_CONFIG_YAML.replace(
  "alert_on_poor: true",
  "alert_on_poor: false"
);

const TOPICS_YAML_WITH_PUBLISHED = `
- id: post-1
  title: Post 1
  pillar: ai-per-afdeling
  target_keyword: AI in HR
  intended_word_count: 1500
  status: published
  priority: 1
  last_attempted: "2026-05-01T10:00:00Z"
  wp_post_id: 10
  wp_post_url: https://artifation.nl/post-1/
- id: post-2
  title: Post 2
  pillar: ai-per-afdeling
  target_keyword: AI tools
  intended_word_count: 1500
  status: published
  priority: 2
  last_attempted: "2026-05-02T10:00:00Z"
  wp_post_id: 11
  wp_post_url: https://artifation.nl/post-2/
- id: post-queued
  title: Queued post
  pillar: ai-per-afdeling
  target_keyword: iets nieuws
  intended_word_count: 1500
  status: queued
  priority: 3
`;

const TOPICS_YAML_NO_URLS = `
- id: post-1
  title: Post 1
  pillar: ai-per-afdeling
  target_keyword: AI in HR
  intended_word_count: 1500
  status: published
  priority: 1
`;

const ENV = {
  RESEND_API_KEY: "resend-x",
  PSI_API_KEY: "psi-x",
  WP_USER: "u",
  WP_APP_PASSWORD: "p",
} as NodeJS.ProcessEnv;

async function fixtureDir(configYaml: string, topicsYaml: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "cwv-"));
  const tenantDir = path.join(dir, "artifation");
  await mkdir(tenantDir, { recursive: true });
  await writeFile(path.join(tenantDir, "config.yaml"), configYaml);
  await writeFile(path.join(tenantDir, "topics.yaml"), topicsYaml);
  return dir;
}

function resetState() {
  emailCalls.length = 0;
  psiState.results.length = 0;
  psiState.callIndex = 0;
  psiState.shouldThrow = false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runCwvJob", () => {
  beforeEach(resetState);

  it("skips when feature is disabled", async () => {
    const dir = await fixtureDir(TENANT_CONFIG_DISABLED_YAML, TOPICS_YAML_WITH_PUBLISHED);
    await runCwvJob({ tenantSlug: "artifation", baseDir: dir, env: ENV });
    expect(emailCalls).toHaveLength(0);
  });

  it("skips when no published posts have wp_post_url", async () => {
    const dir = await fixtureDir(TENANT_CONFIG_YAML, TOPICS_YAML_NO_URLS);
    await runCwvJob({ tenantSlug: "artifation", baseDir: dir, env: ENV });
    expect(emailCalls).toHaveLength(0);
  });

  it("checks all published posts and writes a run log (all good — no alert)", async () => {
    psiState.results.push(
      { lcp_ms: 1500, inp_ms: 100, cls: 0.05, performance_score: 90 },
      { lcp_ms: 2000, inp_ms: 150, cls: 0.08, performance_score: 85 }
    );

    const dir = await fixtureDir(TENANT_CONFIG_YAML, TOPICS_YAML_WITH_PUBLISHED);
    const now = new Date("2026-05-09T06:00:00Z");

    await runCwvJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now });

    // No alert email because all URLs are "good"
    expect(emailCalls).toHaveLength(0);

    // Run log should be written
    const logPath = path.join(dir, "..", "data", "cwv-runs", "artifation", "2026-05-09.json");
    const logRaw = await readFile(logPath, "utf-8");
    const log = JSON.parse(logRaw);
    expect(log.total_checked).toBe(2);
    expect(log.poor_urls).toHaveLength(0);
    expect(log.alert_sent).toBe(false);
  });

  it("sends alert email when ≥1 URL is poor", async () => {
    psiState.results.push(
      { lcp_ms: 5000, inp_ms: 600, cls: 0.30, performance_score: 20 }, // poor
      { lcp_ms: 1500, inp_ms: 100, cls: 0.05, performance_score: 90 }  // good
    );

    const dir = await fixtureDir(TENANT_CONFIG_YAML, TOPICS_YAML_WITH_PUBLISHED);
    const now = new Date("2026-05-09T06:00:00Z");

    await runCwvJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now });

    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0]!.subject).toMatch(/CWV waarschuwing/);
    expect(emailCalls[0]!.subject).toMatch(/1 poor/);

    const logPath = path.join(dir, "..", "data", "cwv-runs", "artifation", "2026-05-09.json");
    const log = JSON.parse(await readFile(logPath, "utf-8"));
    expect(log.poor_urls).toHaveLength(1);
    expect(log.alert_sent).toBe(true);
  });

  it("does not send alert when alert_on_poor is false even if URLs are poor", async () => {
    psiState.results.push(
      { lcp_ms: 5000, inp_ms: 600, cls: 0.30, performance_score: 20 }
    );

    // Only one published post with URL in this fixture
    const singlePostTopics = `
- id: post-1
  title: Post 1
  pillar: ai-per-afdeling
  target_keyword: AI
  intended_word_count: 1500
  status: published
  priority: 1
  last_attempted: "2026-05-01T10:00:00Z"
  wp_post_id: 10
  wp_post_url: https://artifation.nl/post-1/
`;

    const dir = await fixtureDir(TENANT_CONFIG_NO_ALERT_YAML, singlePostTopics);
    const now = new Date("2026-05-09T06:00:00Z");

    await runCwvJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now });

    expect(emailCalls).toHaveLength(0);

    const logPath = path.join(dir, "..", "data", "cwv-runs", "artifation", "2026-05-09.json");
    const log = JSON.parse(await readFile(logPath, "utf-8"));
    expect(log.poor_urls).toHaveLength(1);
    expect(log.alert_sent).toBe(false);
  });

  it("continues processing remaining URLs when one PSI fetch fails", async () => {
    // First call throws, second succeeds
    let callCount = 0;
    const { fetchPsi } = await import("@/integrations/pageSpeedInsights");
    (fetchPsi as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      callCount++;
      throw new Error("timeout");
    });
    (fetchPsi as ReturnType<typeof vi.fn>).mockImplementationOnce(async (input: { url: string }) => {
      callCount++;
      return {
        url: input.url,
        lcp_ms: 1500,
        inp_ms: 100,
        cls: 0.05,
        performance_score: 90,
        fetched_at: new Date().toISOString(),
      };
    });

    const dir = await fixtureDir(TENANT_CONFIG_YAML, TOPICS_YAML_WITH_PUBLISHED);
    const now = new Date("2026-05-09T06:00:00Z");

    await runCwvJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now });

    // Should not throw; run log should have 1 result (the successful one)
    const logPath = path.join(dir, "..", "data", "cwv-runs", "artifation", "2026-05-09.json");
    const log = JSON.parse(await readFile(logPath, "utf-8"));
    expect(log.total_checked).toBe(1);
    expect(log.alert_sent).toBe(false);
  });
});
