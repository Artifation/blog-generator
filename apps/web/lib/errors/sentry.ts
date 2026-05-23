/**
 * Optionele Sentry-integratie via DYNAMIC import.
 *
 * Wordt alleen actief als:
 *   1. process.env.SENTRY_DSN is gezet, EN
 *   2. de gebruiker `@sentry/node` zelf heeft geïnstalleerd
 *      (we voegen het NIET toe aan package.json om dep-conflicts te vermijden)
 *
 * Werkt als no-op als één van beide condities niet vervuld is. Logt één
 * waarschuwing per proces — geen crash, geen herhaling.
 *
 * Setup voor wie het wil:
 *   npm install @sentry/node
 *   SENTRY_DSN=https://...@sentry.io/123 in env
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

let initialized = false;
let initAttempted = false;
let sentryModule: any = null;
let warningEmitted = false;

interface SentryEnv {
  dsn?: string;
  environment?: string;
  release?: string;
}

function readEnv(): SentryEnv {
  return {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
  };
}

/**
 * Lazy-loads @sentry/node and initialises the SDK exactly once. Returns the
 * Sentry namespace on success, null otherwise. Never throws.
 */
async function ensureSentry(): Promise<any | null> {
  if (initialized) return sentryModule;
  if (initAttempted) return sentryModule; // failed already, don't keep retrying
  initAttempted = true;

  const env = readEnv();
  if (!env.dsn) return null;

  try {
    // Dynamic import keeps the dep optional. The string-concat trick prevents
    // bundlers from resolving the module at build time, which would fail when
    // @sentry/node is not installed.
    const moduleName = "@sentry/" + "node";
    sentryModule = await import(/* webpackIgnore: true */ moduleName);
    sentryModule.init({
      dsn: env.dsn,
      environment: env.environment,
      release: env.release,
      // The pipeline does its own stack capture + DB persistence; we use
      // Sentry purely as an optional alerting / aggregation channel.
      tracesSampleRate: 0,
      profilesSampleRate: 0,
    });
    initialized = true;
    return sentryModule;
  } catch (err) {
    if (!warningEmitted) {
      warningEmitted = true;
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          stage: "errors/sentry",
          warning:
            "SENTRY_DSN is set but @sentry/node could not be loaded — Sentry forwarding disabled.",
          hint: "Run `npm install @sentry/node` to enable.",
          error: (err as Error).message,
        }),
      );
    }
    return null;
  }
}

export interface SentryForwardInput {
  message: string;
  stack?: string;
  severity: "error" | "warn" | "fatal";
  source: string;
  siteId?: string | null;
  context?: Record<string, unknown>;
}

/**
 * Fire-and-forget forward naar Sentry. Resolves stilletjes als Sentry niet
 * geconfigureerd of niet geïnstalleerd is. Gooit nooit.
 */
export async function forwardToSentry(input: SentryForwardInput): Promise<void> {
  try {
    const Sentry = await ensureSentry();
    if (!Sentry) return;

    const sentrySeverity =
      input.severity === "fatal"
        ? "fatal"
        : input.severity === "warn"
          ? "warning"
          : "error";

    // Reconstruct an Error so Sentry's grouping has a stack to fingerprint on.
    const err = new Error(input.message);
    if (input.stack) err.stack = input.stack;

    Sentry.withScope((scope: any) => {
      scope.setLevel(sentrySeverity);
      scope.setTag("source", input.source);
      if (input.siteId) scope.setTag("site_id", input.siteId);
      if (input.context && Object.keys(input.context).length > 0) {
        scope.setContext("event_context", input.context);
      }
      Sentry.captureException(err);
    });
  } catch {
    // never throw from the error-handler
  }
}

/**
 * Test-only: reset module state. Niet exporteren via een public re-export.
 */
export function _resetSentryForTests(): void {
  initialized = false;
  initAttempted = false;
  sentryModule = null;
  warningEmitted = false;
}
