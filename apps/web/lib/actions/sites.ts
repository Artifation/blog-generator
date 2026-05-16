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
