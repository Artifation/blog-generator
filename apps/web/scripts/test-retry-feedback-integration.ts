/**
 * Integration test for the retry-feedback loop. Simulates the exact
 * code path runForSite.ts uses: insert a rejected draft with the
 * NEW (post-PR-#20) hardFails format, then call
 * getLatestRejectedDraftForTopic + parsePreviousFabricatedClaims and
 * assert the writer would receive clean claim strings (no reason
 * meta-comments appended).
 *
 * Cleans up the synthetic record at the end. Exits non-zero on any
 * regression.
 */
import { getDb, ensureSchema } from "../lib/db/client";
import { drafts, sites, topics } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { newId } from "../lib/db/ids";
import { getLatestRejectedDraftForTopic } from "../lib/drafts";
import { parsePreviousFabricatedClaims } from "../../../src/pipeline/fabricatedClaimsParser";

await ensureSchema();
const db = getDb();

const FIXTURE_SITE_ID = "site_retryloop_test";
const FIXTURE_TOPIC_ID = "tpc_retryloop_test";
const fixtureDraftId = newId("dft");

let exitCode = 0;
const fail = (msg: string) => {
  console.error(`  FAIL: ${msg}`);
  exitCode = 1;
};

try {
  // Seed: site + topic + rejected draft with realistic post-PR-#20 hardFails.
  await db.insert(sites).values({
    id: FIXTURE_SITE_ID,
    slug: "_retryloop_test",
    name: "Retry-loop fixture",
    domain: "fixture.invalid",
    language: "nl-NL",
    brandVoice: "test",
    banList: [],
    signaturePhrases: [],
    qualityThreshold: 7,
    maxPostsPerWeek: 1,
    scheduleCron: "0 9 * * 1",
    publishDestination: "built_in",
    apiKeys: {},
    author: { name: "", bio: "", linkedin: "", photoUrl: "" },
    organization: { legalName: "", kvk: "", btw: "", address: "" },
    features: {},
  }).onConflictDoNothing();

  await db.insert(topics).values({
    id: FIXTURE_TOPIC_ID,
    siteId: FIXTURE_SITE_ID,
    title: "Retry-loop fixture topic",
    targetKeyword: "test keyword",
    pillarSlug: "test",
    intent: "informational",
    intendedWordCount: 1500,
    priority: 1,
    status: "rejected",
  }).onConflictDoNothing();

  await db.insert(drafts).values({
    id: fixtureDraftId,
    siteId: FIXTURE_SITE_ID,
    topicId: FIXTURE_TOPIC_ID,
    runId: null,
    title: "Fixture",
    slug: "retry-loop-fixture",
    contentHtml: "<p>test</p>",
    metaTitle: "",
    metaDescription: "",
    tldr: "",
    imagePath: null,
    imageAlt: null,
    rubricScores: null,
    weightedTotal: 5.5,
    hardFails: [
      "fact_check failed (verdict=fail, 3 fabricated claims)",
      "fabricated claim: 47% van MKB gebruikt AI — niet in key_facts",
      "fabricated claim: €12.000 jaarlijkse besparing — geen bron in research",
      "fabricated claim: in 2024 — toen de AI Act in werking trad — bespaarde 8 uur per week — niet ondersteund door key_facts",
      "fabricated claim: 8 op de 10 ondernemers",
    ],
    costUsd: 0,
    status: "rejected",
  });

  console.log(`Seeded fixture rejected draft ${fixtureDraftId} for topic ${FIXTURE_TOPIC_ID}\n`);

  // The exact path runForSite uses:
  const prevRejected = await getLatestRejectedDraftForTopic(FIXTURE_TOPIC_ID);
  if (!prevRejected) {
    fail("getLatestRejectedDraftForTopic returned null for seeded topic");
  } else if (prevRejected.id !== fixtureDraftId) {
    fail(`getLatestRejectedDraftForTopic returned wrong draft (${prevRejected.id})`);
  } else {
    console.log(`✓ getLatestRejectedDraftForTopic found our seeded draft`);
  }

  const claims = prevRejected ? parsePreviousFabricatedClaims(prevRejected.hardFails ?? []) : [];

  console.log(`\nClaims that would be sent to writer:`);
  for (const c of claims) console.log(`  > "${c}"`);

  // Expectations
  const expected = [
    "47% van MKB gebruikt AI",
    "€12.000 jaarlijkse besparing",
    "in 2024 — toen de AI Act in werking trad — bespaarde 8 uur per week",
    "8 op de 10 ondernemers",
  ];
  if (claims.length !== expected.length) {
    fail(`expected ${expected.length} claims, got ${claims.length}`);
  } else {
    for (let i = 0; i < expected.length; i++) {
      if (claims[i] !== expected[i]) {
        fail(`claim[${i}] mismatch:\n    expected: "${expected[i]}"\n    actual:   "${claims[i]}"`);
      }
    }
    if (exitCode === 0) console.log(`\n✓ All 4 claims parsed cleanly — no reason suffixes leaked`);
  }

  // The non-fabricated entry must be filtered out:
  if (claims.some((c) => c.includes("fact_check failed"))) {
    fail("Non-fabricated hardFails entry leaked into claims");
  }
} finally {
  // Always clean up so the fixture doesn't pollute the real app DB
  await db.delete(drafts).where(eq(drafts.id, fixtureDraftId));
  await db.delete(topics).where(eq(topics.id, FIXTURE_TOPIC_ID));
  await db.delete(sites).where(eq(sites.id, FIXTURE_SITE_ID));
  console.log(`\nCleaned up fixture data.`);
}

process.exit(exitCode);
