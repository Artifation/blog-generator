/**
 * DB-based GSC-snapshot runner. Webapp-tegenhanger van het YAML-CLI
 * `scripts/gsc-snapshot.ts`: leest de site's gepubliceerde posts uit de
 * SQLite-tabel `published_posts` en trekt GSC-data voor elke URL.
 *
 * Schrijft naar `data/gsc-snapshots/<site-slug>/<date>.json` — zelfde lokatie
 * en formaat als de YAML-versie zodat `gscPerformanceInsights.loadLatestSnapshot`
 * voor beide kant van de pivot werkt (orchestrator + runForSite zien dezelfde
 * insights).
 */
import path from "node:path";
import { runGscSnapshot, type PublishedPostRef, type GscSnapshotResult } from "@/pipeline/gscSnapshot";
import type { Site, PublishedPost } from "~/lib/db/schema";
import { listPublishedPostsForSite } from "~/lib/drafts";

export interface RunGscSnapshotForSiteOpts {
  site: Site;
  /** Override data-dir (default: repo-root data/, relatief vanuit apps/web cwd). */
  dataDir?: string;
  now?: Date;
}

export interface RunGscSnapshotForSiteResult {
  ok: true;
  snapshot: GscSnapshotResult["snapshot"];
  filePath: string;
  postsScanned: number;
}

export interface RunGscSnapshotForSiteSkipResult {
  ok: false;
  reason:
    | "no_published_posts"
    | "missing_gsc_credentials"
    | "no_property_url"
    | "error";
  message: string;
}

export async function runGscSnapshotForSite(
  opts: RunGscSnapshotForSiteOpts
): Promise<RunGscSnapshotForSiteResult | RunGscSnapshotForSiteSkipResult> {
  const { site } = opts;
  const dataDir = opts.dataDir ?? path.resolve(process.cwd(), "../../data");

  // Vereisten: per-site GSC service-account JSON in site.apiKeys.
  const serviceAccountJson = site.apiKeys?.gscServiceAccountJson;
  if (!serviceAccountJson) {
    return {
      ok: false,
      reason: "missing_gsc_credentials",
      message:
        "Geen GSC service-account JSON ingesteld voor deze site. Vul `apiKeys.gscServiceAccountJson` in onder Instellingen → API-keys.",
    };
  }

  // Property URL: lees uit features.search_console.property_url als die
  // expliciet is gezet; anders default naar `sc-domain:<site.domain>`.
  // Werkt zonder configuratie voor de typische case.
  const features = site.features as { search_console?: { property_url?: string } } | undefined;
  const propertyUrl =
    features?.search_console?.property_url?.trim() || `sc-domain:${site.domain}`;
  if (!propertyUrl) {
    return {
      ok: false,
      reason: "no_property_url",
      message: "Geen GSC property URL afleidbaar — controleer site.domain.",
    };
  }

  const published: PublishedPost[] = await listPublishedPostsForSite(site.id);
  if (published.length === 0) {
    return {
      ok: false,
      reason: "no_published_posts",
      message: "Site heeft nog geen gepubliceerde posts om te snapshotten.",
    };
  }

  // Map published_posts → PublishedPostRef shape. externalUrl is gevuld na
  // een WordPress-publish; voor built_in fallback gebruiken we de slug + domain.
  const posts: PublishedPostRef[] = published.map((p) => {
    const url = p.externalUrl ?? `https://${site.domain}/${p.slug}`;
    return {
      url,
      published_at: p.publishedAt.slice(0, 10),
      target_keyword: p.targetKeyword,
      pillar: p.pillarSlug || undefined,
    };
  });

  try {
    const { snapshot, filePath } = await runGscSnapshot({
      tenantSlug: site.slug,
      propertyUrl,
      posts,
      gsc: { serviceAccountJson },
      now: opts.now,
      dataDir,
    });
    return { ok: true, snapshot, filePath, postsScanned: posts.length };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: (err as Error).message,
    };
  }
}
