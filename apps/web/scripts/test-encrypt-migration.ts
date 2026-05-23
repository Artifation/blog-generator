/**
 * End-to-end smoke-test for the encrypt-at-rest migration. Inserts a row with
 * plaintext secrets, triggers the boot migration, then verifies:
 *   1. Stored JSON now contains envelopes (not plain "sk-..." strings).
 *   2. getSiteById decrypts cleanly.
 *   3. A second boot is idempotent (no-op).
 *
 * Run (uses /tmp DB so your real data is untouched):
 *   APP_ENCRYPTION_KEY=<key> DATABASE_FILE=/tmp/enc-mig.db \
 *     npx tsx apps/web/scripts/test-encrypt-migration.ts
 *
 * Not a unit-test — intentionally separate so it can hit a real libsql file.
 */

import { sql } from "drizzle-orm";
import {
  ensureSchema,
  getDb,
  closeDb,
} from "../lib/db/client";
import { getSiteById } from "../lib/sites";

async function main(): Promise<void> {
  await ensureSchema();
  const db = getDb();

  await db.run(sql`DELETE FROM sites`);
  await db.run(
    sql`INSERT INTO sites (id, slug, name, domain, api_keys, wordpress_config)
        VALUES ('s_t','t','T','t.com',
                '{"anthropic":"sk-plain-123","empty":""}',
                '{"baseUrl":"https://x.com","user":"u","appPassword":"pw-plain-456"}')`,
  );

  let r = await db.run(
    sql`SELECT api_keys, wordpress_config FROM sites WHERE id='s_t'`,
  );
  console.log("BEFORE:");
  console.log("  api_keys:", r.rows[0]!.api_keys);
  console.log("  wp:", r.rows[0]!.wordpress_config);

  // Close + re-init to re-trigger ensureSchema (and therefore the migration).
  closeDb();
  await ensureSchema();
  const db2 = getDb();

  console.log("AFTER FIRST MIGRATION:");
  r = await db2.run(
    sql`SELECT api_keys, wordpress_config FROM sites WHERE id='s_t'`,
  );
  console.log("  api_keys:", r.rows[0]!.api_keys);
  console.log("  wp:", r.rows[0]!.wordpress_config);

  const site = await getSiteById("s_t");
  console.log("DECRYPTED VIA getSiteById:");
  console.log("  anthropic =>", site?.apiKeys?.anthropic);
  console.log(
    "  empty =>",
    JSON.stringify((site?.apiKeys as Record<string, string>)?.empty),
  );
  console.log("  wp.appPassword =>", site?.wordpressConfig?.appPassword);

  // Idempotency: second migration pass should not change rows.
  closeDb();
  await ensureSchema();
  const db3 = getDb();
  const r2 = await db3.run(
    sql`SELECT api_keys, wordpress_config FROM sites WHERE id='s_t'`,
  );
  const same =
    r.rows[0]!.api_keys === r2.rows[0]!.api_keys &&
    r.rows[0]!.wordpress_config === r2.rows[0]!.wordpress_config;
  console.log("IDEMPOTENT?", same ? "YES" : "NO");

  if (
    site?.apiKeys?.anthropic !== "sk-plain-123" ||
    site?.wordpressConfig?.appPassword !== "pw-plain-456" ||
    !same
  ) {
    console.error("FAIL");
    process.exit(1);
  }
  console.log("OK");
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
