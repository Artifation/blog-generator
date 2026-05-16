"use server";

import { revalidatePath } from "next/cache";
import { createTopic, updateTopic, deleteTopic, type CreateTopicInput } from "~/lib/topics";
import { getSiteBySlug } from "~/lib/sites";

export async function createTopicAction(
  siteSlug: string,
  input: Omit<CreateTopicInput, "siteId">
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const site = await getSiteBySlug(siteSlug);
  if (!site) return { ok: false, error: `Site ${siteSlug} niet gevonden` };
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
  try {
    await updateTopic(topicId, patch);
    revalidatePath(`/topics`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteTopicAction(_siteSlug: string, topicId: string): Promise<void> {
  await deleteTopic(topicId);
  revalidatePath(`/topics`);
}
