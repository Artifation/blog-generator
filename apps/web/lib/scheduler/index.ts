/**
 * In-process scheduler voor de blog-pipeline.
 *
 * Leest periodiek alle sites uit de DB die een `scheduleCron` hebben en plant
 * ze met `node-cron`. Bij trigger pakt de scheduler het hoogste-prioriteit
 * queued topic voor die site en roept `runForSite()` aan — dezelfde code-pad
 * als de UI-knop ("Run next") en het externe `/api/cron/[siteSlug]` endpoint.
 *
 * Ontwerpkeuzes:
 *
 * - Best-effort, single-process. Dit is bewust GEEN distributed job-queue:
 *   single-user VPS / lokaal, één Next.js-proces, SQLite-backed. Wie meer
 *   wil draait 'm uit (`DISABLE_INPROCESS_SCHEDULER=true`) en gebruikt
 *   systemd-timer of een externe scheduler tegen het cron-endpoint.
 *
 * - Cap-check, error-handling, e-mailnotificatie en kostentracking zitten
 *   allemaal al in `runForSite()`. De scheduler doet geen eigen retry-logica
 *   — als een run faalt, faalt-ie. De volgende cron-tick pikt 'm vanzelf op.
 *
 * - Hot-reload via polling. Bij elke poll (default 60s, instelbaar via
 *   `SCHEDULER_POLL_INTERVAL_MS`) wordt de scheduler-state vergeleken met
 *   de DB en jobs worden gestopt/gestart/opnieuw-gepland waar nodig. Geen
 *   pub/sub, geen DB-trigger, geen file-watcher — gewoon idempotent diffen.
 *   Vermijdt dat we elke site-CRUD action moeten haken op een notify-call.
 *
 * - Mutex per site. Twee triggers op dezelfde site (bijv. een trage run die
 *   over de volgende cron-tick heen loopt) wordt gemutet zodat `runForSite()`
 *   nooit dubbel start. Geen wachtrij — de tweede tick wordt overgeslagen
 *   met een log.
 *
 * - Niet crashen op invalid cron. Een ongeldige `scheduleCron` (typo,
 *   leeg, te-veel-velden) wordt geskipt met een warning log; de andere
 *   sites blijven gewoon werken.
 */

import type { ScheduledTask } from "node-cron";

import { getDb, ensureSchema } from "~/lib/db/client";
import { sites } from "~/lib/db/schema";
import { recordError } from "~/lib/errors/store";

// node-cron is een CommonJS module. We laden 'm lazy zodat dit bestand
// zonder runtime-side-effects gewoon getypecheckt kan worden (bij build of
// in tests waar de scheduler nooit start).
let _cronImpl: typeof import("node-cron") | null = null;
async function loadCron(): Promise<typeof import("node-cron")> {
  if (_cronImpl) return _cronImpl;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _cronImpl = (await import("node-cron")) as typeof import("node-cron");
  return _cronImpl;
}

interface ScheduledSite {
  siteId: string;
  siteSlug: string;
  cron: string;
  task: ScheduledTask;
}

const scheduledBySiteId = new Map<string, ScheduledSite>();
const runningSiteIds = new Set<string>();

let pollTimer: NodeJS.Timeout | null = null;
let started = false;
let stopping = false;

/**
 * Bron-of-truth check: mag/moet de scheduler überhaupt draaien? Default aan
 * in productie, default uit in dev (tenzij `ENABLE_SCHEDULER_IN_DEV=true`),
 * altijd uit als `DISABLE_INPROCESS_SCHEDULER=true`.
 */
export function isSchedulerEnabled(): boolean {
  if (process.env.DISABLE_INPROCESS_SCHEDULER === "true") return false;
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) return true;
  return process.env.ENABLE_SCHEDULER_IN_DEV === "true";
}

/**
 * Start de scheduler. Idempotent: een tweede call doet niets. Gebruikt door
 * `apps/web/instrumentation.ts` bij Next-boot.
 */
