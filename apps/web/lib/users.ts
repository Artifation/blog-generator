import { eq, and, asc } from "drizzle-orm";
import { getDb, ensureSchema } from "./db/client";
import { users, type User } from "./db/schema";
import { newId } from "./db/ids";
import { hashPassword, verifyPassword } from "./passwords";

export type UserRole = "owner" | "editor" | "viewer";

export async function findUserByEmail(siteId: string, email: string): Promise<User | null> {
  await ensureSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.siteId, siteId), eq(users.email, email.toLowerCase())))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  await ensureSchema();
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Find a user across all sites by email. Used by the password-login flow,
 * which doesn't know the site upfront — the cookie is set from the found
 * user's siteId.
 */
export async function findUserAnyEmail(email: string): Promise<User | null> {
  await ensureSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function listUsersForSite(siteId: string): Promise<User[]> {
  await ensureSchema();
  const db = getDb();
  return db.select().from(users).where(eq(users.siteId, siteId)).orderBy(asc(users.invitedAt));
}

export interface CreateUserInput {
  siteId: string;
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
  invitedBy?: string;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  await ensureSchema();
  const db = getDb();
  const id = newId("usr");
  const passwordHash = await hashPassword(input.password);
  await db.insert(users).values({
    id,
    siteId: input.siteId,
    email: input.email.toLowerCase(),
    passwordHash,
    name: input.name ?? "",
    role: input.role ?? "editor",
    invitedBy: input.invitedBy ?? null,
  });
  return (await findUserById(id))!;
}

export async function deleteUser(id: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.delete(users).where(eq(users.id, id));
}

export async function recordLogin(id: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db
    .update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, id));
}

export interface AuthenticateResult {
  user: User;
}

export async function authenticate(
  email: string,
  password: string
): Promise<AuthenticateResult | null> {
  await ensureSchema();
  const db = getDb();
  // We search across all sites — same email may exist for multiple sites (rare).
  // For now: pick the first match. Real multi-site users could choose later.
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  const user = rows[0];
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  await recordLogin(user.id);
  return { user };
}
