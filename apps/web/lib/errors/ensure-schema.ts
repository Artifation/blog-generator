/**
 * Idempotente CREATE TABLE IF NOT EXISTS voor de error_events tabel.
 *
 * Bewust losgekoppeld van `apps/web/lib/db/client.ts` zodat dit bestand niet
 * gewijzigd hoeft te worden — de caller (ensureSchema in client.ts) roept
 * `ensureErrorSchema(db)` aan na zijn eigen CREATE-IF-NOT-EXISTS statements.
 *
 * Wire-in instructie (eenmalig):
 *   import { ensureErrorSchema } from "../errors/ensure-schema";
 *   await ensureErrorSchema(db);
 */
import type { drizzle } from "drizzle-orm/libsql";
import type * as schema from "../db/schema";

type LibsqlDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Maakt de `error_events` tabel + indices aan als ze nog niet bestaan.
 * Idempotent — kan elke proces-boot opnieuw aangeroepen worden.
 */
export async function ensureErrorSchema(db: LibsqlDb): Promise<void> {
  await db.run(`CREATE TABLE IF NOT EXISTS error_events (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    site_id TEXT,
    source TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'error',
    message TEXT NOT NULL,
    stack TEXT,
    context_json TEXT,
    resolved_at TEXT,
    resolved_by TEXT,
    resolved_note TEXT
  )`);
  await db.run(
    `CREATE INDEX IF NOT EXISTS error_events_ts_idx ON error_events(ts)`,
  );
  await db.run(
    `CREATE INDEX IF NOT EXISTS error_events_resolved_ts_idx ON error_events(resolved_at, ts)`,
  );
  await db.run(
    `CREATE INDEX IF NOT EXISTS error_events_site_source_idx ON error_events(site_id, source, ts)`,
  );
}
