import { eq, and, desc } from "drizzle-orm";
import { getDb, ensureSchema } from "./db/client";
import { drafts, publishedPosts, topics, type Draft, type PublishedPost } from "./db/schema";
import { newId } from "./db/ids";

export async function listDraftsForSite(siteId: string, status?: Draft["status"]): Promise<Draft[]> {
  await ensureSchema();
  const db = getDb();
  const where = status
    ? and(eq(drafts.siteId, siteId), eq(drafts.status, status))
    : eq(drafts.siteId, siteId);
  return db.select().from(drafts).where(where).orderBy(desc(drafts.createdAt));
}

export async function getDraft(id: string): Promise<Draft | null> {
  await ensureSchema();
  const db = getDb();
  const rows = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Most recent rejected draft for the given topic, or null. Used by the
 * pipeline's retry-feedback loop so the writer can see which specific
 * claims the factChecker flagged on the previous attempt and avoid them.
 */
export async function getLatestRejectedDraftForTopic(topicId: string): Promise<Draft | null> {
  await ensureSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.topicId, topicId), eq(drafts.status, "rejected")))
    .orderBy(desc(drafts.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export interface CreateDraftInput {
  siteId: string;
  topicId?: string | null;
  runId?: string | null;
  title: string;
  slug: string;
  contentHtml: string;
  metaTitle?: string;
  metaDescription?: string;
  tldr?: string;
  imagePath?: string | null;
  imageAlt?: string | null;
  rubricScores?: Record<string, number> | null;
  weightedTotal?: number | null;
  hardFails?: string[];
  costUsd?: number | null;
  /** Defaults to "pending_review". Pipeline reject path uses "rejected" so
   * the draft surfaces in the Recent section instead of being thrown away. */
  status?: Draft["status"];
}

export async function createDraft(input: CreateDraftInput): Promise<Draft> {
  await ensureSchema();
  const db = getDb();
  const id = newId("dft");
  await db.insert(drafts).values({
    id,
    siteId: input.siteId,
    topicId: input.topicId ?? null,
    runId: input.runId ?? null,
    title: input.title,
    slug: input.slug,
    contentHtml: input.contentHtml,
    metaTitle: input.metaTitle ?? "",
    metaDescription: input.metaDescription ?? "",
    tldr: input.tldr ?? "",
    imagePath: input.imagePath ?? null,
    imageAlt: input.imageAlt ?? null,
    rubricScores: input.rubricScores ?? null,
    weightedTotal: input.weightedTotal ?? null,
    hardFails: input.hardFails ?? [],
    costUsd: input.costUsd ?? null,
    status: input.status ?? "pending_review",
  });
  return (await getDraft(id))!;
}

export async function updateDraftContent(
  id: string,
  patch: {
    title?: string;
    slug?: string;
    contentHtml?: string;
    metaTitle?: string;
    metaDescription?: string;
    tldr?: string;
  }
): Promise<Draft> {
  await ensureSchema();
  const db = getDb();
  const data: Partial<typeof drafts.$inferInsert> = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.slug !== undefined) data.slug = patch.slug;
  if (patch.contentHtml !== undefined) data.contentHtml = patch.contentHtml;
  if (patch.metaTitle !== undefined) data.metaTitle = patch.metaTitle;
  if (patch.metaDescription !== undefined) data.metaDescription = patch.metaDescription;
  if (patch.tldr !== undefined) data.tldr = patch.tldr;
  await db.update(drafts).set(data).where(eq(drafts.id, id));
  return (await getDraft(id))!;
}

export async function rejectDraft(id: string, reason?: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db
    .update(drafts)
    .set({ status: "rejected", reviewedAt: new Date().toISOString() })
    .where(eq(drafts.id, id));
  const draft = await getDraft(id);
  if (draft?.topicId) {
    await db
      .update(topics)
      .set({
        status: "rejected",
        rejectReason: reason ?? "manually rejected",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(topics.id, draft.topicId));
  }
}

export interface PublishedPostInput {
  draftId: string;
  externalUrl?: string | null;
  externalId?: string | null;
}

export async function publishDraftBuiltIn(input: PublishedPostInput): Promise<PublishedPost> {
  await ensureSchema();
  const db = getDb();
  const draft = await getDraft(input.draftId);
  if (!draft) throw new Error(`Draft ${input.draftId} not found`);
  const id = newId("pub");
  let pillarSlug = "";
  let targetKeyword = "";
  if (draft.topicId) {
    const trows = await db.select().from(topics).where(eq(topics.id, draft.topicId)).limit(1);
    const t = trows[0];
    pillarSlug = t?.pillarSlug ?? "";
    targetKeyword = t?.targetKeyword ?? "";
  }
  await db.insert(publishedPosts).values({
    id,
    siteId: draft.siteId,
    draftId: draft.id,
    slug: draft.slug,
    title: draft.title,
    contentHtml: draft.contentHtml,
    metaTitle: draft.metaTitle,
    metaDescription: draft.metaDescription,
    tldr: draft.tldr,
    imagePath: draft.imagePath,
    imageAlt: draft.imageAlt,
    targetKeyword,
    pillarSlug,
    externalUrl: input.externalUrl ?? null,
    externalId: input.externalId ?? null,
  });

  await db
    .update(drafts)
    .set({ status: "published", reviewedAt: new Date().toISOString() })
    .where(eq(drafts.id, draft.id));

  if (draft.topicId) {
    await db
      .update(topics)
      .set({
        status: "published",
        publishedDraftId: draft.id,
        publishedUrl: input.externalUrl ?? `/${draft.slug}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(topics.id, draft.topicId));
  }

  const rows = await db.select().from(publishedPosts).where(eq(publishedPosts.id, id)).limit(1);
  return rows[0]!;
}

export async function listPublishedPostsForSite(siteId: string): Promise<PublishedPost[]> {
  await ensureSchema();
  const db = getDb();
  return db
    .select()
    .from(publishedPosts)
    .where(eq(publishedPosts.siteId, siteId))
    .orderBy(desc(publishedPosts.publishedAt));
}

/**
 * Aantal posts gepubliceerd in de huidige ISO-week (maandag-zondag UTC) voor
 * deze site. Gebruikt door de cap-check in runForSite om dure LLM-runs te
 * voorkomen wanneer de site al z'n week-cap heeft bereikt.
 */
export async function countPublishedThisIsoWeekForSite(
  siteId: string,
  now: Date = new Date()
): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const weekStart = startOfIsoWeekUtc(now).toISOString();
  const weekEnd = new Date(startOfIsoWeekUtc(now).getTime() + 7 * 86_400_000).toISOString();
  const all = await db
    .select()
    .from(publishedPosts)
    .where(eq(publishedPosts.siteId, siteId));
  return all.filter((p) => p.publishedAt >= weekStart && p.publishedAt < weekEnd).length;
}

function startOfIsoWeekUtc(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // Zondag = 7
  date.setUTCDate(date.getUTCDate() - (day - 1));
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function getPublishedPostBySlug(
  siteId: string,
  slug: string
): Promise<PublishedPost | null> {
  await ensureSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(publishedPosts)
    .where(and(eq(publishedPosts.siteId, siteId), eq(publishedPosts.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}
