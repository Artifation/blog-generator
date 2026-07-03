/**
 * Weekly Core Web Vitals monitoring job.
 *
 * For every published post with a wp_post_url, fetches PSI scores,
 * classifies them against Google thresholds, writes a run log to
 * data/cwv-runs/<tenant>/<date>.json, and sends an email alert when
 * any URL is in the "poor" range (if alert_on_poor is enabled).
 */
import * as React from "react";
import { render } from "@react-email/render";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTenant } from "@/config/loader";
import { loadTopics } from "@/config/topics";
import { fetchPsi, classifyCwv } from "@/integrations/pageSpeedInsights";
import type { PsiResult, CwvStatus } from "@/integrations/pageSpeedInsights";
import { sendEmail } from "@/email/resend";
import { CwvAlert } from "@/email/templates/CwvAlert";

export interface CwvJobOpts {
  tenantSlug: string;
  baseDir?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  fetchImpl?: typeof fetch;
}

export interface CwvRunEntry {
  url: string;
  lcp_ms: number;
  inp_ms: number;
  cls: number;
  performance_score: number;
  status: CwvStatus;
  fetched_at: string;
}

interface CwvRunLog {
  run_at: string;
  tenant: string;
  total_checked: number;
  results: CwvRunEntry[];
  poor_urls: CwvRunEntry[];
  alert_sent: boolean;
}

const RATE_LIMIT_DELAY_MS = 2_000; // 2 s between PSI calls to avoid quota exhaustion

export async function runCwvJob(opts: CwvJobOpts): Promise<void> {
  const env = opts.env ?? process.env;
  const baseDir = opts.baseDir ?? "tenants";
  const now = opts.now ?? new Date();

  const tenant = await loadTenant(opts.tenantSlug, baseDir);
  const cfg = tenant.features.cwv_monitoring;

  if (!cfg?.enabled) {
    console.log(JSON.stringify({ stage: "cwv-skip", reason: "feature disabled" }));
    return;
  }

  const topics = await loadTopics(opts.tenantSlug, baseDir);
  const publishedUrls = topics
    .filter((t) => t.status === "published" && t.wp_post_url)
    .map((t) => t.wp_post_url!);

  if (publishedUrls.length === 0) {
    console.log(JSON.stringify({ stage: "cwv-skip", reason: "no published posts with URL" }));
    return;
  }

  const apiKey = cfg.psi_api_key_secret_ref
    ? (env[cfg.psi_api_key_secret_ref] ?? undefined)
    : undefined;

  const results: CwvRunEntry[] = [];

  for (const url of publishedUrls) {
    let psiResult: PsiResult;
    try {
      psiResult = await fetchPsiWithRetry(url, apiKey, opts.fetchImpl);
    } catch (err) {
      console.warn(
        JSON.stringify({ stage: "cwv-fetch", url, warning: (err as Error).message })
      );
      continue;
    }

    const classification = classifyCwv(psiResult);
    results.push({
      url,
      lcp_ms: psiResult.lcp_ms,
      inp_ms: psiResult.inp_ms,
      cls: psiResult.cls,
      performance_score: psiResult.performance_score,
      status: classification.overall,
      fetched_at: psiResult.fetched_at,
    });

    // Throttle to avoid rate-limiting
    await new Promise<void>((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
  }

  const poorUrls = results.filter((r) => r.status === "poor");
  const alertSent = false;
  let didSendAlert = alertSent;

  const log: CwvRunLog = {
    run_at: now.toISOString(),
    tenant: opts.tenantSlug,
    total_checked: results.length,
    results,
    poor_urls: poorUrls,
    alert_sent: false,
  };

  if (poorUrls.length > 0 && cfg.alert_on_poor) {
    try {
      const resendKey = env["RESEND_API_KEY"] ?? "";
      const html = await render(
        React.createElement(CwvAlert, {
          tenant: opts.tenantSlug,
          date: now.toISOString().slice(0, 10),
          poorUrls: poorUrls.map((u) => ({
            url: u.url,
            lcp_ms: u.lcp_ms,
            inp_ms: u.inp_ms,
            cls: u.cls,
          })),
          totalChecked: results.length,
        })
      );
      await sendEmail({
        apiKey: resendKey,
        from: tenant.email.from,
        to: tenant.email.to,
        replyTo: tenant.email.reply_to,
        subject: `[${tenant.brand.name}] CWV waarschuwing ${now.toISOString().slice(0, 10)}: ${poorUrls.length} poor`,
        html,
      });
      didSendAlert = true;
    } catch (err) {
      console.warn(
        JSON.stringify({ stage: "cwv-alert", warning: (err as Error).message })
      );
    }
  }

  log.alert_sent = didSendAlert;

  await persistLog(baseDir, opts.tenantSlug, now, log);

  console.log(
    JSON.stringify({
      stage: "cwv-complete",
      totalChecked: results.length,
      poorCount: poorUrls.length,
      alertSent: didSendAlert,
    })
  );
}

async function fetchPsiWithRetry(
  url: string,
  apiKey: string | undefined,
  fetchImpl?: typeof fetch,
  maxRetries = 2
): Promise<PsiResult> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchPsi({ url, apiKey, fetchImpl });
    } catch (err) {
      lastError = err as Error;
      // Retry on 429 AND 403/quotaExceeded (PSI's actual quota error), not just
      // a literal "429"/"rate" substring.
      const isRateLimit =
        /\b429\b/.test(lastError.message) ||
        /\b403\b/.test(lastError.message) ||
        /rate|quota/i.test(lastError.message);
      if (isRateLimit && attempt < maxRetries) {
        await new Promise<void>((r) => setTimeout(r, 5_000 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError!;
}

async function persistLog(
  baseDir: string,
  slug: string,
  now: Date,
  log: CwvRunLog
): Promise<void> {
  const dir = path.join(baseDir, "..", "data", "cwv-runs", slug);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${now.toISOString().slice(0, 10)}.json`);
  await writeFile(file, JSON.stringify(log, null, 2), "utf-8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tenantArg = process.argv.slice(2).find((a) => a.startsWith("--tenant="));
  if (!tenantArg) throw new Error("Usage: cwvJob.ts --tenant=<slug>");
  const slug = tenantArg.split("=")[1]!;
  runCwvJob({ tenantSlug: slug }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
