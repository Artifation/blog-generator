/**
 * Optionele e-mail alerting voor `severity: "fatal"` error-events.
 *
 * Wordt actief als alle drie aanwezig zijn:
 *   - process.env.ERROR_ALERT_EMAIL  (ontvanger)
 *   - process.env.RESEND_API_KEY      (transport)
 *   - severity === "fatal"            (drempel)
 *
 * Rate-limit: max 1 mail per uur per `source+message-hash`. Voorkomt mail-
 * bombing wanneer een fatal-flap dezelfde fout 200x per minuut hertriggert.
 *
 * Fire-and-forget — gooit nooit. Per-process in-memory state (geen DB-tabel)
 * omdat de scope hier alleen "binnen één app-restart" hoeft te zijn.
 */
import crypto from "node:crypto";
import { sendEmail } from "@/email/resend";

const ONE_HOUR_MS = 60 * 60 * 1000;

interface RateLimitEntry {
  lastSentAt: number;
  suppressedSince: number;
  suppressedCount: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function hashKey(source: string, message: string): string {
  return crypto
    .createHash("sha256")
    .update(`${source}::${message}`)
    .digest("hex")
    .slice(0, 16);
}

export interface EmailAlertInput {
  severity: "error" | "warn" | "fatal";
  source: string;
  message: string;
  stack?: string;
  siteId?: string | null;
  context?: Record<string, unknown>;
}

export interface EmailAlertResult {
  sent: boolean;
  reason?: "no-config" | "non-fatal" | "rate-limited" | "send-failed";
  suppressedCount?: number;
}

/**
 * Stuur (eventueel) een alert-mail. Resolves altijd, throws nooit.
 */
export async function maybeSendErrorAlertEmail(
  input: EmailAlertInput,
): Promise<EmailAlertResult> {
  try {
    if (input.severity !== "fatal") {
      return { sent: false, reason: "non-fatal" };
    }
    const to = process.env.ERROR_ALERT_EMAIL;
    const apiKey = process.env.RESEND_API_KEY;
    if (!to || !apiKey) {
      return { sent: false, reason: "no-config" };
    }

    const key = hashKey(input.source, input.message);
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    if (entry && now - entry.lastSentAt < ONE_HOUR_MS) {
      entry.suppressedCount += 1;
      return {
        sent: false,
        reason: "rate-limited",
        suppressedCount: entry.suppressedCount,
      };
    }

    const suppressedSince = entry?.suppressedSince ?? now;
    const suppressedCount = entry?.suppressedCount ?? 0;
    const from = process.env.ERROR_ALERT_FROM ?? "onboarding@resend.dev";
    const replyTo = process.env.ERROR_ALERT_REPLY_TO ?? to;
    const env = process.env.NODE_ENV ?? "development";
    const host =
      process.env.HOSTNAME ??
      process.env.HOST ??
      process.env.VERCEL_URL ??
      "unknown-host";

    const subject = `[blogtool/${env}] FATAL ${input.source}: ${truncate(input.message, 80)}`;
    const html = buildHtml({
      ...input,
      host,
      env,
      suppressedCount,
      suppressedSince,
    });

    await sendEmail({
      apiKey,
      from,
      to,
      replyTo,
      subject,
      html,
    });

    rateLimitMap.set(key, {
      lastSentAt: now,
      suppressedSince: now,
      suppressedCount: 0,
    });
    return { sent: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        stage: "errors/email-alert",
        warning: "send failed",
        error: (err as Error).message,
      }),
    );
    return { sent: false, reason: "send-failed" };
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface BuildHtmlInput extends EmailAlertInput {
  host: string;
  env: string;
  suppressedCount: number;
  suppressedSince: number;
}

function buildHtml(input: BuildHtmlInput): string {
  const ctx = input.context
    ? `<pre style="background:#f4f4f5;padding:12px;border-radius:6px;font-size:12px;overflow:auto;">${escapeHtml(JSON.stringify(input.context, null, 2))}</pre>`
    : "";
  const stack = input.stack
    ? `<details><summary style="cursor:pointer;color:#666;">Stack trace</summary><pre style="background:#fafafa;padding:12px;border-radius:6px;font-size:12px;overflow:auto;">${escapeHtml(input.stack)}</pre></details>`
    : "";
  const suppressedNote =
    input.suppressedCount > 0
      ? `<p style="color:#92400e;font-size:12px;background:#fef3c7;padding:8px;border-radius:6px;">Onderdrukt: ${input.suppressedCount} extra event(s) van deze fout sinds ${new Date(input.suppressedSince).toISOString()} (rate-limit: 1/uur per source+message).</p>`
      : "";
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:16px;">
  <h2 style="color:#b91c1c;margin:0 0 8px;">FATAL: ${escapeHtml(input.source)}</h2>
  <p style="color:#555;font-size:13px;margin:0 0 16px;">host=<code>${escapeHtml(input.host)}</code> · env=<code>${escapeHtml(input.env)}</code>${input.siteId ? ` · site=<code>${escapeHtml(input.siteId)}</code>` : ""}</p>
  <p style="font-size:14px;line-height:1.5;"><strong>${escapeHtml(input.message)}</strong></p>
  ${suppressedNote}
  ${ctx}
  ${stack}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
  <p style="font-size:12px;color:#666;">Bekijk in de UI: <code>/errors</code></p>
</body></html>`;
}

/** Test-only: reset rate-limit state. */
export function _resetEmailAlertForTests(): void {
  rateLimitMap.clear();
}