export async function startScheduler(): Promise<void> {
  if (started) return;
  if (!isSchedulerEnabled()) {
    console.log(
      JSON.stringify({
        stage: "scheduler-skip",
        reason:
          process.env.DISABLE_INPROCESS_SCHEDULER === "true"
            ? "DISABLE_INPROCESS_SCHEDULER=true"
            : "non-production zonder ENABLE_SCHEDULER_IN_DEV=true",
      })
    );
    return;
  }
  started = true;
  console.log(JSON.stringify({ stage: "scheduler-start" }));

  // Graceful shutdown: stop the poll-loop + cron tasks on SIGTERM/SIGINT so a
  // container restart tears the scheduler down cleanly instead of being killed
  // mid-tick. Registered once per process.
  registerShutdownHandlers();

  // Initial sync + poll-loop. De interval is in ms; minimaal 15s om te
  // voorkomen dat een tik-overflow het proces wegblaast.
  const pollMs = Math.max(15_000, Number(process.env.SCHEDULER_POLL_INTERVAL_MS ?? 60_000));
  await syncScheduledJobs();
  pollTimer = setInterval(() => {
    if (stopping) return;
    syncScheduledJobs().catch((err) => {
      console.warn(
        JSON.stringify({ stage: "scheduler-poll-failed", error: (err as Error).message })
      );
      void recordError({
        source: "scheduler",
        severity: "error",
        message: `Scheduler poll failed: ${(err as Error).message}`,
        stack: (err as Error).stack,
        context: { stage: "scheduler-poll-failed" },
      });
    });
  }, pollMs);
  // Niet meetellen voor "het proces moet open blijven" — laat Next zelf bepalen.
  pollTimer.unref?.();
}

/**
 * Stop alle scheduled tasks + de poll-loop. Gebruikt door tests en (in
 * theorie) door een graceful-shutdown handler. Idempotent.
 */
export async function stopScheduler(): Promise<void> {
  stopping = true;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  for (const [siteId, entry] of scheduledBySiteId) {
    try {
      entry.task.stop();
    } catch (err) {
      console.warn(
        JSON.stringify({
          stage: "scheduler-stop-task-failed",
          siteId,
          error: (err as Error).message,
        })
      );
    }
  }
  scheduledBySiteId.clear();
  runningSiteIds.clear();
  started = false;
  stopping = false;
}

let shutdownHandlersRegistered = false;
/** Register SIGTERM/SIGINT → stopScheduler once per process. */
function registerShutdownHandlers(): void {
  if (shutdownHandlersRegistered) return;
  shutdownHandlersRegistered = true;
  const handler = () => {
    void stopScheduler();
  };
  process.once("SIGTERM", handler);
  process.once("SIGINT", handler);
}

/**
 * Force-resync nu, niet later. Handig voor manual triggers vanuit tests of
 * een toekomstige admin-UI "Refresh scheduler". Veilig om te roepen ook als
 * de scheduler uitstaat.
 */
export async function refreshSchedulerNow(): Promise<void> {
  if (!started) return;
  await syncScheduledJobs();
}

/**
 * Diff de huidige scheduler-state tegen wat in de DB staat:
 *   - nieuwe site met cron       → plan in
 *   - cron gewijzigd             → unplan + opnieuw inplannen
 *   - site verwijderd / cron gewist → unplan
 *   - bestaande job ongewijzigd  → niks
 *
 * Wordt periodiek aangeroepen (zie pollTimer) en op startup.
 */
