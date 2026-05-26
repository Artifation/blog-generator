#!/usr/bin/env tsx
/**
 * One-shot housekeeping:
 *   - Delete the legacy test site 't' (and cascades)
 *   - Set artifation.publishDestination = 'built_in' (per spec default)
 *   - Verify GSC service account config status
 *
 *   npx tsx apps/web/scripts/cleanup-and-configure.ts
 */
import { sql } from "drizzle-orm";
import { ensureSchema, getDb } from "../lib/db/client";
import { getSiteBySlug, updateSite, deleteSite } from "../lib/sites";

async function main() {
  await ensureSchema();
  const db = getDb();

  // 1. Delete legacy test site 't'
  const test = await getSiteBySlug("t");
  if (test) {
    await deleteSite(test.id);
    console.log(`[1/3] Deleted legacy test site 't' (id=${test.id}).`);
  } else {
    console.log(`[1/3] No legacy test site 't' found — skip.`);
  }

  // 2. Set artifation publishDestination to built_in
  const arti = await getSiteBySlug("artifation");
  if (!arti) {
    console.log(`[2/3] Site 'artifation' not found — skip publishDestination change.`);
  } else {
    const before = arti.publishDestination;
    if (before !== "built_in") {
      await updateSite(arti.id, { publishDestination: "built_in" });
      console.log(`[2/3] Set artifation.publishDestination: ${before} -> built_in.`);
    } else {
      console.log(`[2/3] artifation.publishDestination already 'built_in' — skip.`);
    }
  }

  // 3. Report GSC config status (per-site override OR global env)
  const globalGsc = process.env.GSC_SERVICE_ACCOUNT_JSON;
  console.log(`[3/3] GSC service account status:`);
  console.log(`        Global env GSC_SERVICE_ACCOUNT_JSON: ${globalGsc ? "set (" + globalGsc.slice(0, 30) + "...)" : "NOT SET"}`);
  if (arti) {
    const perSite = (arti.apiKeys as Record<string, string> | null)?.gscServiceAccount ??
      (arti.apiKeys as Record<string, string> | null)?.gsc_service_account;
    console.log(`        Per-site key (artifation.apiKeys.gscServiceAccount): ${perSite ? "set" : "NOT SET"}`);
  }

  // 4. Print final state
  const all = await db.run(sql`SELECT slug, name, publish_destination FROM sites ORDER BY slug`);
  console.log(`\nFinal site list:`);
  for (const row of (all.rows ?? []) as unknown as Array<{ slug: string; name: string; publish_destination: string }>) {
    console.log(`  - ${row.slug.padEnd(20)} ${row.name.padEnd(20)} publish=${row.publish_destination}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("cleanup-and-configure failed:", err);
  process.exit(1);
});
