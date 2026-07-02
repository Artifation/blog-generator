"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireSite } from "~/lib/auth";
import { markResolved, markUnresolved } from "~/lib/errors/store";

/**
 * Markeer een error-event als opgelost. Vereist een ingelogde sessie.
 *
 * `by` wordt bepaald uit de huidige user, met een nette fallback ("operator")
 * voor demo-sessies waar alleen de site-cookie gezet is.
 */
export async function resolveErrorAction(formData: FormData): Promise<void> {
  const site = await requireSite();
  const id = String(formData.get("id") ?? "").trim();
  const note = (formData.get("note") as string | null) ?? "";
  if (!id) return;
  const user = await getCurrentUser();
  const by = user?.email ?? user?.name ?? "operator";
  // Scope the mutation to the caller's site (markResolved also allows global
  // rows) so one tenant can't resolve another tenant's errors via a forged id.
  await markResolved(id, site.id, by, note.trim() || undefined);
  revalidatePath("/errors");
  revalidatePath(`/errors/${id}`);
}

export async function reopenErrorAction(formData: FormData): Promise<void> {
  const site = await requireSite();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await markUnresolved(id, site.id);
  revalidatePath("/errors");
  revalidatePath(`/errors/${id}`);
}
