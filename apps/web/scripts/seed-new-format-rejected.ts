/**
 * Seed a fresh rejected draft with the NEW (post-PR-#20) hardFails format
 * so the UI renders human-readable fabricated_claims badges. Idempotent:
 * deletes any prior fixture before re-inserting.
 */
import { getDb, ensureSchema } from "../lib/db/client";
import { drafts, topics, sites } from "../lib/db/schema";
import { eq, and } from "drizzle-orm";
import { newId } from "../lib/db/ids";

await ensureSchema();
const db = getDb();

const FIXTURE_TOPIC_ID = "tpc_demo_rejected_fixture";
const FIXTURE_SLUG = "ai-roi-mkb-fixture-demo";

// Pick a real site to attach to so the draft shows up in the UI nav.
const sitesRows = await db.select().from(sites).where(eq(sites.slug, "artifation")).limit(1);
const site = sitesRows[0];
if (!site) {
  console.error("artifation site not found — run onboarding first");
  process.exit(1);
}

// Clean up prior fixture if it exists
const prior = await db.select().from(drafts).where(eq(drafts.topicId, FIXTURE_TOPIC_ID));
for (const d of prior) {
  await db.delete(drafts).where(eq(drafts.id, d.id));
}
await db.delete(topics).where(eq(topics.id, FIXTURE_TOPIC_ID));

await db.insert(topics).values({
  id: FIXTURE_TOPIC_ID,
  siteId: site.id,
  title: "AI ROI berekenen voor MKB (demo, retry-feedback fixture)",
  targetKeyword: "ai roi mkb",
  pillarSlug: "ai-voor-mkb",
  intent: "informational",
  intendedWordCount: 1500,
  priority: 5,
  status: "rejected",
  rejectReason: "fact_check failed (3 fabricated claims) — demo fixture for PR #21",
});

const draftId = newId("dft");
await db.insert(drafts).values({
  id: draftId,
  siteId: site.id,
  topicId: FIXTURE_TOPIC_ID,
  runId: null,
  title: "AI ROI berekenen voor MKB",
  slug: FIXTURE_SLUG,
  contentHtml: "<p>Demo content voor retry-feedback fixture.</p>",
  metaTitle: "AI ROI berekenen voor MKB",
  metaDescription: "Demo",
  tldr: "Demo fixture om de retry-feedback fix te tonen.",
  imagePath: null,
  imageAlt: null,
  rubricScores: { originality: 5, voice: 6, structure: 7, accuracy: 3, seo: 6 },
  weightedTotal: 5.4,
  hardFails: [
    "fact_check failed (verdict=fail, 3 fabricated claims)",
    "fabricated claim: 47% van Nederlandse MKB-bedrijven gebruikt al AI — niet in key_facts",
    "fabricated claim: €12.000 jaarlijkse besparing per FTE — geen bron in research",
    "fabricated claim: 8 op de 10 ondernemers ervaren productiviteitsstijging — niet ondersteund door key_facts",
  ],
  costUsd: 0.14,
  status: "rejected",
});

console.log(`Seeded rejected draft ${draftId} with new-format hardFails on site '${site.slug}'`);
console.log(`Visit /drafts in the UI; the badges should now be human-readable.`);
