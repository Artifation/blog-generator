"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSite, updateSite, deleteSite, type CreateSiteInput, type UpdateSiteInput } from "~/lib/sites";
import { requireSite, getCurrentUser } from "~/lib/auth";
import { roleAtLeast, currentUserHasRole } from "~/lib/auth/roles";
import { lookupInviteCode, consumeInviteCode } from "~/lib/invites";

/**
 * Writing integration secrets (API keys / WordPress credentials) is an
 * owner-only action. Returns an error string when the patch touches secrets
 * and the current user is not an owner, null otherwise.
 */
async function ownerGuardForSecrets(patch: UpdateSiteInput): Promise<string | null> {
  if (patch.apiKeys === undefined && patch.wordpressConfig === undefined) return null;
  const me = await getCurrentUser();
  if (!roleAtLeast(me?.role, "owner")) {
    return "Alleen eigenaren kunnen integraties en sleutels wijzigen.";
  }
  return null;
}

export async function createSiteAction(
  input: CreateSiteInput,
  inviteCode?: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  // Onboarding runs before a session exists, so this action is session-less.
  // The anonymous-mass-creation hole is closed by requiring a valid, unconsumed
  // single-use invite code, claimed atomically here.
  const code = (inviteCode ?? "").trim();
  if (!code) return { ok: false, error: "Een geldige uitnodigingscode is vereist." };
  const info = await lookupInviteCode(code);
  if (!info) return { ok: false, error: "Uitnodigingscode is ongeldig of al gebruikt." };
  try {
    const site = await createSite(input);
    const claimed = await consumeInviteCode(code, site.id);
    if (!claimed) {
      // Race: another request claimed the code between lookup and consume.
      await deleteSite(site.id);
      return { ok: false, error: "Uitnodigingscode is zojuist al gebruikt." };
    }
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
  // Ownership: the session is bound to exactly one site. Never trust the
  // client-supplied id — it must match the session's site.
  const current = await requireSite();
  if (current.id !== id) return { ok: false, error: "Geen toegang tot deze site." };
  // Config writes require at least editor. Viewers are read-only; secrets stay
  // owner-only via ownerGuardForSecrets below.
  if (!(await currentUserHasRole("editor")))
    return { ok: false, error: "Alleen editors of eigenaren kunnen instellingen wijzigen." };
  const secErr = await ownerGuardForSecrets(input);
  if (secErr) return { ok: false, error: secErr };
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
  // Destructive + cross-tenant: require the session to own this site AND to be
  // an owner of it.
  const current = await requireSite();
  if (current.id !== id) redirect("/settings");
  const me = await getCurrentUser();
  if (!roleAtLeast(me?.role, "owner")) redirect("/settings");
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
  const current = await requireSite();
  if (current.id !== id) return { ok: false, error: "Geen toegang tot deze site." };
  if (!(await currentUserHasRole("editor")))
    return { ok: false, error: "Alleen editors of eigenaren kunnen instellingen wijzigen." };
  const secErr = await ownerGuardForSecrets(partial);
  if (secErr) return { ok: false, error: secErr };
  try {
    await updateSite(id, partial);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
