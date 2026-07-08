/**
 * Centrale error store — primaire aggregatie voor de blogtool.
 *
 * Design-uitgangspunten:
 *   - SQLite is single source of truth. Sentry/email zijn optionele fan-out.
 *   - `recordError()` is fire-and-forget en gooit NOOIT. Een error-handler die
 *     zelf crasht maakt het probleem alleen maar erger.
 *   - Auto-prune bij elke write (best-effort, debounced): houd de tabel klein
 *     en het inspecteren snel.
 *   - Geen externe deps — gebruikt de bestaande libsql/drizzle client.
 *
 * Wire-in van het schema gebeurt in client.ts via ensureErrorSchema(db).
 */
import { sql } from "drizzle-orm";

import { getDb, getRawClient, ensureSchema } from "../db/client";
import { newId } from "../db/ids";
import { forwardToSentry } from "./sentry";
import { maybeSendErrorAlertEmail } from "./email-alert";

// Parameterised dynamic SELECTs go through the raw libsql client's execute().
// Drizzle's db.run() rejects the {sql,args} form — it treats the object as an
// SQL wrapper and calls .getSQL() on it (TypeError: a.getSQL is not a function,
// which crashed the /errors page). getRawClient() shares getDb()'s connection.
type RawRunner = (q: { sql: string; args: unknown[] }) => Promise<{ rows: unknown[] }>;
const runRaw = (_db: ReturnType<typeof getDb>): RawRunner =>
  (q) =>
    getRawClient().execute({ sql: q.sql, args: q.args as never }) as unknown as Promise<{
      rows: unknown[];
    }>;

export type ErrorSource =
  | "pipeline"
  | "refresh"
  | "scheduler"
  | "http"
  | "api"
  | "other";

export type ErrorSeverity = "error" | "warn" | "fatal";

export interface RecordErrorInput {
  siteId?: string | null;
  source: ErrorSource;
  severity?: ErrorSeverity;
  message: string;
  stack?: string;
  context?: Record<string, unknown> | null;
}

export interface ErrorEvent {
  id: string;
  ts: string;
  siteId: string | null;
  source: ErrorSource;
  severity: ErrorSeverity;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedNote: string | null;
}

interface ErrorEventRow {
  id: string;
  ts: string;
  site_id: string | null;
  source: string;
  severity: string;
  message: string;
  stack: string | null;
  context_json: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_note: string | null;
}

// Auto-prune debouncing — we draaien maar één pruner per N writes.
const PRUNE_EVERY_N_WRITES = 50;
let writesSinceLastPrune = 0;
let pruneInFlight = false;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function getRetentionDays(): number {
  return envInt("ERROR_RETENTION_DAYS", 90);
}

function getMaxEvents(): number {
  return envInt("ERROR_MAX_EVENTS", 5000);
}

/**
 * Persisteer een fout. Fire-and-forget; gooit NIET. Retourneert de id van het
 * record als het lukte, of `null` als de write faalde (de fout wordt dan
 * alleen naar console.error gestuurd).
 *
 * Doet daarnaast — best-effort, ook niet-gooiend — fan-out naar Sentry en
 * (bij severity=fatal) e-mail.
 */
export async function recordError(input: RecordErrorInput): Promise<string | null> {
  const id = newId("err");
  const severity: ErrorSeverity = input.severity ?? "error";
  const message = String(input.message ?? "unknown error").slice(0, 4000);
  const stack = input.stack ? String(input.stack).slice(0, 16_000) : null;
  let contextJson: string | null = null;
  if (input.context && typeof input.context === "object") {
    try {
      contextJson = JSON.stringify(input.context).slice(0, 16_000);
    } catch {
      contextJson = JSON.stringify({ note: "context not serialisable" });
    }
  }

  // 1. SQLite write (primair) — schema-ensure eerst om kip-en-ei te
  //    vermijden wanneer recordError vroeg in de boot wordt geroepen.
  let written = false;
  try {
    await ensureSchema();
    const db = getDb();
    await db.run(
      sql`INSERT INTO error_events (id, site_id, source, severity, message, stack, context_json) VALUES (${id}, ${input.siteId ?? null}, ${input.source}, ${severity}, ${message}, ${stack}, ${contextJson})`,
    );
    written = true;
  } catch (err) {
    // Laatste redmiddel — als de DB-write zelf faalt willen we hier in elk
    // geval een stdout-spoor hebben. NEVER throw.
    console.error(
      JSON.stringify({
        stage: "errors/store",
        warning: "DB write failed",
        original: { source: input.source, severity, message },
        error: (err as Error).message,
      }),
    );
  }

  // 2. Fan-out naar Sentry (best-effort, non-blocking)
  void forwardToSentry({
    message,
    stack: stack ?? undefined,
    severity,
    source: input.source,
    siteId: input.siteId ?? null,
    context: input.context ?? undefined,
  });

  // 3. Fan-out naar e-mail bij FATAL (best-effort, non-blocking, rate-limited)
  if (severity === "fatal") {
    void maybeSendErrorAlertEmail({
      severity,
      source: input.source,
      message,
      stack: stack ?? undefined,
      siteId: input.siteId ?? null,
      context: input.context ?? undefined,
    });
  }

  // 4. Auto-prune (best-effort, debounced)
  writesSinceLastPrune += 1;
  if (writesSinceLastPrune >= PRUNE_EVERY_N_WRITES && !pruneInFlight) {
    writesSinceLastPrune = 0;
    pruneInFlight = true;
    void (async () => {
      try {
        await pruneOldErrors(getRetentionDays(), getMaxEvents());
      } catch {
        /* never throw from background prune */
      } finally {
        pruneInFlight = false;
      }
    })();
  }

  return written ? id : null;
}

