"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDraft, rejectDraft, updateDraftContent } from "~/lib/drafts";
import { getSiteById } from "~/lib/sites";
import { publishDraft } from "~/lib/publish";

export async function updateDraftAction(
  draftId: string,
  _revalidate: string | undefined,
  patch: {
    title?: string;
    slug?: string;
    contentHtml?: string;
    metaTitle?: string;
    metaDescription?: string;
    tldr?: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await updateDraftContent(draftId, patch);
    revalidatePath(`/drafts/${draftId}`);
    revalidatePath(`/drafts`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function publishDraftAction(
  draftId: string
): Promise<
  | { ok: true; url: string | null; destination: string; message?: string }
  | { ok: false; error: string }
> {
  const draft = await getDraft(draftId);
  if (!draft) return { ok: false, error: "Draft niet gevonden" };
  const site = await getSiteById(draft.siteId);
  if (!site) return { ok: false, error: "Site niet gevonden" };

  try {
    const result = await publishDraft(draft, site);
    revalidatePath(`/dashboard`);
    revalidatePath(`/drafts`);
    revalidatePath(`/published`);
    revalidatePath(`/blog/${site.slug}`);
    revalidatePath(`/blog/${site.slug}/${draft.slug}`);
    return { ok: true, url: result.url, destination: result.destination, message: result.message };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function rejectDraftAction(draftId: string, reason?: string): Promise<void> {
  await rejectDraft(draftId, reason);
  revalidatePath(`/drafts`);
  redirect(`/drafts`);
}
