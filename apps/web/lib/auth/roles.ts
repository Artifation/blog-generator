/**
 * Role-based access control. The `users.role` column (owner/editor/viewer) was
 * stored but never enforced — any session could invite owners, remove users,
 * delete the site, or write secrets. These helpers make the role meaningful.
 *
 * Hierarchy (each role implies the ones below it):
 *   owner > editor > viewer
 */

import { getCurrentUser } from "../auth";
import type { User } from "../db/schema";

export type Role = "owner" | "editor" | "viewer";

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

export function roleAtLeast(role: string | undefined, min: Role): boolean {
  if (!role || !(role in RANK)) return false;
  return RANK[role as Role] >= RANK[min];
}

/** Thrown when the current user lacks the required role. */
export class ForbiddenError extends Error {
  constructor(message = "Onvoldoende rechten voor deze actie.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Require the current user to have at least `min` role. Returns the user on
 * success; throws ForbiddenError otherwise. Use inside actions that return a
 * result object (the throw is caught and surfaced as { ok: false, error }).
 */
export async function requireRole(min: Role): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("Niet ingelogd.");
  if (!roleAtLeast(user.role, min)) {
    throw new ForbiddenError("Je hebt hier geen rechten voor — vraag een eigenaar van deze site.");
  }
  return user;
}

/** Non-throwing variant for branching / redirect-style actions. */
export async function currentUserHasRole(min: Role): Promise<boolean> {
  const user = await getCurrentUser();
  return roleAtLeast(user?.role, min);
}
