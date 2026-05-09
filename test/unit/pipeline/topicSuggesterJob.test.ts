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
    return { id: "msg-topic-1" };
  }),
}));

// ---------------------------------------------------------------------------
// Mock competitor sitemaps
// ---------------------------------------------------------------------------

const fetchCompetitorSitemapsMock = vi.hoisted(() => vi.fn());
const diffNewEntriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/competitorSitemaps", () => ({
  fetchCompetitorSitemaps: fetchCompetitorSitemapsMock,
  diffNewEntries: diffNewEntriesMock,
}));

// ---------------------------------------------------------------------------
// Mock querySearchConsole
// ---------------------------------------------------------------------------

const querySearchConsoleMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/searchConsole", () => ({
  querySearchConsole: querySearchConsoleMock,
}));

// ---------------------------------------------------------------------------
// Mock topicSuggester agent
// ---------------------------------------------------------------------------

const runTopicSuggesterMock = vi.hoisted(() => vi.fn());

vi.mock("@/agents/topicSuggester", () => ({
  runTopicSuggester: runTopicSuggesterMock,
}));

// ---------------------------------------------------------------------------
// Mock LLM provider registry
// ---------------------------------------------------------------------------

vi.mock("@/llm/client", () => ({
  createProviderRegistry: vi.fn(() => ({
    get: vi.fn(() => ({ name: "gemini", call: vi.fn() })),
  })),
  resolveAgentModel: vi.fn(() => ({
    provider: "gemini",
    model: "gemini-2.5-pro",
    maxTokens: 4000,
  })),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { runTopicSuggesterJob } from "@/pipeline/topicSuggesterJob";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ENABLED_YAML = `
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
pillars:
  - { id: ai-per-afdeling, weight: 0.5 }
  - { id: ai-act, weight: 0.3 }
  - { id: sector-extensie, weight: 0.2 }
quality_threshold: 8.0
max_posts_per_week_published: 4
features:
  topic_suggester:
    enabled: true
    competitor_domains: []
    max_proposals_per_week: 5
    expire_after_weeks: 4
  search_console:
    enabled: false
    property_url: "sc-domain:artifation.nl"
`;

const TENANT_DISABLED_YAML = TENANT_ENABLED_YAML.replace(
  "enabled: true",
  "enabled: false"
);

const TENANT_WITH_GSC_YAML = TENANT_ENABLED_YAML.replace(
  `  search_console:
    enabled: false`,
  `  search_console:
    enabled: true`
);

const NOW = new Date("2026-05-09T10:00:00Z");

// A proposal 5 weeks old (should be expired with expire_after_weeks: 4)
const OLD_PROPOSED_AT = new Date(NOW.getTime() - 5 * 7 * 86_400_000).toISOString();
// A proposal 2 weeks old (should NOT be expired)
const RECENT_PROPOSED_AT = new Date(NOW.getTime() - 2 * 7 * 86_400_000).toISOString();

function makeTopicsYaml(extra = "") {
  return `
- id: existing-topic
  title: Bestaand AI topic
  pillar: ai-per-afdeling
  target_keyword: ai tools
  intended_word_count: 1500
  status: queued
  priority: 5
${extra}
`.trim();
}

const TOPICS_WITH_OLD_PROPOSED = makeTopicsYaml(`- id: old-proposed-topic
  title: Oud voorgesteld topic
  pillar: ai-act
  target_keyword: eu ai act
  intended_word_count: 2000
  status: proposed
  priority: 3
  proposed_at: "${OLD_PROPOSED_AT}"
  proposal_source: competitor_sitemap
  proposal_rationale: Was een goed idee maar werd niet goedgekeurd.`);

const TOPICS_WITH_RECENT_PROPOSED = makeTopicsYaml(`- id: recent-proposed-topic
  title: Recent voorgesteld topic
  pillar: ai-act
  target_keyword: ai wet 2026
  intended_word_count: 1800
  status: proposed
  priority: 4
  proposed_at: "${RECENT_PROPOSED_AT}"
  proposal_source: gsc_rising_query
  proposal_rationale: Stijgende query met kansen.`);

const MOCK_PROPOSAL = {
  id: "20260509-ai-finance-mkb",
  title: "AI in finance voor MKB",
  pillar: "ai-per-afdeling",
  target_keyword: "ai finance mkb",
  intended_word_count: 1800,
  intent: "informational" as const,
  priority: 3,
  proposal_source: "competitor_sitemap" as const,
  proposal_rationale: "Concurrent publiceerde recent een artikel. Hoge zoekintentie.",
};

const ENV = {
  RESEND_API_KEY: "resend-x",
  GEMINI_API_KEY: "gemini-x",
  GSC_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: "bot@project.iam.gserviceaccount.com",
    private_key: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n",
  }),
} as NodeJS.ProcessEnv;

async function fixtureDir(configYaml: string, topicsYaml = makeTopicsYaml()): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "topic-suggester-"));
  const tenantDir = path.join(dir, "artifation");
  await mkdir(tenantDir, { recursive: true });
  await writeFile(path.join(tenantDir, "config.yaml"), configYaml);
  await writeFile(path.join(tenantDir, "topics.yaml"), topicsYaml);
  return dir;
}

