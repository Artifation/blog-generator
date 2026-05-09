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
    return { id: "msg-decay-1" };
  }),
}));

// ---------------------------------------------------------------------------
// Mock querySearchConsole (two calls per run: "now" window + "prev" window)
// ---------------------------------------------------------------------------

const querySearchConsoleMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/searchConsole", () => ({
  querySearchConsole: querySearchConsoleMock,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { runContentDecayJob } from "@/pipeline/contentDecayJob";
import type { GscQueryResult } from "@/integrations/searchConsole";

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
  search_console:
    enabled: true
    property_url: "sc-domain:artifation.nl"
`;

const TENANT_CONFIG_DISABLED_YAML = TENANT_CONFIG_YAML.replace(
  "enabled: true",
  "enabled: false"
);

const TOPICS_YAML = `
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
  GSC_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: "bot@project.iam.gserviceaccount.com",
    private_key: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n",
  }),
  WP_USER: "u",
  WP_APP_PASSWORD: "p",
} as NodeJS.ProcessEnv;

function makeGscResult(rows: GscQueryResult["rows"]): GscQueryResult {
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  return {
    rows,
    totals: {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      position: rows.length > 0 ? rows.reduce((s, r) => s + r.position, 0) / rows.length : 0,
    },
  };
}

async function fixtureDir(configYaml: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "decay-"));
  const tenantDir = path.join(dir, "artifation");
  await mkdir(tenantDir, { recursive: true });
  await writeFile(path.join(tenantDir, "config.yaml"), configYaml);
  await writeFile(path.join(tenantDir, "topics.yaml"), TOPICS_YAML);
  return dir;
}

