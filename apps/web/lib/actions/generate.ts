"use server";

import { revalidatePath } from "next/cache";
import { getSiteBySlug } from "~/lib/sites";
import { getTopic, updateTopic } from "~/lib/topics";
import { runForSite } from "~/lib/pipeline/runForSite";

export async function generateForTopicAction(
  siteSlug: string,
  topicId: string
): Promise<
  | { ok: true; draftId: string | null; verdict: string; runId: string; reason?: string }
  | { ok: false; error: string }
> {
  const site = await getSiteBySlug(siteSlug);
  if (!site) return { ok: false, error: `Site ${siteSlug} niet gevonden` };

  const topic = await getTopic(topicId);
  if (!topic || topic.siteId !== site.id)
    return { ok: false, error: "Topic niet gevonden voor deze site" };

  // Alleen Gemini is écht verplicht — andere providers worden gegraciously
  // overgeslagen via resolveAgentModel(role, registry) in de pipeline.
  const geminiKey = site.apiKeys?.gemini ?? process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return {
      ok: false,
      error:
        "Gemini API-key vereist. Vul 'm in onder Instellingen → Integraties.",
    };
  }

  try {
    await updateTopic(topicId, { status: "in_progress" });
    const result = await runForSite(site, topic);

    revalidatePath(`/dashboard`);
    revalidatePath(`/topics`);
    revalidatePath(`/drafts`);
    revalidatePath(`/runs`);

    return {
      ok: true,
      draftId: result.draftId,
      verdict: result.verdict,
      runId: result.runId,
      reason: result.reason,
    };
  } catch (err) {
    await updateTopic(topicId, { status: "queued", rejectReason: (err as Error).message });
    return { ok: false, error: (err as Error).message };
  }
}
