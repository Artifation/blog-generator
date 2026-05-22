#!/usr/bin/env node
/**
 * CLI om GSC-snapshots te trekken voor een tenant.
 *
 * Usage:
 *   npx tsx scripts/gsc-snapshot.ts --tenant=artifation
 *
 * Leest gepubliceerde posts uit tenants/<slug>/topics.yaml (status=published,
 * met wp_post_url), trekt GSC-stats en schrijft naar
 * data/gsc-snapshots/<slug>/<YYYY-MM-DD>.json. Bedoeld voor wekelijkse cron.
 */
import { loadTenant } from "@/config/loader";
import { loadTopics } from "@/config/topics";
import { runGscSnapshot, type PublishedPostRef } from "@/pipeline/gscSnapshot";

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

async function main() {
  const args = process.argv.slice(2);
  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  if (!tenantArg) {
    console.error("Usage: tsx scripts/gsc-snapshot.ts --tenant=<slug>");
    process.exit(1);
  }
  const tenantSlug = tenantArg.split("=")[1]!;

  const env = process.env;
  const tenant = await loadTenant(tenantSlug);
  if (!tenant.features.search_console?.enabled) {
    console.log(JSON.stringify({ stage: "gsc-snapshot-skip", reason: "search_console disabled", tenantSlug }));
    return;
  }

  const topics = await loadTopics(tenantSlug);
  const posts: PublishedPostRef[] = topics
    .filter((t) => t.status === "published" && t.wp_post_url)
    .map((t) => ({
      url: t.wp_post_url!,
      published_at: (t.last_attempted ?? new Date().toISOString()).slice(0, 10),
      target_keyword: t.target_keyword,
      pillar: t.pillar,
    }));

  if (posts.length === 0) {
    console.log(JSON.stringify({ stage: "gsc-snapshot-skip", reason: "no published posts", tenantSlug }));
    return;
  }

  console.log(JSON.stringify({ stage: "gsc-snapshot-start", tenantSlug, postsCount: posts.length }));
  const { snapshot, filePath } = await runGscSnapshot({
    tenantSlug,
    propertyUrl: tenant.features.search_console.property_url,
    posts,
    gsc: { serviceAccountJson: requireEnv(env, "GSC_SERVICE_ACCOUNT_JSON") },
  });
  console.log(
    JSON.stringify({
      stage: "gsc-snapshot-done",
      tenantSlug,
      filePath,
      postsWithData: snapshot.summary.posts_with_data,
      totalClicks30d: snapshot.summary.total_clicks_last_30d,
      totalImpressions30d: snapshot.summary.total_impressions_last_30d,
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
