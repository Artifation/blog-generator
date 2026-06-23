"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDraft, rejectDraft, updateDraftContent } from "~/lib/drafts";
import { publishDraft } from "~/lib/publish";
import { requireSite } from "~/lib/auth";

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
  // Ownership: server actions are directly-invocable POST endpoints, so the
  // page-level guard is not enough — verify the draft belongs to the session.
  const site = await requireSite();
  const draft = await getDraft(draftId);
  if (!draft || draft.siteId !== site.id) return { ok: false, error: "Draft niet gevonden" };
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
  // Derive the site from the SESSION (not from the draft) and confirm the
  // draft belongs to it — otherwise any draftId could be force-published.
  const site = await requireSite();
  const draft = await getDraft(draftId);
  if (!draft || draft.siteId !== site.id) return { ok: false, error: "Draft niet gevonden" };

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
  const site = await requireSite();
  const draft = await getDraft(draftId);
  if (!draft || draft.siteId !== site.id) redirect(`/drafts`);
  await rejectDraft(draftId, reason);
  revalidatePath(`/drafts`);
  redirect(`/drafts`);
}
