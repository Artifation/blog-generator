"use server";

import { revalidatePath } from "next/cache";
import { createTopic, updateTopic, deleteTopic, getTopic, type CreateTopicInput } from "~/lib/topics";
import { requireSite } from "~/lib/auth";

export async function createTopicAction(
  siteSlug: string,
  input: Omit<CreateTopicInput, "siteId">
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  // Always create against the SESSION's site, never the client-supplied slug.
  const site = await requireSite();
  if (siteSlug && site.slug !== siteSlug) return { ok: false, error: "Geen toegang tot deze site." };
  try {
    const t = await createTopic({ ...input, siteId: site.id });
    revalidatePath(`/topics`);
    revalidatePath(`/dashboard`);
    return { ok: true, id: t.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function updateTopicAction(
  topicId: string,
  patch: Parameters<typeof updateTopic>[1]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const site = await requireSite();
  const topic = await getTopic(topicId);
  if (!topic || topic.siteId !== site.id) return { ok: false, error: "Topic niet gevonden" };
  try {
    await updateTopic(topicId, patch);
    revalidatePath(`/topics`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteTopicAction(_siteSlug: string, topicId: string): Promise<void> {
  const site = await requireSite();
  const topic = await getTopic(topicId);
  if (!topic || topic.siteId !== site.id) return;
  await deleteTopic(topicId);
  revalidatePath(`/topics`);
}
