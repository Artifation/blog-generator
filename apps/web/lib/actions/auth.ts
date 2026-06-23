"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearSessionCookies,
  getClientIp,
  getCurrentUser,
  requireSite,
  requireUser,
  setSessionCookies,
  validateInviteCode,
  type InviteCodeInfo,
} from "~/lib/auth";
import { getSiteBySlug, getSiteById } from "~/lib/sites";
import {
  authenticate,
  findUserByEmail,
  createUser,
  listUsersForSite,
  recordLogin,
} from "~/lib/users";
import {
  checkRateLimit,
  recordAttempt,
  retryMinutes,
} from "~/lib/auth/rate-limit";
import {
  hasCredential,
  setPassword,
  verifyAndUpgrade,
} from "~/lib/auth/credentials";
import { validatePasswordStrength } from "~/lib/auth/password";
import { deleteSessionsForUser } from "~/lib/auth/session";

/**
 * Quick-login for the demo sites listed on the login page. Bypasses the
 * password check.
 *
 * Locked down: only usable in non-production builds, AND only if no user on
 * that site has yet set a real password (i.e. fresh demo state). Once an
 * admin has set a password, this back-door closes for that site.
 */
export async function loginAction(siteSlug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "Demo-login is uitgeschakeld in productie. Gebruik je wachtwoord." };
  }
  const site = await getSiteBySlug(siteSlug);
  if (!site) return { ok: false, error: "Site niet gevonden." };

  // If any owner-user on this site has set a real password, refuse the
  // demo bypass.
  const users = await listUsersForSite(site.id);
  for (const u of users) {
    if (await hasCredential(u.id)) {
      return {
        ok: false,
        error: "Deze site heeft een wachtwoord ingesteld — log in via e-mail + wachtwoord.",
      };
    }
  }

  await setSessionCookies(site.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Real email + password login. Looks up the user across all sites, enforces
 * a per-IP sliding-window rate-limit, and sets the session cookies on
 * success.
 */
export async function loginWithPasswordAction(
  email: string,
  password: string,
): Promise<{ ok: true; siteSlug: string } | { ok: false; error: string }> {
  if (!email || !password) {
    return { ok: false, error: "E-mail en wachtwoord zijn verplicht." };
  }

  const ip = await getClientIp();
  const gate = await checkRateLimit(ip);
  if (!gate.allowed) {
    const mins = retryMinutes(gate.retryAfterMs);
    return {
      ok: false,
      error: `Te veel mislukte pogingen. Probeer het over ${mins} min opnieuw.`,
    };
  }

  // Use the credential-aware authenticate path so legacy users get auto-
  // upgraded into `user_credentials` on their first successful login.
  const auth = await authenticateWithCredentials(email, password);
  if (!auth) {
    await recordAttempt(ip, false, email);
    return { ok: false, error: "Ongeldige e-mail of wachtwoord." };
  }

  await recordAttempt(ip, true, email);
  const { user } = auth;
  await setSessionCookies(user.siteId, user.id);
  await recordLogin(user.id);
  const site = await getSiteById(user.siteId);
  if (!site) return { ok: false, error: "Site weg." };
  revalidatePath("/", "layout");
  return { ok: true, siteSlug: site.slug };
}

/**
 * Internal: like `authenticate()` but routes through the new
 * `user_credentials` table (with legacy fallback + auto-upgrade).
 */
async function authenticateWithCredentials(
  email: string,
  plain: string,
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof findUserByEmail>>> } | null> {
  // Find any user with this email (across sites).
  const { findUserAnyEmail } = await import("~/lib/users");
  const user = await findUserAnyEmail(email);
  if (!user) return null;
  const ok = await verifyAndUpgrade(user.id, user.passwordHash, plain);
  if (!ok) return null;
  return { user };
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookies();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Server-side logout that doesn't redirect — used by API/route-handlers or
 * tests that need to clear cookies without a navigation.
 */
export async function clearSessionAction(): Promise<{ ok: true }> {
  await clearSessionCookies();
  return { ok: true };
}

export async function checkInviteCodeAction(
  code: string,
): Promise<{ ok: true; info: InviteCodeInfo } | { ok: false; error: string }> {
  const info = validateInviteCode(code);
  if (!info) return { ok: false, error: "Deze code is niet geldig. Neem contact op met Artifation." };
  return { ok: true, info };
}

/**
 * Called from the onboarding wizard right after the site is created. Creates
 * the first user as the site owner AND writes the initial credential row so
 * invite codes are no longer a valid login path for them.
 */
export async function createOwnerUserAction(
  siteSlug: string,
  input: { email: string; password: string; name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const site = await getSiteBySlug(siteSlug);
  if (!site) return { ok: false, error: "Site niet gevonden." };

  const strength = validatePasswordStrength(input.password);
  if (!strength.ok) return { ok: false, error: strength.error };

  const existing = await findUserByEmail(site.id, input.email);
  if (existing) return { ok: false, error: "E-mail is al in gebruik." };

  const user = await createUser({
    siteId: site.id,
    email: input.email,
    password: input.password,
    name: input.name,
    role: "owner",
  });

  // Anchor the password into user_credentials so demo-login is now closed
  // off and future logins require this password.
  await setPassword(user.id, input.password);

  await setSessionCookies(site.id, user.id);
  return { ok: true };
}

/**
 * Self-service password set/change. Used both for the initial password set
 * (when `currentPassword` may be `null` because the user is on a legacy
 * account without a credential row) and for routine rotation.
 */
export async function setPasswordAction(
  currentPassword: string | null,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Niet ingelogd." };

  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) return { ok: false, error: strength.error };

  const existing = await hasCredential(me.id);
  if (existing) {
    if (!currentPassword) {
      return { ok: false, error: "Huidig wachtwoord is verplicht." };
    }
    const ok = await verifyAndUpgrade(me.id, me.passwordHash, currentPassword);
    if (!ok) return { ok: false, error: "Huidig wachtwoord klopt niet." };
  } else if (currentPassword) {
    // No credential row yet — but if a legacy hash exists, still demand the
    // user proves they know it (safer than trusting a stale cookie).
    if (me.passwordHash) {
      const ok = await verifyAndUpgrade(me.id, me.passwordHash, currentPassword);
      if (!ok) return { ok: false, error: "Huidig wachtwoord klopt niet." };
    }
  }

  await setPassword(me.id, newPassword);
  // Changing the password revokes every existing session (logout-everywhere),
  // then re-establishes the current device's session so the user stays signed
  // in here. A leaked/old cookie stops working immediately.
  await deleteSessionsForUser(me.id);
  await setSessionCookies(me.siteId, me.id);
  revalidatePath("/account");
  revalidatePath("/account/security");
  return { ok: true };
}

export async function inviteUserAction(
  email: string,
  name: string,
  role: "owner" | "editor" | "viewer",
  tempPassword: string,
): Promise<{ ok: true; tempPassword: string } | { ok: false; error: string }> {
  const site = await requireSite();
  const inviter = await requireUser();
  if (!email || !email.includes("@")) return { ok: false, error: "Ongeldig e-mailadres." };
  if (tempPassword.length < 6) return { ok: false, error: "Tijdelijk wachtwoord min. 6 tekens." };
  const existing = await findUserByEmail(site.id, email);
  if (existing) return { ok: false, error: "Deze gebruiker bestaat al op deze site." };
  const created = await createUser({
    siteId: site.id,
    email,
    password: tempPassword,
    name,
    role,
    invitedBy: inviter.id,
  });
  // Anchor the temp password into user_credentials too so the invitee can
  // log in via /login on day one.
  await setPassword(created.id, tempPassword);
  revalidatePath("/settings");
  return { ok: true, tempPassword };
}

export async function removeUserAction(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const site = await requireSite();
  const me = await getCurrentUser();
  if (me?.id === userId) return { ok: false, error: "Je kunt jezelf niet verwijderen." };
  const users = await listUsersForSite(site.id);
  const target = users.find((u) => u.id === userId);
  if (!target) return { ok: false, error: "Gebruiker niet gevonden." };
  const { deleteUser } = await import("~/lib/users");
  // Revoke the removed user's sessions explicitly (libsql does not enable FK
  // cascades by default, so we can't rely on ON DELETE CASCADE here).
  await deleteSessionsForUser(userId);
  await deleteUser(userId);
  revalidatePath("/settings");
  return { ok: true };
}

// Keep a reference to silence the unused import warning when `authenticate`
// is dead-code (current callers all go through credentials).
export { authenticate };