function resetMocks() {
  emailCalls.length = 0;
  fetchCompetitorSitemapsMock.mockReset();
  diffNewEntriesMock.mockReset();
  querySearchConsoleMock.mockReset();
  runTopicSuggesterMock.mockReset();

  // Default: empty results
  fetchCompetitorSitemapsMock.mockResolvedValue([]);
  diffNewEntriesMock.mockReturnValue([]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runTopicSuggesterJob", () => {
  beforeEach(resetMocks);

  it("disabled feature → early return, no mocks called", async () => {
    const dir = await fixtureDir(TENANT_DISABLED_YAML);
    await runTopicSuggesterJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now: NOW });

    expect(runTopicSuggesterMock).not.toHaveBeenCalled();
    expect(emailCalls).toHaveLength(0);
  });

  it("expires old proposed topics (≥ expire_after_weeks)", async () => {
    const dir = await fixtureDir(TENANT_ENABLED_YAML, TOPICS_WITH_OLD_PROPOSED);

    // No candidates → will return early after expiry
    runTopicSuggesterMock.mockResolvedValue({ parsed: { proposals: [] } });

    await runTopicSuggesterJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now: NOW });

    // Read saved topics.yaml and verify the old proposal is now expired
    const savedYaml = await readFile(path.join(dir, "artifation", "topics.yaml"), "utf-8");
    expect(savedYaml).toContain("proposed_expired");
    expect(savedYaml).not.toMatch(/^- id: old-proposed-topic[\s\S]*?status: proposed$/m);
  });

  it("does NOT expire recent proposed topics (< expire_after_weeks)", async () => {
    const dir = await fixtureDir(TENANT_ENABLED_YAML, TOPICS_WITH_RECENT_PROPOSED);

    runTopicSuggesterMock.mockResolvedValue({ parsed: { proposals: [] } });

    await runTopicSuggesterJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now: NOW });

    const savedYaml = await readFile(path.join(dir, "artifation", "topics.yaml"), "utf-8");
    expect(savedYaml).toContain("proposed");
    expect(savedYaml).not.toContain("proposed_expired");
  });

  it("happy path: proposals appended to topics.yaml + email sent", async () => {
    // Use a config with competitor_domains so the sitemap block runs
    const configWithDomains = TENANT_ENABLED_YAML.replace(
      "competitor_domains: []",
      "competitor_domains: [competitor.nl]"
    );
    const dir = await fixtureDir(configWithDomains);

    // Competitor sitemaps returns entries; diff finds new ones
    const newEntry = {
      url: "https://competitor.nl/ai-finance/",
      slug: "ai-finance",
      competitor_domain: "competitor.nl",
    };
    fetchCompetitorSitemapsMock.mockResolvedValue([newEntry]);
    diffNewEntriesMock.mockReturnValue([newEntry]);

    runTopicSuggesterMock.mockResolvedValue({
      parsed: { proposals: [MOCK_PROPOSAL] },
    });

    await runTopicSuggesterJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now: NOW });

    // Topics.yaml should now contain the proposed entry
    const savedYaml = await readFile(path.join(dir, "artifation", "topics.yaml"), "utf-8");
    expect(savedYaml).toContain("20260509-ai-finance-mkb");
    expect(savedYaml).toContain("status: proposed");
    expect(savedYaml).toContain("proposed_at:");
    expect(savedYaml).toContain("competitor_sitemap");

    // Email sent
    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0]!.subject).toContain("topic-voorstellen");
    expect(emailCalls[0]!.subject).toContain("2026-05-09");
  });

  it("empty candidates → no agent call, no proposals, no email", async () => {
    const dir = await fixtureDir(TENANT_ENABLED_YAML);

    // No new entries from sitemaps, no GSC
    diffNewEntriesMock.mockReturnValue([]);

    await runTopicSuggesterJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now: NOW });

    expect(runTopicSuggesterMock).not.toHaveBeenCalled();
    expect(emailCalls).toHaveLength(0);
  });

  it("GSC rising queries are included as candidates when search_console enabled", async () => {
    const dir = await fixtureDir(TENANT_WITH_GSC_YAML);

    // No competitor entries
    diffNewEntriesMock.mockReturnValue([]);

    // GSC returns a rising query
    querySearchConsoleMock.mockResolvedValue({
      rows: [
        {
          keys: ["eu ai act mkb"],
          clicks: 5,
          impressions: 80,
          ctr: 0.063,
          position: 14.5,
        },
      ],
      totals: { clicks: 5, impressions: 80, ctr: 0.063, position: 14.5 },
    });

    runTopicSuggesterMock.mockResolvedValue({
      parsed: { proposals: [MOCK_PROPOSAL] },
    });

    await runTopicSuggesterJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now: NOW });

    // Agent was called with the GSC rising query as a candidate
    expect(runTopicSuggesterMock).toHaveBeenCalledOnce();
    const callArg = (runTopicSuggesterMock as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      candidates: { source: string; query?: string }[];
    };
    const gscCandidate = callArg.candidates.find((c) => c.source === "gsc_rising_query");
    expect(gscCandidate).toBeDefined();
    expect(gscCandidate!.query).toBe("eu ai act mkb");
  });

  it("GSC queries with impressions ≤50 or position ≤10 are NOT rising candidates", async () => {
    const dir = await fixtureDir(TENANT_WITH_GSC_YAML);

    diffNewEntriesMock.mockReturnValue([]);

    querySearchConsoleMock.mockResolvedValue({
      rows: [
        // Too few impressions
        { keys: ["query-low-impressions"], clicks: 1, impressions: 30, ctr: 0.03, position: 15 },
        // Good position — already ranking well
        { keys: ["query-good-position"], clicks: 50, impressions: 200, ctr: 0.25, position: 3 },
      ],
      totals: { clicks: 51, impressions: 230, ctr: 0.22, position: 9 },
    });

    await runTopicSuggesterJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now: NOW });

    // No valid candidates → agent not called
    expect(runTopicSuggesterMock).not.toHaveBeenCalled();
    expect(emailCalls).toHaveLength(0);
  });

  it("competitor sitemap failure → skips source, continues (no throw)", async () => {
    const dir = await fixtureDir(TENANT_ENABLED_YAML.replace(
      "competitor_domains: []",
      "competitor_domains: [competitor.nl]"
    ));

    fetchCompetitorSitemapsMock.mockRejectedValue(new Error("network error"));

    // No candidates since sitemap failed — early return
    await expect(
      runTopicSuggesterJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now: NOW })
    ).resolves.toBeUndefined();

    expect(emailCalls).toHaveLength(0);
  });

  it("competitor snapshot is saved after successful run", async () => {
    const dir = await fixtureDir(TENANT_ENABLED_YAML.replace(
      "competitor_domains: []",
      "competitor_domains: [competitor.nl]"
    ));

    const snapshotEntries = [
      { url: "https://competitor.nl/ai-finance/", slug: "ai-finance", competitor_domain: "competitor.nl" },
    ];
    fetchCompetitorSitemapsMock.mockResolvedValue(snapshotEntries);
    diffNewEntriesMock.mockReturnValue(snapshotEntries);

    runTopicSuggesterMock.mockResolvedValue({
      parsed: { proposals: [MOCK_PROPOSAL] },
    });

    await runTopicSuggesterJob({ tenantSlug: "artifation", baseDir: dir, env: ENV, now: NOW });

    const snapshotPath = path.join(dir, "..", "data", "competitor-snapshots", "artifation.json");
    const saved = JSON.parse(await readFile(snapshotPath, "utf-8")) as typeof snapshotEntries;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.url).toBe("https://competitor.nl/ai-finance/");
  });
});
