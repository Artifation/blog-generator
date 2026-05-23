/**
 * Generate a fresh AES-256-GCM key for `APP_ENCRYPTION_KEY`.
 *
 * Usage:
 *   npx tsx apps/web/scripts/generate-encryption-key.ts
 *
 * Prints a ready-to-paste `.env` line to stdout. Writes nothing to disk —
 * intentionally manual so the user owns the secret.
 */

import { randomBytes } from "node:crypto";

function main(): void {
  const key = randomBytes(32).toString("base64");
  // Single newline-separated block so the user can copy verbatim.
  process.stdout.write(
    [
      "# Add this to apps/web/.env (or your VPS env). Keep it secret and back it up:",
      `APP_ENCRYPTION_KEY=${key}`,
      "",
    ].join("\n"),
  );
}

main();
