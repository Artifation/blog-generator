/**
 * CLI: generate a robots.txt snippet for AI crawlers based on tenant config.
 *
 * Usage:
 *   npx tsx scripts/generate-robots-txt.ts --tenant=artifation
 *
 * Output: robots.txt snippet — paste into your WordPress host's robots.txt.
 */

import { loadTenant } from "../src/config/loader.ts";
import { generateRobotsTxt } from "../src/pipeline/robotsTxt.ts";

const tenantArg = process.argv.slice(2).find((a) => a.startsWith("--tenant="));
if (!tenantArg) throw new Error("Usage: --tenant=<slug>");
const slug = tenantArg.split("=")[1]!;

const tenant = await loadTenant(slug);
const out = generateRobotsTxt({
  ai_crawlers: tenant.features.ai_crawlers ?? {},
  sitemapUrl: `${tenant.wordpress.base_url}/sitemap.xml`,
});
console.log(out);
