/**
 * Emergency password reset for the single-user local/VPS deployment.
 *
 * Usage:
 *   npx tsx apps/web/scripts/reset-admin-password.ts <email> <new-password>
 *
 * What it does:
 *   1. Looks up the user by email (across all sites).
 *   2. Hashes the new password with scrypt.
 *   3. Writes the hash to BOTH `user_credentials` (canonical) and
 *      `users.password_hash` (legacy mirror).
 *   4. Prints a one-line confirmation.
 *
 * No prompts, no confirm — designed to be runnable from a script. If you
 * fat-finger the wrong email, run again with the right one.
 */

import { eq } from "drizzle-orm";
import { getDb, ensureSchema } from "../lib/db/client";
import { users } from "../lib/db/schema";
import { setPassword } from "../lib/auth/credentials";

async function main(): Promise<void> {
  const [, , emailArg, pwArg] = process.argv;
  if (!emailArg || !pwArg) {
    process.stderr.write(
      "Usage: npx tsx apps/web/scripts/reset-admin-password.ts <email> <new-password>\n",
    );
    process.exit(2);
  }
  if (pwArg.length < 8) {
    process.stderr.write("New password must be at least 8 characters.\n");
    process.exit(2);
  }

  await ensureSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, emailArg.toLowerCase()))
    .limit(1);
  const user = rows[0];
  if (!user) {
    process.stderr.write(`No user found with email "${emailArg}".\n`);
    process.exit(1);
  }

  await setPassword(user.id, pwArg);
  process.stdout.write(
    `Password reset for ${user.email} (siteId=${user.siteId}). You can now log in at /login.\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`Reset failed: ${(err as Error).message}\n`);
  process.exit(1);
});
