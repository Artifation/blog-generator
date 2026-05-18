import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

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
  })();
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
