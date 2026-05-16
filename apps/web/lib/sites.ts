import { eq, and, desc, sql } from "drizzle-orm";
import { getDb, ensureSchema } from "./db/client";
import { sites, pillars, topics, drafts, runs, publishedPosts, type Site, type Pillar } from "./db/schema";
import { newId } from "./db/ids";
import { slugify } from "./utils";

export interface SiteWithPillars extends Site {
  pillars: Pillar[];
}

export interface SiteSummary extends Site {
  pillars: Pillar[];
  stats: {
    queuedTopics: number;
    pendingDrafts: number;
    publishedThisWeek: number;
    publishedAllTime: number;
    lastRunAt: string | null;
    lastRunVerdict: string | null;
  };
}

export async function listSitesWithStats(): Promise<SiteSummary[]> {
  await ensureSchema();
  const db = getDb();
  const allSites = await db.select().from(sites).orderBy(sites.createdAt);
  const out: SiteSummary[] = [];
  for (const s of allSites) {
    const sitePillars = await db
      .select()
      .from(pillars)
      .where(eq(pillars.siteId, s.id))
      .orderBy(pillars.sortOrder);
    const queuedTopicsRow = await db
      .select({ c: sql<number>`count(*)`.as("c") })
      .from(topics)
      .where(and(eq(topics.siteId, s.id), eq(topics.status, "queued")));
    const queuedTopics = queuedTopicsRow[0]?.c ?? 0;
    const pendingDraftsRow = await db
      .select({ c: sql<number>`count(*)`.as("c") })
      .from(drafts)
      .where(and(eq(drafts.siteId, s.id), eq(drafts.status, "pending_review")));
    const pendingDrafts = pendingDraftsRow[0]?.c ?? 0;

    const isoWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const publishedThisWeekRow = await db
      .select({ c: sql<number>`count(*)`.as("c") })
      .from(publishedPosts)
      .where(and(eq(publishedPosts.siteId, s.id), sql`${publishedPosts.publishedAt} >= ${isoWeekAgo}`));
    const publishedThisWeek = publishedThisWeekRow[0]?.c ?? 0;
    const publishedAllTimeRow = await db
      .select({ c: sql<number>`count(*)`.as("c") })
      .from(publishedPosts)
      .where(eq(publishedPosts.siteId, s.id));
    const publishedAllTime = publishedAllTimeRow[0]?.c ?? 0;

    const lastRunRows = await db
      .select()
      .from(runs)
      .where(eq(runs.siteId, s.id))
      .orderBy(desc(runs.startedAt))
      .limit(1);
    const lastRun = lastRunRows[0];

    out.push({
      ...s,
      pillars: sitePillars,
      stats: {
        queuedTopics,
        pendingDrafts,
        publishedThisWeek,
        publishedAllTime,
        lastRunAt: lastRun?.startedAt ?? null,
        lastRunVerdict: lastRun?.verdict ?? null,
      },
    });
  }
  return out;
}

export async function getSiteBySlug(slug: string): Promise<SiteWithPillars | null> {
  await ensureSchema();
  const db = getDb();
  const rows = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1);
  const s = rows[0];
  if (!s) return null;
  const sitePillars = await db
    .select()
    .from(pillars)
    .where(eq(pillars.siteId, s.id))
    .orderBy(pillars.sortOrder);
  return { ...s, pillars: sitePillars };
}

export async function getSiteById(id: string): Promise<SiteWithPillars | null> {
  await ensureSchema();
  const db = getDb();
  const rows = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  const s = rows[0];
  if (!s) return null;
  const sitePillars = await db
    .select()
    .from(pillars)
    .where(eq(pillars.siteId, s.id))
    .orderBy(pillars.sortOrder);
  return { ...s, pillars: sitePillars };
}

export interface CreateSiteInput {
  name: string;
  slug?: string;
  domain: string;
  language?: string;
  brandVoice: string;
  banList?: string[];
  signaturePhrases?: string[];
  qualityThreshold?: number;
  maxPostsPerWeek?: number;
  scheduleCron?: string;
  publishDestination?: "built_in" | "wordpress" | "markdown";
  wordpressConfig?: { baseUrl: string; user: string; appPassword: string } | null;
  author: { name: string; bio?: string; linkedin?: string; photoUrl?: string };
  apiKeys?: Record<string, string>;
  pillars: Array<{ slug?: string; name: string; weight: number }>;
  features?: Record<string, unknown>;
}

