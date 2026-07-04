#!/usr/bin/env tsx
/**
 * One-off cleanup of rows orphaned by earlier deleteSite() calls that ran while
 * SQLite foreign keys were OFF (before the PRAGMA foreign_keys=ON fix). Those
 * deletes removed only the `sites` row and left child rows dangling.
 *
 * FK enforcement is now on for NEW operations, but it does NOT retroactively
 * remove already-orphaned rows — hence this script.
 *
 *   tsx scripts/cleanup-orphans.ts            # DRY RUN (default): report only
 *   tsx scripts/cleanup-orphans.ts --apply    # actually delete the orphans
 *
 * Safe to re-run. Never touches rows that still reference a live site/user.
 */
import { sql } from "drizzle-orm";
import { getDb, ensureSchema } from "../lib/db/client";

// Tables whose site_id must reference a live sites.id. error_events.site_id is
// nullable (scheduler/global rows legitimately have NULL) — those are excluded.
const SITE_SCOPED: { table: string; nullableSite?: boolean }[] = [
  { table: "pillars" },
  { table: "topics" },
  { table: "drafts" },
  { table: "published_posts" },
  { table: "runs" },
  { table: "post_refreshes" },
  { table: "users" },
  { table: "sessions" },
  { table: "error_events", nullableSite: true },
];

// Tables whose user_id must reference a live users.id.
const USER_SCOPED = ["user_credentials", "sessions"];

async function countWhere(db: ReturnType<typeof getDb>, query: string): Promise<number> {
  // `query` is built only from internal table/condition literals (never user
  // input), so sql.raw is safe here.
  const res = (await db.run(sql.raw(query))) as unknown as { rows?: Array<{ c?: number }> };
  return Number(res.rows?.[0]?.c ?? 0);
}

async function main() {
  const apply = process.argv.includes("--apply");
  await ensureSchema();
  const db = getDb();

  console.log(apply ? "MODE: APPLY (deleting orphans)\n" : "MODE: DRY RUN (no deletes; pass --apply to delete)\n");

  let totalOrphans = 0;

  for (const { table, nullableSite } of SITE_SCOPED) {
    const notNull = nullableSite ? "site_id IS NOT NULL AND " : "";
    const cond = `${notNull}site_id NOT IN (SELECT id FROM sites)`;
    const n = await countWhere(db, `SELECT COUNT(*) AS c FROM ${table} WHERE ${cond}`);
    totalOrphans += n;
    if (n > 0) {
      console.log(`${table}: ${n} orphan row(s)${apply ? " — deleting" : ""}`);
      if (apply) await db.run(sql.raw(`DELETE FROM ${table} WHERE ${cond}`));
    }
  }

  for (const table of USER_SCOPED) {
    const cond = `user_id NOT IN (SELECT id FROM users)`;
    const n = await countWhere(db, `SELECT COUNT(*) AS c FROM ${table} WHERE ${cond}`);
    totalOrphans += n;
    if (n > 0) {
      console.log(`${table}: ${n} row(s) with a dangling user_id${apply ? " — deleting" : ""}`);
      if (apply) await db.run(sql.raw(`DELETE FROM ${table} WHERE ${cond}`));
    }
  }

  console.log(
    `\n${totalOrphans === 0 ? "No orphans found — nothing to do." : `${totalOrphans} orphan row(s) ${apply ? "deleted." : "found (re-run with --apply to delete)."}`}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
