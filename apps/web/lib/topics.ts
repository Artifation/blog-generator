import { eq, and, asc, desc, sql } from "drizzle-orm";
import { getDb, ensureSchema } from "./db/client";
import { topics, type Topic } from "./db/schema";
import { newId } from "./db/ids";

export async function listTopicsForSite(siteId: string, status?: Topic["status"]): Promise<Topic[]> {
  await ensureSchema();
  const db = getDb();
  const where = status
    ? and(eq(topics.siteId, siteId), eq(topics.status, status))
    : eq(topics.siteId, siteId);
  return db
    .select()
    .from(topics)
    .where(where)
    .orderBy(desc(topics.priority), asc(topics.createdAt));
}

export async function getTopic(id: string): Promise<Topic | null> {
  await ensureSchema();
  const db = getDb();
  const rows = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface CreateTopicInput {
  siteId: string;
  title: string;
  targetKeyword: string;
  pillarSlug: string;
  intent?: "informational" | "commercial" | "transactional";
  intendedWordCount?: number;
  priority?: number;
  proposalSource?:
    | "competitor_sitemap"
    | "gsc_rising_query"
    | "gsc_striking_distance"
    | "gsc_unmapped_query"
    | "dataforseo_keyword_idea"
    | "manual";
  proposalRationale?: string;
  customInstructions?: string | null;
}

export async function createTopic(input: CreateTopicInput): Promise<Topic> {
  await ensureSchema();
  const db = getDb();
  const id = newId("top");
  await db.insert(topics).values({
    id,
    siteId: input.siteId,
    title: input.title,
    targetKeyword: input.targetKeyword,
    pillarSlug: input.pillarSlug,
    intent: input.intent ?? "informational",
    intendedWordCount: input.intendedWordCount ?? 1500,
    priority: input.priority ?? 0,
    proposalSource: input.proposalSource,
    proposalRationale: input.proposalRationale,
    proposedAt: input.proposalSource ? new Date().toISOString() : undefined,
    customInstructions: input.customInstructions ?? null,
  });
  return (await getTopic(id))!;
}

export async function updateTopic(
  id: string,
  input: Partial<CreateTopicInput> & { status?: Topic["status"]; rejectReason?: string | null }
): Promise<Topic> {
  await ensureSchema();
  const db = getDb();
  const patch: Partial<typeof topics.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.targetKeyword !== undefined) patch.targetKeyword = input.targetKeyword;
  if (input.pillarSlug !== undefined) patch.pillarSlug = input.pillarSlug;
  if (input.intent !== undefined) patch.intent = input.intent;
  if (input.intendedWordCount !== undefined) patch.intendedWordCount = input.intendedWordCount;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.status !== undefined) patch.status = input.status;
  if (input.rejectReason !== undefined) patch.rejectReason = input.rejectReason ?? null;
  if (input.customInstructions !== undefined) {
    patch.customInstructions = input.customInstructions ?? null;
  }
  await db.update(topics).set(patch).where(eq(topics.id, id));
  return (await getTopic(id))!;
}

/**
 * Atomically claim a queued topic for a pipeline run: flip `queued -> in_progress`
 * in a single UPDATE and report whether THIS caller won the claim. SQLite
 * serializes writes, so when two entry points (cron tick, UI "Run next" button,
 * a second process/container) select the same queued topic, only the first
 * UPDATE matches `status='queued'`; the rest get `false` and must skip. This is
 * the cross-process mutex the in-memory scheduler Set could never provide.
 *
 * The caller is responsible for releasing the claim (back to `queued`) if the
 * run aborts, so an errored run doesn't strand the topic in `in_progress`.
 */
export async function claimTopicForRun(id: string): Promise<boolean> {
  await ensureSchema();
  const db = getDb();
  const claimed = await db
    .update(topics)
    .set({ status: "in_progress", updatedAt: new Date().toISOString() })
    .where(and(eq(topics.id, id), eq(topics.status, "queued")))
    .returning({ id: topics.id });
  return claimed.length > 0;
}

export async function deleteTopic(id: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.delete(topics).where(eq(topics.id, id));
}

/**
 * Recover topics stranded in `in_progress` by a hard-killed run: reset them to
 * `queued` so the scheduler (which only selects `queued`) can pick them up
 * again. SAFELY leaves alone any topic that legitimately sits in_progress while
 * a draft awaits review — those have a pending_review/published draft — so this
 * never re-runs (and double-charges) an awaiting-review topic. Only reaps rows
 * whose last update is older than `olderThanMs`. Returns the number reset.
 */
export async function resetStaleInProgressTopics(olderThanMs: number): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const now = new Date().toISOString();
  const res = await db.run(sql`
    UPDATE topics
    SET status = 'queued', updated_at = ${now}
    WHERE status = 'in_progress'
      AND updated_at < ${cutoff}
      AND id NOT IN (
        SELECT topic_id FROM drafts
        WHERE topic_id IS NOT NULL AND status IN ('pending_review', 'published')
      )
  `);
  return (res as { rowsAffected?: number }).rowsAffected ?? 0;
}
