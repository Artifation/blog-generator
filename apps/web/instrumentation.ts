/**
 * Next.js instrumentation hook — draait éénmaal bij server-boot.
 *
 * We gebruiken 'm voor de in-process scheduler. Andere boot-side-effects
 * (telemetry, sentry, etc.) horen hier ook thuis als ze ooit komen.
 *
 * Next roept `register()` aan per server-runtime, dus we guarden tegen
 * edge-runtime (waar `node-cron` niet draait) en tegen dubbele init bij
 * hot-reload in dev.
 */

declare global {
  // eslint-disable-next-line no-var
  var __schedulerBooted: boolean | undefined;
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dev (en build) roepen register() vaker aan dan je denkt — bij file-save,
  // bij routes-rebuild, etc. Een global flag voorkomt dat we de poll-loop
  // dubbel opzetten.
  if (globalThis.__schedulerBooted) return;
  globalThis.__schedulerBooted = true;

  try {
    const { startScheduler } = await import("./lib/scheduler/index");
    await startScheduler();
  } catch (err) {
    // Een gefaalde scheduler-boot mag de webapp niet plat leggen. We loggen
    // 'm in JSON zodat het bij de andere pipeline-logs past.
    console.error(
      JSON.stringify({
        stage: "scheduler-boot-failed",
        error: (err as Error).message,
      })
    );
  }
}
