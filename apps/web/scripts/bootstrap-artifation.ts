#!/usr/bin/env tsx
/**
 * One-shot: import tenants/artifation/* YAML, create an admin user, set a
 * random password. Prints credentials to stdout (once). Idempotent — re-runs
 * skip the import if the site already exists; re-set the password every time.
 *
 *   npx tsx apps/web/scripts/bootstrap-artifation.ts
 */
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { ensureSchema, getDb } from "../lib/db/client";
import { getSiteBySlug } from "../lib/sites";
import { newId } from "../lib/db/ids";
import { setPassword } from "../lib/auth/credentials";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TENANT_SLUG = "artifation";
const ADMIN_EMAIL = "algemeen@artifation.nl";
const ADMIN_NAME = "Julian Dunsbergen";

async function main() {
  await ensureSchema();
  const db = getDb();

  // 1. Import YAML if site doesn't exist yet
  let site = await getSiteBySlug(TENANT_SLUG);
  if (!site) {
    console.log(`[1/3] Importing ${TENANT_SLUG} from YAML...`);
    const scriptPath = path.resolve(__dirname, "import-yaml.ts");
    execSync(`npx tsx "${scriptPath}" ${TENANT_SLUG}`, {
      stdio: "inherit",
      cwd: path.resolve(__dirname, ".."),
    });
    site = await getSiteBySlug(TENANT_SLUG);
    if (!site) throw new Error("YAML import did not create site");
  } else {
    console.log(`[1/3] Site '${TENANT_SLUG}' already exists (id=${site.id}) — skipping import.`);
  }

  // 2. Ensure admin user exists
  const userRes = await db.run(
    sql`SELECT id FROM users WHERE site_id = ${site.id} AND email = ${ADMIN_EMAIL}`,
  );
  let userId = ((userRes.rows ?? []) as unknown as Array<{ id: string }>)[0]?.id;

  if (!userId) {
    userId = newId("u");
    // password_hash is NOT NULL on the legacy users column but the new auth
    // path uses user_credentials — setPassword() below populates that. Empty
    // string here is a safe placeholder that the new path never reads.
    await db.run(
      sql`INSERT INTO users (id, site_id, email, name, role, password_hash) VALUES (${userId}, ${site.id}, ${ADMIN_EMAIL}, ${ADMIN_NAME}, 'owner', '')`,
    );
    console.log(`[2/3] Created user ${ADMIN_EMAIL} (id=${userId}) on site ${TENANT_SLUG}.`);
  } else {
    console.log(`[2/3] User ${ADMIN_EMAIL} already exists (id=${userId}) — keeping it.`);
  }

  // 3. Set a fresh random password
  const password = crypto.randomBytes(12).toString("base64").replace(/[+/=]/g, "").slice(0, 16);
  await setPassword(userId, password);

  console.log(`[3/3] Password set.\n`);
  console.log("==================================================");
  console.log("  LOGIN CREDENTIALS — copy now, won't show again");
  console.log("==================================================");
  console.log(`  URL:      http://localhost:3000/login`);
  console.log(`  Site:     ${TENANT_SLUG}  (${site.name})`);
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${password}`);
  console.log("==================================================\n");
  console.log("After login, change the password via /account/security.");
  process.exit(0);
}

main().catch((err) => {
  console.error("bootstrap failed:", err);
  process.exit(1);
});