async function syncScheduledJobs(): Promise<void> {
  await ensureSchema();
  const db = getDb();
  const rows = await db
    .select({
      id: sites.id,
      slug: sites.slug,
      scheduleCron: sites.scheduleCron,
    })
    .from(sites);

  const cron = await loadCron();

  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(row.id);
    const cronExpr = (row.scheduleCron ?? "").trim();
    const existing = scheduledBySiteId.get(row.id);

    if (!cronExpr) {
      if (existing) {
        // Site had cron, nu niet meer → unplan
        try {
          existing.task.stop();
        } catch {
          /* ignore */
        }
        scheduledBySiteId.delete(row.id);
        console.log(
          JSON.stringify({
            stage: "scheduler-unscheduled",
            siteId: row.id,
            siteSlug: row.slug,
            reason: "empty cron",
          })
        );
      }
      continue;
    }

    if (!cron.validate(cronExpr)) {
      if (existing) {
        try {
          existing.task.stop();
        } catch {
          /* ignore */
        }
        scheduledBySiteId.delete(row.id);
      }
      console.warn(
        JSON.stringify({
          stage: "scheduler-invalid-cron",
          siteId: row.id,
          siteSlug: row.slug,
          cron: cronExpr,
        })
      );
      void recordError({
        siteId: row.id,
        source: "scheduler",
        severity: "warn",
        message: `Invalid cron expression for site ${row.slug}: "${cronExpr}"`,
        context: { siteSlug: row.slug, cron: cronExpr, stage: "scheduler-invalid-cron" },
      });
      continue;
    }

    if (existing && existing.cron === cronExpr) {
      continue; // ongewijzigd
    }

    if (existing) {
      try {
        existing.task.stop();
      } catch {
        /* ignore */
      }
      scheduledBySiteId.delete(row.id);
    }

    const task = cron.schedule(
      cronExpr,
      () => {
        void triggerSiteRun(row.id, row.slug);
      },
      {
        // Default to UTC (not the host TZ): the ISO-week caps and the rolling
        // 7-day cost sums are all computed in UTC, so a host in another zone
        // would fire crons and reset budgets on disagreeing clocks around week
        // edges / DST. Override via SCHEDULER_TIMEZONE when intentional.
        timezone: process.env.SCHEDULER_TIMEZONE || "UTC",
      }
    );
    // Sommige node-cron versies starten direct na schedule(), andere niet.
    // start() is idempotent — gewoon altijd aanroepen.
    try {
      task.start();
    } catch {
      /* ignore */
    }

    scheduledBySiteId.set(row.id, {
      siteId: row.id,
      siteSlug: row.slug,
      cron: cronExpr,
      task,
    });

    console.log(
      JSON.stringify({
        stage: existing ? "scheduler-rescheduled" : "scheduler-scheduled",
        siteId: row.id,
        siteSlug: row.slug,
        cron: cronExpr,
      })
    );
  }

  // Verwijderde sites unschedulen
  for (const [siteId, entry] of scheduledBySiteId) {
    if (!seen.has(siteId)) {
      try {
        entry.task.stop();
      } catch {
        /* ignore */
      }
      scheduledBySiteId.delete(siteId);
      console.log(
        JSON.stringify({
          stage: "scheduler-unscheduled",
          siteId,
          siteSlug: entry.siteSlug,
          reason: "site removed",
        })
      );
    }
  }
}

/**
 * Een cron-tick voor `siteId`: pak het hoogste-prioriteit queued topic en
 * draai de pipeline. Skip als er al een run voor deze site loopt
 * (mutex), of als er geen queued topics zijn.
 *
 * Auto-publish wordt — net als in het cron-endpoint — afgehandeld als de
 * site `autoPublish=true` heeft.
 */
