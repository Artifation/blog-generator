import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSiteById, type SiteWithPillars } from "./sites";
import { findUserById } from "./users";
import type { User } from "./db/schema";

const SESSION_COOKIE = "artifation_site";
const USER_COOKIE = "artifation_user";

/**
 * Invite codes hardcoded for the demo flow.
 * In a real deployment these would live in a database and be generated per customer.
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
};

export interface InviteCodeInfo {
  company: string;
  email: string;
  name: string;
  plan: "starter" | "pro" | "custom";
  domain: string;
}

export async function setSessionCookies(siteId: string, userId?: string): Promise<void> {
  const c = await cookies();
  c.set(SESSION_COOKIE, siteId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  if (userId) {
    c.set(USER_COOKIE, userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
}

// Backwards-compat alias used by existing callers
export async function setCurrentSiteCookie(siteId: string): Promise<void> {
  await setSessionCookies(siteId);
}

export async function clearSessionCookies(): Promise<void> {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  c.delete(USER_COOKIE);
}

export async function clearCurrentSiteCookie(): Promise<void> {
  await clearSessionCookies();
}

export async function getCurrentSite(): Promise<SiteWithPillars | null> {
  const c = await cookies();
  const id = c.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return getSiteById(id);
}

export async function getCurrentUser(): Promise<User | null> {
  const c = await cookies();
  const id = c.get(USER_COOKIE)?.value;
  if (!id) return null;
  return findUserById(id);
}

export async function requireSite(): Promise<SiteWithPillars> {
  const site = await getCurrentSite();
  if (!site) redirect("/login");
  return site;
}

export function validateInviteCode(raw: string): InviteCodeInfo | null {
  const normalized = raw.trim().toUpperCase();
  return INVITE_CODES[normalized] ?? null;
}
