/**
 * Per-call deadlines for LLM / image-generation requests.
 *
 * Without these, a hung upstream blocks the whole pipeline indefinitely: the
 * in-process scheduler holds its per-site mutex forever (so future cron ticks
 * for that site are silently skipped) and a GitHub-Actions run hangs until the
 * job-level timeout kills it. Retries are governed by runAgent, so SDK clients
 * are configured with maxRetries: 0 and an explicit timeout.
 */

/** Chat-completion deadline (Anthropic / Groq). */
export const LLM_TIMEOUT_MS = 120_000;
/** Gemini deadline — larger because grounded/search calls are slower. */
export const GEMINI_TIMEOUT_MS = 180_000;
/** Image generation + download deadline. */
export const IMAGE_TIMEOUT_MS = 120_000;

/**
 * Race a promise against a timeout. Note: this unblocks the caller but does not
 * cancel the underlying work (use an AbortSignal where the API supports one).
 * It exists to bound wall-clock for SDKs whose long-poll/subscribe paths have
 * no built-in deadline.
 */
export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