function resetState() {
  emailCalls.length = 0;
  querySearchConsoleMock.mockReset();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runContentDecayJob", () => {
  beforeEach(resetState);

  it("skips when feature is disabled", async () => {
    const dir = await fixtureDir(TENANT_CONFIG_DISABLED_YAML);
    await runContentDecayJob({ tenantSlug: "artifation", baseDir: dir, env: ENV });
    expect(querySearchConsoleMock).not.toHaveBeenCalled();
    expect(emailCalls).toHaveLength(0);
  });

  it("0 decaying pages → no email sent, log written", async () => {
    // now window: page with good metrics
    querySearchConsoleMock.mockResolvedValueOnce(
      makeGscResult([
        { keys: ["https://artifation.nl/ai-tools/"], clicks: 100, impressions: 800, ctr: 0.125, position: 3.0 },
      ])
    );
    // prev window: same page, slightly worse (position improved → not decaying)
    querySearchConsoleMock.mockResolvedValueOnce(
      makeGscResult([
        { keys: ["https://artifation.nl/ai-tools/"], clicks: 80, impressions: 700, ctr: 0.114, position: 4.5 },
      ])
    );

    const dir = await fixtureDir(TENANT_CONFIG_YAML);
    const now = new Date("2026-05-08T12:00:00Z");

    await runContentDecayJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now });

    expect(emailCalls).toHaveLength(0);

    const logPath = path.join(dir, "..", "data", "content-decay-runs", "artifation", "2026-05-08.json");
    const log = JSON.parse(await readFile(logPath, "utf-8"));
    expect(log.decaying_count).toBe(0);
    expect(log.email_sent).toBe(false);
    expect(log.total_pages_analyzed).toBe(1);
  });

  it("3 decaying pages → email sent with top-10 cap", async () => {
    const nowRows = [
      { keys: ["https://artifation.nl/page-a/"], clicks: 20, impressions: 500, ctr: 0.04, position: 8.0 },
      { keys: ["https://artifation.nl/page-b/"], clicks: 5, impressions: 300, ctr: 0.017, position: 12.0 },
      { keys: ["https://artifation.nl/page-c/"], clicks: 3, impressions: 200, ctr: 0.015, position: 15.0 },
    ];
    const prevRows = [
      { keys: ["https://artifation.nl/page-a/"], clicks: 50, impressions: 600, ctr: 0.083, position: 3.0 },   // pos: 3→8 (+5), clicks drop >30%
      { keys: ["https://artifation.nl/page-b/"], clicks: 30, impressions: 400, ctr: 0.075, position: 5.0 },   // pos: 5→12 (+7), clicks drop >30%
      { keys: ["https://artifation.nl/page-c/"], clicks: 10, impressions: 250, ctr: 0.04, position: 6.0 },    // pos: 6→15 (+9), clicks drop >30%
    ];

    querySearchConsoleMock.mockResolvedValueOnce(makeGscResult(nowRows));
    querySearchConsoleMock.mockResolvedValueOnce(makeGscResult(prevRows));

    const dir = await fixtureDir(TENANT_CONFIG_YAML);
    const now = new Date("2026-05-08T12:00:00Z");

    await runContentDecayJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now });

    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0]!.subject).toMatch(/decay/i);
    expect(emailCalls[0]!.subject).toMatch(/3 pagina's/);

    const logPath = path.join(dir, "..", "data", "content-decay-runs", "artifation", "2026-05-08.json");
    const log = JSON.parse(await readFile(logPath, "utf-8"));
    expect(log.decaying_count).toBe(3);
    expect(log.top_decaying.length).toBeLessThanOrEqual(10);
    expect(log.email_sent).toBe(true);
  });

  it("position improved → not flagged as decaying", async () => {
    // Position improved: 8.0 → 3.0 (lower is better), clicks also up
    querySearchConsoleMock.mockResolvedValueOnce(
      makeGscResult([
        { keys: ["https://artifation.nl/ai-tools/"], clicks: 150, impressions: 900, ctr: 0.167, position: 3.0 },
      ])
    );
    querySearchConsoleMock.mockResolvedValueOnce(
      makeGscResult([
        { keys: ["https://artifation.nl/ai-tools/"], clicks: 80, impressions: 700, ctr: 0.114, position: 8.0 },
      ])
    );

    const dir = await fixtureDir(TENANT_CONFIG_YAML);
    const now = new Date("2026-05-08T12:00:00Z");

    await runContentDecayJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now });

    expect(emailCalls).toHaveLength(0);

    const logPath = path.join(dir, "..", "data", "content-decay-runs", "artifation", "2026-05-08.json");
    const log = JSON.parse(await readFile(logPath, "utf-8"));
    expect(log.decaying_count).toBe(0);
  });

  it("API error → logs warning, skips email, no throw", async () => {
    querySearchConsoleMock.mockRejectedValueOnce(new Error("GSC quota exceeded"));

    const dir = await fixtureDir(TENANT_CONFIG_YAML);
    const now = new Date("2026-05-08T12:00:00Z");

    // Should not throw
    await expect(
      runContentDecayJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now })
    ).resolves.toBeUndefined();

    expect(emailCalls).toHaveLength(0);
  });

  it("top-10 cap: only first 10 pages by impressions are included in email + log", async () => {
    // Create 15 decaying pages
    const nowRows = Array.from({ length: 15 }, (_, i) => ({
      keys: [`https://artifation.nl/page-${i}/`],
      clicks: 5,
      impressions: (15 - i) * 100, // descending impressions
      ctr: 0.01,
      position: 10.0 + i, // all getting worse
    }));
    const prevRows = Array.from({ length: 15 }, (_, i) => ({
      keys: [`https://artifation.nl/page-${i}/`],
      clicks: 50, // clicks drop >30% for all
      impressions: (15 - i) * 100,
      ctr: 0.1,
      position: 3.0, // all were at 3, now at 10+i → decay ≥7
    }));

    querySearchConsoleMock.mockResolvedValueOnce(makeGscResult(nowRows));
    querySearchConsoleMock.mockResolvedValueOnce(makeGscResult(prevRows));

    const dir = await fixtureDir(TENANT_CONFIG_YAML);
    const now = new Date("2026-05-08T12:00:00Z");

    await runContentDecayJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now });

    const logPath = path.join(dir, "..", "data", "content-decay-runs", "artifation", "2026-05-08.json");
    const log = JSON.parse(await readFile(logPath, "utf-8"));
    expect(log.decaying_count).toBe(15);
    expect(log.top_decaying).toHaveLength(10);
    expect(log.email_sent).toBe(true);
  });
});
