import { getDb, ensureSchema } from "../lib/db/client";

async function main() {
  await ensureSchema();
  const db = getDb();

  const sites = await db.run(`SELECT id, slug, name, domain, created_at FROM sites ORDER BY created_at`);
  console.log(`\n=== SITES (${sites.rows.length}) ===`);
  for (const row of sites.rows as Array<{ id: string; slug: string; name: string; domain: string; created_at: string }>) {
    console.log(`  ${row.slug.padEnd(20)} ${row.name.padEnd(30)} ${row.domain}  (id=${row.id})`);
  }

  const users = await db.run(`SELECT u.email, u.name, u.role, u.invited_at, u.last_login_at, s.slug AS site_slug FROM users u LEFT JOIN sites s ON s.id = u.site_id ORDER BY u.invited_at`);
  console.log(`\n=== USERS (${users.rows.length}) ===`);
  for (const row of users.rows as Array<{ email: string; name: string; role: string; invited_at: string; last_login_at: string | null; site_slug: string }>) {
    console.log(`  ${row.email.padEnd(35)} ${(row.name || "").padEnd(25)} ${row.role.padEnd(10)} site=${row.site_slug}`);
  }

  const creds = await db.run(`SELECT u.email, c.password_set_at, c.password_changed_at FROM user_credentials c JOIN users u ON u.id = c.user_id ORDER BY c.password_set_at`);
  console.log(`\n=== USERS WITH PASSWORD SET (${creds.rows.length}) ===`);
  for (const row of creds.rows as Array<{ email: string; password_set_at: string; password_changed_at: string | null }>) {
    console.log(`  ${row.email.padEnd(35)} set=${row.password_set_at}  changed=${row.password_changed_at ?? "—"}`);
  }
  console.log();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
