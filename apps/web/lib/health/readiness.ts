/**
 * Readiness check — distinct from /api/health (liveness). A container can be
 * "live" (the Next server answers) while every authenticated DB read and every
 * encrypt/decrypt throws, so it serves 500s to users. This verifies the things
 * the app actually needs before it should receive traffic: the DB is reachable,
 * the at-rest encryption key is usable, and CRON_TOKEN is configured.
 */

import { sql } from "drizzle-orm";
import { getDb, ensureSchema } from "../db/client";
import { isEncryptionAvailable } from "../security/crypto";

export interface ReadinessReport {
  ready: boolean;
  checks: {
    db: boolean;
    encryption: boolean;
    cronToken: boolean;
  };
}

export async function checkReadiness(): Promise<ReadinessReport> {
  let db = false;
  try {
    await ensureSchema();
    await getDb().run(sql`SELECT 1`);
    db = true;
  } catch {
    db = false;
  }

  const encryption = isEncryptionAvailable();
  const cronToken = Boolean(process.env.CRON_TOKEN && process.env.CRON_TOKEN.trim() !== "");

  return {
    ready: db && encryption && cronToken,
    checks: { db, encryption, cronToken },
  };
}