export interface ListErrorsFilter {
  siteId?: string | null;
  /**
   * When `siteId` is a concrete site, also include scheduler/global rows
   * (site_id IS NULL). Used by the "deze site + systeem" scope so an operator
   * sees platform-level errors WITHOUT leaking OTHER tenants' rows.
   */
  includeGlobal?: boolean;
  source?: ErrorSource;
  severity?: ErrorSeverity;
  since?: string; // ISO
  resolved?: boolean | "any";
  limit?: number;
  offset?: number;
}

/**
 * Haal errors op met optionele filters. Default: laatste 100, alle states.
 */
export async function listErrors(filter: ListErrorsFilter = {}): Promise<ErrorEvent[]> {
  await ensureSchema();
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.siteId !== undefined) {
    if (filter.siteId === null) {
      where.push("site_id IS NULL");
    } else if (filter.includeGlobal) {
      where.push("(site_id = ? OR site_id IS NULL)");
      params.push(filter.siteId);
    } else {
      where.push("site_id = ?");
      params.push(filter.siteId);
    }
  }
  if (filter.source) {
    where.push("source = ?");
    params.push(filter.source);
  }
  if (filter.severity) {
    where.push("severity = ?");
    params.push(filter.severity);
  }
  if (filter.since) {
    where.push("ts >= ?");
    params.push(filter.since);
  }
  if (filter.resolved !== undefined && filter.resolved !== "any") {
    where.push(filter.resolved ? "resolved_at IS NOT NULL" : "resolved_at IS NULL");
  }
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const offset = Math.max(filter.offset ?? 0, 0);
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const query = `SELECT id, ts, site_id, source, severity, message, stack, context_json, resolved_at, resolved_by, resolved_note FROM error_events ${whereClause} ORDER BY ts DESC LIMIT ${limit} OFFSET ${offset}`;
  const res = await runRaw(db)({ sql: query, args: params });
  const rows = (res.rows ?? []) as unknown as ErrorEventRow[];
  return rows.map(rowToEvent);
}

export async function getError(id: string): Promise<ErrorEvent | null> {
  await ensureSchema();
  const db = getDb();
  const res = await runRaw(db)({
    sql: `SELECT id, ts, site_id, source, severity, message, stack, context_json, resolved_at, resolved_by, resolved_note FROM error_events WHERE id = ?`,
    args: [id],
  });
  const row = ((res.rows ?? []) as unknown as ErrorEventRow[])[0];
  return row ? rowToEvent(row) : null;
}

export interface CountByBucketRow {
  resolved: number;
  unresolved: number;
  fatalUnresolved: number;
}

/**
 * Tellingen voor de nav-badge + dashboard headers. Eén query (drie sub-counts)
 * zodat we 'm zonder zorgen elke render kunnen aanroepen.
 */
