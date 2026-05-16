import { eq, and, asc, desc } from "drizzle-orm";
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
  await db.update(topics).set(patch).where(eq(topics.id, id));
  return (await getTopic(id))!;
}

export async function deleteTopic(id: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.delete(topics).where(eq(topics.id, id));
}
