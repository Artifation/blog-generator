/**
 * DB-backed, single-use invite codes.
 *
 * Replaces the hardcoded INVITE_CODES map (which was infinitely reusable and
 * fully enumerable). Codes live in the `invite_codes` table and are claimed
 * atomically at site creation, so a code can onboard exactly one site and
 * createSiteAction can require a valid, unconsumed code (closing the anonymous
 * mass-site-creation hole).
 *
 * The legacy INVITE_CODES map is the one-time seed source so existing codes
 * keep working. Seeding is INSERT OR IGNORE, so it never resurrects a consumed
 * code or overwrites its state.
 */

import { sql } from "drizzle-orm";
import { getDb, ensureSchema } from "./db/client";
import { INVITE_CODES, type InviteCodeInfo } from "./auth";

let _seeded = false;

async function ensureSeeded(): Promise<void> {
  await ensureSchema();
  if (_seeded) return;
  const db = getDb();
  for (const [code, info] of Object.entries(INVITE_CODES)) {
    await db.run(
      sql`INSERT OR IGNORE INTO invite_codes (code, plan, company, email, name, domain)
          VALUES (${code}, ${info.plan}, ${info.company}, ${info.email}, ${info.name}, ${info.domain})`,
    );
  }
  _seeded = true;
}

interface InviteRow {
  plan: string;
  company: string;
  email: string;
  name: string;
  domain: string;
  consumed_at: string | null;
}

/** Return the code's info when it exists AND has not been consumed yet. */
export async function lookupInviteCode(raw: string): Promise<InviteCodeInfo | null> {
  await ensureSeeded();
  const code = raw.trim().toUpperCase();
  const db = getDb();
  const res = await db.run(
    sql`SELECT plan, company, email, name, domain, consumed_at FROM invite_codes WHERE code = ${code}`,
  );
  const row = res.rows[0] as unknown as InviteRow | undefined;
  if (!row || row.consumed_at) return null;
  return {
    company: row.company,
    email: row.email,
    name: row.name,
    plan: (row.plan as InviteCodeInfo["plan"]) ?? "pro",
    domain: row.domain,
  };
}

/**
 * Atomically claim a code for a site. Returns true only if THIS call claimed
 * it (the UPDATE matched an unconsumed row) — concurrent claims see false.
 */
export async function consumeInviteCode(raw: string, siteId: string): Promise<boolean> {
  await ensureSeeded();
  const code = raw.trim().toUpperCase();
  const db = getDb();
  const res = await db.run(
    sql`UPDATE invite_codes
        SET consumed_at = ${new Date().toISOString()}, consumed_by_site_id = ${siteId}
        WHERE code = ${code} AND consumed_at IS NULL`,
  );
  return (res.rowsAffected ?? 0) > 0;
}

/** Release a previously-claimed code (used to roll back a failed site creation). */
export async function releaseInviteCode(raw: string): Promise<void> {
  await ensureSeeded();
  const code = raw.trim().toUpperCase();
  const db = getDb();
  await db.run(
    sql`UPDATE invite_codes SET consumed_at = NULL, consumed_by_site_id = NULL WHERE code = ${code}`,
  );
}