export async function countErrors(
  filter: { siteId?: string | null; includeGlobal?: boolean } = {},
): Promise<CountByBucketRow> {
  try {
    await ensureSchema();
    const db = getDb();
    const params: unknown[] = [];
    let whereSite = "";
    if (filter.siteId !== undefined) {
      if (filter.siteId === null) {
        whereSite = " AND site_id IS NULL";
      } else if (filter.includeGlobal) {
        whereSite = " AND (site_id = ? OR site_id IS NULL)";
        params.push(filter.siteId);
      } else {
        whereSite = " AND site_id = ?";
        params.push(filter.siteId);
      }
    }
    const res = await runRaw(db)({
      sql: `SELECT
        SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS unresolved,
        SUM(CASE WHEN resolved_at IS NULL AND severity = 'fatal' THEN 1 ELSE 0 END) AS fatal_unresolved
        FROM error_events WHERE 1=1${whereSite}`,
      args: params,
    });
    const row = ((res.rows ?? []) as unknown as Array<{
      resolved: number | null;
      unresolved: number | null;
      fatal_unresolved: number | null;
    }>)[0];
    return {
      resolved: Number(row?.resolved ?? 0),
      unresolved: Number(row?.unresolved ?? 0),
      fatalUnresolved: Number(row?.fatal_unresolved ?? 0),
    };
  } catch {
    // never throw — a count-failure shouldn't break a page render
    return { resolved: 0, unresolved: 0, fatalUnresolved: 0 };
  }
}

export async function markResolved(
  id: string,
  siteId: string,
  by: string,
  note?: string,
): Promise<void> {
  await ensureSchema();
  const db = getDb();
  // Scope by the caller's site (plus global/scheduler rows) so a tenant can't
  // resolve/stamp another tenant's error events via a forged id.
  await db.run(
    sql`UPDATE error_events SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), resolved_by = ${by}, resolved_note = ${note ?? null} WHERE id = ${id} AND (site_id = ${siteId} OR site_id IS NULL)`,
  );
}

export async function markUnresolved(id: string, siteId: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.run(
    sql`UPDATE error_events SET resolved_at = NULL, resolved_by = NULL, resolved_note = NULL WHERE id = ${id} AND (site_id = ${siteId} OR site_id IS NULL)`,
  );
}

/**
 * Houd de tabel klein. Retentie = "behoud het MAXIMUM van (laatste N dagen)
 * en (de laatste M events)". Dat betekent: een rustige maand verliest niets,
 * en een storm-week wordt netjes afgekapt op M.
 *
 * Returned: aantal verwijderde rijen.
 */
export async function pruneOldErrors(
  olderThanDays: number = getRetentionDays(),
  maxEvents: number = getMaxEvents(),
): Promise<number> {
  await ensureSchema();
  const db = getDb();

  // 1. Verzamel de cutoff-ts uit BEIDE regels.
  const ageCutoffIso = new Date(
    Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 2. Bepaal de ts van het Mde meest-recente event (als die bestaat).
  const limitedRes = await runRaw(db)({
    sql: `SELECT ts FROM error_events ORDER BY ts DESC LIMIT 1 OFFSET ?`,
    args: [maxEvents],
  });
  const limitedRow = ((limitedRes.rows ?? []) as unknown as Array<{ ts: string }>)[0];
  const countCutoffIso = limitedRow?.ts;

  // 3. De effectieve cutoff is het ouder-makende (= kleinere) van de twee.
  //    "Whichever is bigger" in de spec = behoud het grotere bereik aan data
  //    = gebruik de cutoff die het minst restrictief is.
  let effectiveCutoff: string;
  if (!countCutoffIso) {
    // We hebben minder dan maxEvents in totaal — alleen leeftijdsregel pakt.
    effectiveCutoff = ageCutoffIso;
  } else {
    effectiveCutoff = ageCutoffIso < countCutoffIso ? ageCutoffIso : countCutoffIso;
  }

  const del = await runRaw(db)({
    sql: `DELETE FROM error_events WHERE ts < ? AND resolved_at IS NOT NULL`,
    args: [effectiveCutoff],
  });
  // We sparen unresolved errors altijd — die wil de operator zien, ook al
  // zijn ze 6 maanden oud. Als er extreem veel unresolved staan en de
  // tabel dijt toch uit, valt dat op via /errors zelf.
  const rowsAffected = (del as { rowsAffected?: number; changes?: number }).rowsAffected ??
    (del as { changes?: number }).changes ?? 0;
  return rowsAffected;
}

function rowToEvent(row: ErrorEventRow): ErrorEvent {
  let context: Record<string, unknown> | null = null;
  if (row.context_json) {
    try {
      context = JSON.parse(row.context_json) as Record<string, unknown>;
    } catch {
      context = { _raw: row.context_json };
    }
  }
  return {
    id: row.id,
    ts: row.ts,
    siteId: row.site_id,
    source: (row.source as ErrorSource) ?? "other",
    severity: (row.severity as ErrorSeverity) ?? "error",
    message: row.message,
    stack: row.stack,
    context,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    resolvedNote: row.resolved_note,
  };
}

/** Test-only: kraak de write-counter open zodat tests prune kunnen forceren. */
export function _resetStoreCountersForTests(): void {
  writesSinceLastPrune = 0;
  pruneInFlight = false;
}
