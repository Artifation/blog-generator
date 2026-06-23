"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSite, updateSite, deleteSite, type CreateSiteInput, type UpdateSiteInput } from "~/lib/sites";

export async function createSiteAction(
  input: CreateSiteInput
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  try {
    const site = await createSite(input);
    revalidatePath("/sites");
    return { ok: true, slug: site.slug };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function updateSiteAction(
  id: string,
  input: UpdateSiteInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const site = await updateSite(id, input);
    revalidatePath("/sites");
    revalidatePath(`/sites/${site.slug}`);
    revalidatePath(`/sites/${site.slug}/settings`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteSiteAction(id: string): Promise<void> {
  await deleteSite(id);
  revalidatePath("/sites");
  redirect("/sites");
}

/**
 * Partial site update — used by the settings page auto-save hook to save
 * one card-worth of fields at a time. Intentionally skips revalidatePath
 * calls because the user is on /settings; the new value is already in
 * React state and other routes don't need invalidation per keystroke.
 */
export async function patchSiteAction(
  id: string,
  partial: UpdateSiteInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await updateSite(id, partial);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
