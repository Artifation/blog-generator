#!/usr/bin/env tsx
/**
 * Import existing YAML-based tenants into the SQLite app database.
 *
 *   tsx scripts/import-yaml.ts                # import all tenants/
 *   tsx scripts/import-yaml.ts artifation     # import a single tenant
 *
 * Re-runs are idempotent: if a site with the same slug exists, this script
 * skips it. Pass --overwrite to delete-and-recreate.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { createSite, deleteSite, getSiteBySlug } from "../lib/sites";
import { createTopic } from "../lib/topics";

async function main() {
  const argv = process.argv.slice(2);
  const overwrite = argv.includes("--overwrite");
  const onlySlugs = argv.filter((a) => !a.startsWith("--"));

  const tenantsRoot = path.resolve(process.cwd(), "../../tenants");

  if (!fs.existsSync(tenantsRoot)) {
    console.error(`tenants/ directory not found at ${tenantsRoot}`);
    process.exit(1);
  }

  const slugs = onlySlugs.length
    ? onlySlugs
    : fs.readdirSync(tenantsRoot).filter((d) => fs.statSync(path.join(tenantsRoot, d)).isDirectory());

  for (const slug of slugs) {
    const dir = path.join(tenantsRoot, slug);
    const configFile = path.join(dir, "config.yaml");
    if (!fs.existsSync(configFile)) {
      console.warn(`skip ${slug}: no config.yaml`);
      continue;
    }
    const cfg = yaml.load(fs.readFileSync(configFile, "utf-8")) as any;

    const existing = await getSiteBySlug(slug);
    if (existing) {
      if (!overwrite) {
        console.log(`skip ${slug}: already exists (pass --overwrite to replace)`);
        continue;
      }
      await deleteSite(existing.id);
      console.log(`deleted existing ${slug}`);
    }

    const site = await createSite({
      name: cfg.brand?.name ?? slug,
      slug,
      domain: cfg.domain ?? `${slug}.example.com`,
      language: cfg.language ?? "en-US",
      brandVoice: cfg.brand?.voice ?? "",
      banList: cfg.brand?.ban_list ?? [],
      signaturePhrases: cfg.brand?.signature_phrases ?? [],
      qualityThreshold: cfg.quality_threshold ?? 8.0,
      maxPostsPerWeek: cfg.max_posts_per_week_published ?? 2,
      scheduleCron: "0 6 * * 1,3,5",
      publishDestination: cfg.wordpress ? "wordpress" : "built_in",
      wordpressConfig: cfg.wordpress
        ? {
            baseUrl: cfg.wordpress.base_url,
            user: process.env[cfg.wordpress.user_secret_ref] ?? "",
            appPassword: process.env[cfg.wordpress.app_password_secret_ref] ?? "",
          }
        : null,
      author: {
        name: cfg.author?.name ?? "",
        bio: cfg.author?.bio,
        linkedin: cfg.author?.linkedin,
        photoUrl: cfg.author?.photo_url,
      },
      apiKeys: {
        anthropic: process.env.ANTHROPIC_API_KEY ?? "",
        gemini: process.env.GEMINI_API_KEY ?? "",
        groq: process.env.GROQ_API_KEY ?? "",
        fal: process.env.FAL_API_KEY ?? "",
        resend: process.env.RESEND_API_KEY ?? "",
      },
      pillars: (cfg.pillars ?? []).map((p: any) => ({
        slug: p.id,
        name: p.id.replace(/-/g, " "),
        weight: p.weight,
      })),
    });

    console.log(`imported site: ${site.slug} (id=${site.id})`);

    const topicsFile = path.join(dir, "topics.yaml");
    if (fs.existsSync(topicsFile)) {
      const topics = (yaml.load(fs.readFileSync(topicsFile, "utf-8")) as any[]) ?? [];
      let imported = 0;
      for (const t of topics) {
        try {
          await createTopic({
            siteId: site.id,
            title: t.title,
            targetKeyword: t.target_keyword,
            pillarSlug: t.pillar,
            intent: t.intent ?? "informational",
            intendedWordCount: t.intended_word_count ?? t.intended_word_count_target ?? 1500,
            priority: t.priority ?? 0,
          });
          imported++;
        } catch (err) {
          console.warn(`  skip topic ${t.id}: ${(err as Error).message}`);
        }
      }
      console.log(`  imported ${imported} topics`);
    }
  }

  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
