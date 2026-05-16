"use server";

import { revalidatePath } from "next/cache";
import { requireSite } from "~/lib/auth";
import { listTopicsForSite } from "~/lib/topics";
import { runForSite } from "~/lib/pipeline/runForSite";

export async function runNextQueuedAction(): Promise<
  | { ok: true; verdict: string; draftId: string | null; topicTitle: string; reason?: string }
  | { ok: false; error: string }
> {
  const site = await requireSite();
  if (!site.apiKeys?.anthropic || !site.apiKeys?.gemini || !site.apiKeys?.groq) {
    return { ok: false, error: "Mist verplichte API-keys (Anthropic, Gemini, Groq)." };
  }
  const queued = await listTopicsForSite(site.id, "queued");
  if (queued.length === 0) {
    return { ok: false, error: "Geen queued topics — voeg eerst topics toe." };
  }
  const topic = queued.sort(
    (a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt)
  )[0]!;
  const result = await runForSite(site, topic);
  revalidatePath("/dashboard");
  revalidatePath("/topics");
  revalidatePath("/drafts");
  revalidatePath("/runs");
  return {
    ok: true,
    verdict: result.verdict,
    draftId: result.draftId,
    topicTitle: topic.title,
    reason: result.reason,
  };
}
