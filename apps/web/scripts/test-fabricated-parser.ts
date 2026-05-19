/**
 * Smoke-test the retry-feedback parser against ALL rejected drafts in
 * the live SQLite DB. Prints, per draft:
 *   - raw hardFails entries
 *   - what the parser yields as previous_fabricated_claims
 *   - asserts no entry still contains ' — ' (the reason separator) at the end
 *
 * Exits non-zero if it finds a regression.
 */
import { getDb, ensureSchema } from "../lib/db/client";
import { drafts } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { parsePreviousFabricatedClaims } from "../../../src/pipeline/fabricatedClaimsParser";

await ensureSchema();
const db = getDb();
const rejected = await db.select().from(drafts).where(eq(drafts.status, "rejected"));

console.log(`Found ${rejected.length} rejected drafts in DB`);

let withFabricated = 0;
let totalEntries = 0;
let regressions = 0;

for (const d of rejected) {
  const hf = d.hardFails ?? [];
  const fabs = hf.filter((f) => f.startsWith("fabricated claim: "));
  if (fabs.length === 0) continue;
  withFabricated++;

  console.log(`\n--- Draft ${d.id} (slug=${d.slug}) ---`);
  console.log(`  raw hardFails (${hf.length}):`);
  for (const e of hf) console.log(`    | ${e}`);

  const parsed = parsePreviousFabricatedClaims(hf);
  totalEntries += parsed.length;
  console.log(`  parsed claims (${parsed.length}):`);
  for (const p of parsed) {
    console.log(`    > "${p}"`);
    if (p.endsWith(" — niet in key_facts") || p.endsWith(" — geen bron in research") || /\s—\s[^—]+$/.test(p)) {
      console.log(`    ! REGRESSION: parsed claim still ends with reason-like suffix`);
      regressions++;
    }
  }
}

console.log(`\nSummary:`);
console.log(`  rejected drafts:        ${rejected.length}`);
console.log(`  with fabricated entries: ${withFabricated}`);
console.log(`  parsed claims total:    ${totalEntries}`);
console.log(`  regressions:            ${regressions}`);

if (regressions > 0) process.exit(1);
