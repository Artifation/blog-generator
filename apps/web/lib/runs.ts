import { eq, desc } from "drizzle-orm";
import { getDb, ensureSchema } from "./db/client";
import { runs, type Run, type NewRun } from "./db/schema";
import { newId } from "./db/ids";

export async function startRun(siteId: string, topicId?: string | null): Promise<Run> {
  await ensureSchema();
  const db = getDb();
  const id = newId("run");
  const row: NewRun = {
    id,
    siteId,
    topicId: topicId ?? null,
    verdict: "running",
  };
  await db.insert(runs).values(row);
  const rows = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  return rows[0]!;
}

export async function finishRun(
  id: string,
  patch: Partial<Pick<Run, "verdict" | "weightedTotal" | "hardFails" | "reason" | "costUsd" | "stages" | "errorMessage">>
): Promise<Run> {
  await ensureSchema();
  const db = getDb();
  await db
    .update(runs)
    .set({
      ...patch,
      finishedAt: new Date().toISOString(),
    })
    .where(eq(runs.id, id));
  const rows = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  return rows[0]!;
}

export async function listRunsForSite(siteId: string, limit = 50): Promise<Run[]> {
  await ensureSchema();
  const db = getDb();
  return db
    .select()
    .from(runs)
    .where(eq(runs.siteId, siteId))
    .orderBy(desc(runs.startedAt))
    .limit(limit);
}
