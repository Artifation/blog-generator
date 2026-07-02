import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import {
  encryptString,
  isEncrypted,
  isEncryptionAvailable,
} from "../security/crypto";
import { ensureAuthSchema } from "../auth/ensure-schema";
import { ensureErrorSchema } from "../errors/ensure-schema";

const DB_PATH =
  process.env.DATABASE_FILE ??
  path.resolve(process.cwd(), "../../data/app.db");

function ensureDirExists(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof createClient> | null = null;
let _initPromise: Promise<void> | null = null;

export function getDb() {
  if (_db) return _db;
  ensureDirExists(DB_PATH);
  _client = createClient({ url: `file:${DB_PATH}` });
  _db = drizzle(_client, { schema });
  return _db;
}

/**
 * Ensure the schema is in place. Call from any data-access function before
 * issuing queries. Idempotent — runs the CREATE-IF-NOT-EXISTS statements once
 * per process. Returns a Promise the caller should await.
 */
export async function ensureSchema(): Promise<void> {
  if (_initPromise) return _initPromise;
  const db = getDb();
  _initPromise = (async () => {
    // Enforce foreign keys on THIS connection (libSQL/SQLite default them OFF).
    // Without it every ON DELETE CASCADE / SET NULL in the schema is inert and
    // deleteSite orphans all child rows. The pragma is per-connection and
    // non-persistent, so it must run before any query; ensureSchema is awaited
    // by every data-access path and closeDb resets _initPromise, so a re-open
    // re-applies it.
    await db.run(`PRAGMA foreign_keys = ON`);
    await db.run(`CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en-US',
      brand_voice TEXT NOT NULL DEFAULT '',
      ban_list TEXT NOT NULL DEFAULT '[]',
      signature_phrases TEXT NOT NULL DEFAULT '[]',
      reading_level_min INTEGER NOT NULL DEFAULT 50,
      reading_level_max INTEGER NOT NULL DEFAULT 70,
      quality_threshold REAL NOT NULL DEFAULT 8.0,
      max_posts_per_week INTEGER NOT NULL DEFAULT 2,
      schedule_cron TEXT NOT NULL DEFAULT '0 6 * * 1,3,5',
      auto_publish INTEGER NOT NULL DEFAULT 0,
      publish_destination TEXT NOT NULL DEFAULT 'built_in',
      wordpress_config TEXT,
      email_config TEXT NOT NULL DEFAULT '{"enabled":false}',
      author TEXT NOT NULL DEFAULT '{"name":""}',
      organization TEXT NOT NULL DEFAULT '{}',
      api_keys TEXT NOT NULL DEFAULT '{}',
      features TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);
    await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS sites_slug_idx ON sites(slug)`);

    await db.run(`CREATE TABLE IF NOT EXISTS pillars (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`);
    await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS pillars_site_slug_idx ON pillars(site_id, slug)`);

    await db.run(`CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      target_keyword TEXT NOT NULL,
      pillar_slug TEXT NOT NULL,
      intent TEXT NOT NULL DEFAULT 'informational',
      intended_word_count INTEGER NOT NULL DEFAULT 1500,
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      retry_after TEXT,
      reject_reason TEXT,
      published_draft_id TEXT,
      published_url TEXT,
      key_entities TEXT DEFAULT '[]',
      proposed_at TEXT,
      proposal_source TEXT,
      proposal_rationale TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);
    await db.run(`CREATE INDEX IF NOT EXISTS topics_site_status_idx ON topics(site_id, status)`);

    await db.run(`CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
      run_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending_review',
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      content_html TEXT NOT NULL,
      meta_title TEXT NOT NULL DEFAULT '',
      meta_description TEXT NOT NULL DEFAULT '',
      tldr TEXT NOT NULL DEFAULT '',
      image_path TEXT,
      image_alt TEXT,
      rubric_scores TEXT,
      weighted_total REAL,
      hard_fails TEXT DEFAULT '[]',
      cost_usd REAL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      reviewed_at TEXT
    )`);
    await db.run(`CREATE INDEX IF NOT EXISTS drafts_site_status_idx ON drafts(site_id, status)`);

    await db.run(`CREATE TABLE IF NOT EXISTS published_posts (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      draft_id TEXT REFERENCES drafts(id) ON DELETE SET NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      content_html TEXT NOT NULL,
      meta_title TEXT NOT NULL DEFAULT '',
      meta_description TEXT NOT NULL DEFAULT '',
      tldr TEXT NOT NULL DEFAULT '',
      image_path TEXT,
      image_alt TEXT,
      target_keyword TEXT NOT NULL DEFAULT '',
      pillar_slug TEXT NOT NULL DEFAULT '',
      published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      external_url TEXT,
      external_id TEXT
    )`);
    await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS published_site_slug_idx ON published_posts(site_id, slug)`);

    await db.run(`CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      topic_id TEXT,
      started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      finished_at TEXT,
      verdict TEXT NOT NULL DEFAULT 'running',
      weighted_total REAL,
      hard_fails TEXT DEFAULT '[]',
      reason TEXT,
      cost_usd REAL,
      stages TEXT DEFAULT '[]',
      error_message TEXT
    )`);
    await db.run(`CREATE INDEX IF NOT EXISTS runs_site_started_idx ON runs(site_id, started_at)`);

    await db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);

    // Idempotent ADD COLUMN migrations for tables that pre-existed.
    // libsql ignores "duplicate column" errors when we wrap each in a try.
    await safeAddColumn(db, "published_posts", "repurposed TEXT");
    await safeAddColumn(db, "topics", "custom_instructions TEXT");

    // Post refreshes — tracks the lifecycle of every refresh job so we can
    // (a) enforce a cooldown window per post, (b) compute before/after lift,
    // (c) surface refresh history in the UI.
    await db.run(`CREATE TABLE IF NOT EXISTS post_refreshes (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      published_post_id TEXT NOT NULL REFERENCES published_posts(id) ON DELETE CASCADE,
      draft_id TEXT REFERENCES drafts(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      rationale TEXT,
      before_snapshot TEXT,
      triggered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      completed_at TEXT,
      error_message TEXT,
      cost_usd REAL
    )`);
    await db.run(`CREATE INDEX IF NOT EXISTS post_refreshes_site_post_idx ON post_refreshes(site_id, published_post_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS post_refreshes_site_triggered_idx ON post_refreshes(site_id, triggered_at)`);

    // Users table for multi-user/team support
    await db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'editor',
      invited_by TEXT,
      invited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_login_at TEXT
    )`);
    await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_site_idx ON users(site_id, email)`);

    await ensureAuthSchema(db);
    await ensureErrorSchema(db);

    // Migrate any plaintext secrets (api keys + WordPress passwords) sitting
    // in `sites` rows from earlier deploys. Idempotent — uses isEncrypted()
    // to skip rows that are already done.
    await migratePlaintextSiteSecrets(db);
  })().catch((err) => {
    // Don't cache a rejected init forever (a transient DDL failure or a missing
    // encryption key would otherwise wedge every future query until restart).
    // Clear it so the next ensureSchema() call retries.
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}

export function closeDb() {
  if (_client) {
    _client.close();
    _client = null;
    _db = null;
    _initPromise = null;
  }
}

export { schema };

type LibsqlDb = ReturnType<typeof drizzle<typeof schema>>;
async function safeAddColumn(db: LibsqlDb, table: string, columnDef: string): Promise<void> {
  try {
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    // "duplicate column name" — already added on a prior boot.
    const msg = (err as Error).message ?? "";
    if (!/duplicate column/i.test(msg)) {
      throw err;
    }
  }
}

/**
 * One-shot, idempotent migration: walks every `sites` row, encrypts plaintext
 * leaf values in `api_keys` JSON and `wordpress_config.appPassword`, writes
 * back. Detects already-encrypted values via `isEncrypted()` and skips them,
 * so this is safe to re-run on every boot.
 *
 * Behaviour when `APP_ENCRYPTION_KEY` is not configured:
 *   - In production (NODE_ENV=production): throw — refuses to start so secrets
 *     never land on a prod disk in plaintext silently.
 *   - In dev: log a one-line warning and skip the migration. The app keeps
 *     running with plaintext secrets so onboarding stays unblocked.
 */
async function migratePlaintextSiteSecrets(db: LibsqlDb): Promise<void> {
  if (!isEncryptionAvailable()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[db/client] APP_ENCRYPTION_KEY is required in production but is " +
          "missing or invalid. Generate one with `npx tsx apps/web/scripts/generate-encryption-key.ts` " +
          "and add it to your env before starting the app.",
      );
    }
    // eslint-disable-next-line no-console
    console.warn(
      "\n[security] APP_ENCRYPTION_KEY is not set — secrets in the SQLite DB are stored as PLAINTEXT.\n" +
        "          Generate a key:\n" +
        "            npx tsx apps/web/scripts/generate-encryption-key.ts\n" +
        "          and add it to apps/web/.env. The app will then encrypt existing rows on next boot.\n",
    );
    return;
  }

  type Row = {
    id: string;
    api_keys: string | null;
    wordpress_config: string | null;
  };
  const result = await db.run(
    `SELECT id, api_keys, wordpress_config FROM sites`,
  );
  const rows = (result.rows ?? []) as unknown as Row[];

  let migrated = 0;
  for (const row of rows) {
    let nextApiKeys: string | null = row.api_keys;
    let nextWpConfig: string | null = row.wordpress_config;
    let changed = false;

    if (row.api_keys) {
      const sealed = sealApiKeysJsonBlob(row.api_keys);
      if (sealed !== row.api_keys) {
        nextApiKeys = sealed;
        changed = true;
      }
    }
    if (row.wordpress_config) {
      const sealed = sealWordpressConfigJsonBlob(row.wordpress_config);
      if (sealed !== row.wordpress_config) {
        nextWpConfig = sealed;
        changed = true;
      }
    }

    if (changed) {
      await db.run(
        sql`UPDATE sites SET api_keys = ${nextApiKeys ?? "{}"}, wordpress_config = ${nextWpConfig} WHERE id = ${row.id}`,
      );
      migrated++;
    }
  }

  if (migrated > 0) {
    // eslint-disable-next-line no-console
    console.info(
      `[security] Encrypted plaintext secrets in ${migrated} site row(s) at boot.`,
    );
  }
}

function sealApiKeysJsonBlob(jsonStr: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    // Malformed JSON — leave alone, ensureSchema isn't the place to recover.
    return jsonStr;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return jsonStr;
  }
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string" && v !== "" && !isEncrypted(v)) {
      next[k] = encryptString(v);
      changed = true;
    } else {
      next[k] = v;
    }
  }
  return changed ? JSON.stringify(next) : jsonStr;
}

function sealWordpressConfigJsonBlob(jsonStr: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return jsonStr;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return jsonStr;
  }
  const pw = parsed.appPassword;
  if (typeof pw !== "string" || pw === "" || isEncrypted(pw)) {
    return jsonStr;
  }
  return JSON.stringify({ ...parsed, appPassword: encryptString(pw) });
}