export async function createSite(input: CreateSiteInput): Promise<SiteWithPillars> {
  await ensureSchema();
  const db = getDb();
  const id = newId("site");
  const slug = input.slug ?? slugify(input.name);
  if (!slug) throw new Error("Could not derive slug from name");

  const totalWeight = input.pillars.reduce((s, p) => s + p.weight, 0);
  const normalized = input.pillars.map((p) => ({
    slug: p.slug ?? slugify(p.name),
    name: p.name,
    weight: totalWeight > 0 ? p.weight / totalWeight : 1 / input.pillars.length,
  }));

  await db.insert(sites).values({
    id,
    slug,
    name: input.name,
    domain: input.domain,
    language: input.language ?? "en-US",
    brandVoice: input.brandVoice,
    banList: input.banList ?? [],
    signaturePhrases: input.signaturePhrases ?? [],
    qualityThreshold: input.qualityThreshold ?? 8.0,
    maxPostsPerWeek: input.maxPostsPerWeek ?? 2,
    scheduleCron: input.scheduleCron ?? "0 6 * * 1,3,5",
    publishDestination: input.publishDestination ?? "built_in",
    wordpressConfig: input.wordpressConfig ?? null,
    author: input.author,
    apiKeys: input.apiKeys ?? {},
  });

  for (let i = 0; i < normalized.length; i++) {
    const p = normalized[i]!;
    await db.insert(pillars).values({
      id: newId("pil"),
      siteId: id,
      slug: p.slug,
      name: p.name,
      weight: p.weight,
      sortOrder: i,
    });
  }

  return (await getSiteById(id))!;
}

export interface UpdateSiteInput extends Partial<Omit<CreateSiteInput, "slug">> {
  slug?: string;
}

export async function updateSite(id: string, input: UpdateSiteInput): Promise<SiteWithPillars> {
  await ensureSchema();
  const db = getDb();
  const current = await getSiteById(id);
  if (!current) throw new Error(`Site ${id} not found`);

  const patch: Partial<typeof sites.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (input.name !== undefined) patch.name = input.name;
  if (input.slug !== undefined) patch.slug = input.slug;
  if (input.domain !== undefined) patch.domain = input.domain;
  if (input.language !== undefined) patch.language = input.language;
  if (input.brandVoice !== undefined) patch.brandVoice = input.brandVoice;
  if (input.banList !== undefined) patch.banList = input.banList;
  if (input.signaturePhrases !== undefined) patch.signaturePhrases = input.signaturePhrases;
  if (input.qualityThreshold !== undefined) patch.qualityThreshold = input.qualityThreshold;
  if (input.maxPostsPerWeek !== undefined) patch.maxPostsPerWeek = input.maxPostsPerWeek;
  if (input.scheduleCron !== undefined) patch.scheduleCron = input.scheduleCron;
  if (input.publishDestination !== undefined) patch.publishDestination = input.publishDestination;
  if (input.wordpressConfig !== undefined) patch.wordpressConfig = input.wordpressConfig;
  if (input.author !== undefined) patch.author = input.author;
  if (input.apiKeys !== undefined) patch.apiKeys = input.apiKeys;
  if (input.features !== undefined) patch.features = input.features;

  await db.update(sites).set(patch).where(eq(sites.id, id));

  if (input.pillars) {
    await db.delete(pillars).where(eq(pillars.siteId, id));
    const totalWeight = input.pillars.reduce((s, p) => s + p.weight, 0);
    for (let i = 0; i < input.pillars.length; i++) {
      const p = input.pillars[i]!;
      await db.insert(pillars).values({
        id: newId("pil"),
        siteId: id,
        slug: p.slug ?? slugify(p.name),
        name: p.name,
        weight: totalWeight > 0 ? p.weight / totalWeight : 1 / input.pillars.length,
        sortOrder: i,
      });
    }
  }

  return (await getSiteById(id))!;
}

export async function deleteSite(id: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.delete(sites).where(eq(sites.id, id));
}