async function triggerSiteRun(siteId: string, siteSlug: string): Promise<void> {
  if (runningSiteIds.has(siteId)) {
    console.log(
      JSON.stringify({
        stage: "scheduler-skip-overlap",
        siteId,
        siteSlug,
        reason: "vorige run nog bezig",
      })
    );
    return;
  }
  runningSiteIds.add(siteId);
  const startedAt = Date.now();
  try {
    // Lazy imports — dezelfde modules pakken sharp / fal / providers in en
    // we willen ze niet bij Next-boot al evalueren.
    const { getSiteById } = await import("~/lib/sites");
    const { listTopicsForSite } = await import("~/lib/topics");

    const site = await getSiteById(siteId);
    if (!site) {
      console.warn(
        JSON.stringify({ stage: "scheduler-site-missing", siteId, siteSlug })
      );
      return;
    }

    const queued = await listTopicsForSite(site.id, "queued");
    if (queued.length === 0) {
      console.log(
        JSON.stringify({
          stage: "scheduler-skip-empty",
          siteId,
          siteSlug,
          reason: "geen queued topics",
        })
      );
      return;
    }

    const topic = queued.sort(
      (a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt)
    )[0]!;

    console.log(
      JSON.stringify({
        stage: "scheduler-trigger",
        siteId,
        siteSlug,
        topicId: topic.id,
        topicTitle: topic.title,
      })
    );

    const { runForSite } = await import("~/lib/pipeline/runForSite");
    const result = await runForSite(site, topic);

    // Auto-publish path — congruent met /api/cron/[siteSlug]/route.ts.
    if (
      result.verdict === "published" &&
      result.draftId &&
      (site as { autoPublish?: boolean }).autoPublish
    ) {
      try {
        const { getDraft } = await import("~/lib/drafts");
        const { publishDraft } = await import("~/lib/publish");
        const draft = await getDraft(result.draftId);
        if (draft) {
          const pub = await publishDraft(draft, site);
          console.log(
            JSON.stringify({
              stage: "scheduler-auto-published",
              siteId,
              siteSlug,
              draftId: result.draftId,
              destination: pub.destination,
              url: pub.url,
            })
          );
        }
      } catch (err) {
        console.warn(
          JSON.stringify({
            stage: "scheduler-auto-publish-failed",
            siteId,
            siteSlug,
            draftId: result.draftId,
            error: (err as Error).message,
          })
        );
      }
    }

    console.log(
      JSON.stringify({
        stage: "scheduler-done",
        siteId,
        siteSlug,
        verdict: result.verdict,
        durationMs: Date.now() - startedAt,
        costUsd: result.costUsd,
      })
    );
  } catch (err) {
    // runForSite vangt zijn eigen errors normaal gesproken (zie het finally-
    // achtige try/catch onderin de pipeline), maar als hier toch iets door
    // breekt, mag het de scheduler NIET kapot maken.
    const errObj = err as Error;
    console.error(
      JSON.stringify({
        stage: "scheduler-run-failed",
        siteId,
        siteSlug,
        error: errObj.message,
      })
    );
    // Dit is fatal omdat het betekent dat zelfs het pipeline-try/catch faalde —
    // de operator moet hier z.s.m. naar kijken. Triggert e-mail (rate-limited).
    void recordError({
      siteId,
      source: "scheduler",
      severity: "fatal",
      message: `Scheduler trigger for ${siteSlug} crashed outside pipeline: ${errObj.message}`,
      stack: errObj.stack,
      context: {
        siteSlug,
        durationMs: Date.now() - startedAt,
        stage: "scheduler-run-failed",
      },
    });
  } finally {
    runningSiteIds.delete(siteId);
  }
}

/** Test/debug-only: hoeveel sites zijn ingepland? */
export function _getScheduledSnapshot(): Array<{ siteId: string; siteSlug: string; cron: string }> {
  return Array.from(scheduledBySiteId.values()).map((e) => ({
    siteId: e.siteId,
    siteSlug: e.siteSlug,
    cron: e.cron,
  }));
}

/**
 * Test-only: directly invoke the per-site trigger so we can assert mutex
 * behaviour without spinning up node-cron and waiting for ticks. The
 * production path goes through node-cron → `triggerSiteRun`; this hook
 * exposes the same function with the same mutex.
 */
export function _triggerSiteRunForTest(siteId: string, siteSlug: string): Promise<void> {
  return triggerSiteRun(siteId, siteSlug);
}

/** Test-only: force-resync without requiring startScheduler() to have run. */
export function _syncScheduledJobsForTest(): Promise<void> {
  return syncScheduledJobs();
}

/** Test-only: wipe in-memory scheduler state. */
export function _resetSchedulerForTest(): void {
  for (const [, entry] of scheduledBySiteId) {
    try {
      entry.task.stop();
    } catch {
      /* ignore */
    }
  }
  scheduledBySiteId.clear();
  runningSiteIds.clear();
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  started = false;
  stopping = false;
}

/** Test-only: directly poke the mutex set so tests can simulate an in-flight run. */
export function _setRunningSiteIdsForTest(ids: string[]): void {
  runningSiteIds.clear();
  for (const id of ids) runningSiteIds.add(id);
}

/** Test-only: read the mutex set. */
export function _getRunningSiteIdsForTest(): string[] {
  return Array.from(runningSiteIds);
}
