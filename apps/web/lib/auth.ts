import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSiteById, type SiteWithPillars } from "./sites";
import { findUserById } from "./users";
import type { User, Session } from "./db/schema";
import {
  createSession,
  getSession,
  refreshSessionIfStale,
  deleteSession,
} from "./auth/session";

/** Opaque server-side session token cookie. The value is NOT an id. */
const SESSION_TOKEN_COOKIE = "artifation_session";
// Legacy cookies from the old "cookie value IS the site/user id" scheme. Never
// trusted for auth any more — only cleared on logout so stale browsers shed them.
const LEGACY_SITE_COOKIE = "artifation_site";
const LEGACY_USER_COOKIE = "artifation_user";

/** 30 days, sliding — mirrors SESSION_TTL_MS in auth/session.ts. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Invite codes hardcoded for the demo flow.
 * In a real deployment these would live in a database and be generated per customer.
 *
 * NOTE: Since the password-based auth migration, invite codes are ONLY valid
 * for onboarding NEW sites (via /activate → wizard). Once a user has set a
 * password (a row exists in `user_credentials` for that user), they MUST log
 * in via /login with email + password — invite codes will not authenticate
 * an existing user.
 */
export const INVITE_CODES: Record<string, InviteCodeInfo> = {
  "ARTI-2026-GVDD": {
    company: "Garage van Dam",
    email: "carla@garagevandam.nl",
    name: "Carla Bekker",
    plan: "pro",
    domain: "garagevandam.nl",
  },
  "ARTI-2026-TEST": {
    company: "Test Bedrijf",
    email: "test@bedrijf.nl",
    name: "Test Gebruiker",
    plan: "starter",
    domain: "bedrijf.nl",
  },
  "ARTI-2026-NRDZ": {
    company: "Noordzee Digital",
    email: "julian@noordzee.digital",
    name: "Julian Dunsbergen",
    plan: "pro",
    domain: "noordzee.digital",
  },
  // Generieke codes om uit te delen. Lege velden = de klant vult zelf
  // bedrijf/email/naam/domein in tijdens onboarding (de activate-form toont
  // bewerkbare velden zodra email leeg is).
  "ARTI-2026-ZFF2": { company: "", email: "", name: "", plan: "pro", domain: "" },
  "ARTI-2026-27F6": { company: "", email: "", name: "", plan: "pro", domain: "" },
  "ARTI-2026-HA7X": { company: "", email: "", name: "", plan: "pro", domain: "" },
};

export interface InviteCodeInfo {
  company: string;
  email: string;
  name: string;
  plan: "starter" | "pro" | "custom";
  domain: string;
}

/**
 * Whether to set the `Secure` flag on session cookies. Secure cookies are
 * ONLY sent/stored over HTTPS — on a plain-HTTP deployment (e.g. an IP-only
 * VPS without a reverse proxy yet) the browser silently drops them, which
 * breaks the session and bounces the user back to /login.
 *
 *   SESSION_COOKIE_SECURE=false  → never set Secure (HTTP deployments)
 *   SESSION_COOKIE_SECURE=true   → always set Secure
 *   (unset)                      → Secure in production, plain in dev
 *
 * Once you put the app behind HTTPS (Caddy/Traefik), drop the override so it
 * defaults back to Secure in production.
 */
function cookieSecure(): boolean {
  const flag = process.env.SESSION_COOKIE_SECURE;
  if (flag === "false") return false;
  if (flag === "true") return true;
  return process.env.NODE_ENV === "production";
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export async function setSessionCookies(siteId: string, userId?: string): Promise<void> {
  // Mint a fresh server-side session and hand the browser only the opaque
  // token. The (siteId, userId) binding lives in the DB, not the cookie.
  const token = await createSession(siteId, userId);
  const c = await cookies();
  c.set(SESSION_TOKEN_COOKIE, token, cookieOptions());
  // Shed any legacy id-bearing cookies from the old scheme.
  c.delete(LEGACY_SITE_COOKIE);
  c.delete(LEGACY_USER_COOKIE);
}

/**
 * Resolve the current request's session from its token cookie. Returns null
 * when there is no token, or the token is unknown/expired (a forged or stale
 * cookie therefore never authenticates). Slides the server-side expiry
 * (throttled to ~once/day) and refreshes the cookie maxAge on activity; the
 * cookie write is best-effort because read-only RSC contexts can't mutate it.
 */
async function currentSession(): Promise<Session | null> {
  const c = await cookies();
  const token = c.get(SESSION_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  if (await refreshSessionIfStale(session)) {
    try {
      c.set(SESSION_TOKEN_COOKIE, token, cookieOptions());
    } catch {
      // Read-only request context — the next mutating request refreshes it.
    }
  }
  return session;
}

// Backwards-compat alias used by existing callers
export async function setCurrentSiteCookie(siteId: string): Promise<void> {
  await setSessionCookies(siteId);
}

export async function clearSessionCookies(): Promise<void> {
  const c = await cookies();
  const token = c.get(SESSION_TOKEN_COOKIE)?.value;
  if (token) {
    try {
      await deleteSession(token);
    } catch {
      // Best-effort revocation; still clear the cookie below.
    }
  }
  c.delete(SESSION_TOKEN_COOKIE);
  c.delete(LEGACY_SITE_COOKIE);
  c.delete(LEGACY_USER_COOKIE);
}

export async function clearCurrentSiteCookie(): Promise<void> {
  await clearSessionCookies();
}

export async function getCurrentSite(): Promise<SiteWithPillars | null> {
  const session = await currentSession();
  if (!session) return null;
  return getSiteById(session.siteId);
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await currentSession();
  if (!session?.userId) return null;
  return findUserById(session.userId);
}

export async function requireSite(): Promise<SiteWithPillars> {
  const site = await getCurrentSite();
  if (!site) redirect("/login");
  return site;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function validateInviteCode(raw: string): InviteCodeInfo | null {
  const normalized = raw.trim().toUpperCase();
  return INVITE_CODES[normalized] ?? null;
}

/**
 * Best-effort client IP for rate-limiting. Reads the standard proxy headers
 * (`x-forwarded-for`, `x-real-ip`) and falls back to a literal "unknown"
 * bucket so we never crash on a missing header. The unknown bucket is shared
 * across requests with no headers, which is the desired conservative
 * behaviour: badly-fingerprinted clients get one shared budget.
 */
export async function getClientIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) {
      // x-forwarded-for can be a comma-separated chain — first entry is the
      // origin client.
      const first = fwd.split(",")[0]?.trim();
      if (first) return first;
    }
    const real = h.get("x-real-ip");
    if (real) return real.trim();
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf.trim();
  } catch {
    // headers() can throw in non-request contexts.
  }
  return "unknown";
}
