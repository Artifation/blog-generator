"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearSessionCookies,
  setSessionCookies,
  validateInviteCode,
  type InviteCodeInfo,
} from "~/lib/auth";
import { getSiteBySlug } from "~/lib/sites";
import { authenticate, findUserByEmail, createUser, listUsersForSite } from "~/lib/users";

/**
 * Quick-login for the demo sites listed on the login page. Bypasses the
 * password check. NOT for production — keep behind a feature flag IRL.
 */
export async function loginAction(siteSlug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const site = await getSiteBySlug(siteSlug);
  if (!site) return { ok: false, error: "Site niet gevonden." };
  await setSessionCookies(site.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Real email + password login. Looks up the user across all sites and sets
 * both site- and user-cookies on success.
 */
export async function loginWithPasswordAction(
  email: string,
  password: string
): Promise<{ ok: true; siteSlug: string } | { ok: false; error: string }> {
  if (!email || !password) return { ok: false, error: "E-mail en wachtwoord zijn verplicht." };
  const auth = await authenticate(email, password);
  if (!auth) return { ok: false, error: "Ongeldige e-mail of wachtwoord." };
  const { user } = auth;
  await setSessionCookies(user.siteId, user.id);
  // We still want the slug for the toast / redirect, look it up.
  const sites = await import("~/lib/sites").then((m) => m.getSiteById(user.siteId));
  if (!sites) return { ok: false, error: "Site weg." };
  revalidatePath("/", "layout");
  return { ok: true, siteSlug: sites.slug };
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookies();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function checkInviteCodeAction(
  code: string
): Promise<{ ok: true; info: InviteCodeInfo } | { ok: false; error: string }> {
  const info = validateInviteCode(code);
  if (!info) return { ok: false, error: "Deze code is niet geldig. Neem contact op met Artifation." };
  return { ok: true, info };
}

/**
 * Called from the onboarding wizard right after the site is created. Creates
 * the first user as the site owner.
 */
export async function createOwnerUserAction(
  siteSlug: string,
  input: { email: string; password: string; name: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const site = await getSiteBySlug(siteSlug);
  if (!site) return { ok: false, error: "Site niet gevonden." };
  const existing = await findUserByEmail(site.id, input.email);
  if (existing) return { ok: false, error: "E-mail is al in gebruik." };
  const user = await createUser({
    siteId: site.id,
    email: input.email,
    password: input.password,
    name: input.name,
    role: "owner",
  });
  await setSessionCookies(site.id, user.id);
  return { ok: true };
}

export async function inviteUserAction(
  email: string,
  name: string,
  role: "owner" | "editor" | "viewer",
  tempPassword: string
): Promise<{ ok: true; tempPassword: string } | { ok: false; error: string }> {
  const { requireSite, getCurrentUser } = await import("~/lib/auth");
  const site = await requireSite();
  const inviter = await getCurrentUser();
  if (!email || !email.includes("@")) return { ok: false, error: "Ongeldig e-mailadres." };
  if (tempPassword.length < 6) return { ok: false, error: "Tijdelijk wachtwoord min. 6 tekens." };
  const existing = await findUserByEmail(site.id, email);
  if (existing) return { ok: false, error: "Deze gebruiker bestaat al op deze site." };
  await createUser({
    siteId: site.id,
    email,
    password: tempPassword,
    name,
    role,
    invitedBy: inviter?.id,
  });
  revalidatePath("/settings");
  return { ok: true, tempPassword };
}

export async function removeUserAction(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { requireSite, getCurrentUser } = await import("~/lib/auth");
  const site = await requireSite();
  const me = await getCurrentUser();
  if (me?.id === userId) return { ok: false, error: "Je kunt jezelf niet verwijderen." };
  const users = await listUsersForSite(site.id);
  const target = users.find((u) => u.id === userId);
  if (!target) return { ok: false, error: "Gebruiker niet gevonden." };
  const { deleteUser } = await import("~/lib/users");
  await deleteUser(userId);
  revalidatePath("/settings");
  return { ok: true };
}
