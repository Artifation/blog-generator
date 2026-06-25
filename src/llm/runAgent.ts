import type { z } from "zod";
import type { LLMProvider, LLMResponse } from "./types.ts";

export interface RunAgentInput<T extends z.ZodTypeAny> {
  provider: LLMProvider;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
  temperature?: number;
  schema: T;
  maxAttempts?: number;
  /** Geef door aan provider — voor Gemini activeert dit Google-Search grounding. */
  useSearch?: boolean;
}

export interface RunAgentResult<T extends z.ZodTypeAny> {
  parsed: z.infer<T>;
  raw: LLMResponse;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * The model hit its output-token cap, so the JSON is truncated/incomplete.
 * Thrown (and NOT retried) by runAgent: re-issuing the identical request just
 * truncates again at the same cap, burning full input tokens each time.
 */
export class TruncatedResponseError extends Error {
  readonly maxTokens: number;
  constructor(maxTokens: number, model: string) {
    super(
      `LLM output truncated at maxTokens=${maxTokens} (model ${model}). ` +
        `Raise maxTokens for this agent — retrying the same request will keep truncating.`,
    );
    this.name = "TruncatedResponseError";
    this.maxTokens = maxTokens;
  }
}

/**
 * Anthropic returns HTTP 529 + body `{"type":"error","error":{"type":"overloaded_error",...}}`
 * when its infrastructure can't accept new requests. Short retry-backoff (the
 * default 2^attempt seconds) is useless here because overload windows last
 * minutes, not seconds. We need long backoff for these specifically — without
 * making non-overload errors slow too.
 */
function isOverloadedError(err: Error): boolean {
  const msg = err.message || "";
  return /529\b/.test(msg) || /overloaded_error/.test(msg) || /\boverloaded\b/i.test(msg);
}

/**
 * Backoff in milliseconds for the given attempt number (1-indexed).
 * - Overloaded errors: 60s, 120s, 240s — covers typical 5-15 min capacity dips
 * - Other errors: 2s, 4s, 8s — same fast retry as before for transient noise
 */
function backoffMs(attempt: number, isOverloaded: boolean): number {
  if (isOverloaded) {
    // 60s · 2^(attempt-1) + small jitter to avoid thundering-herd if multiple
    // agents retry the same overload window at once.
    const base = 60_000 * 2 ** (attempt - 1);
    const jitter = Math.floor(Math.random() * 5_000);
    return base + jitter;
  }
  return 2 ** attempt * 1000;
}

export async function runAgent<T extends z.ZodTypeAny>(
  input: RunAgentInput<T>,
  sleepImpl: (ms: number) => Promise<void> = defaultSleep
): Promise<RunAgentResult<T>> {
  const maxAttempts = input.maxAttempts ?? 3;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = await input.provider.call({
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        model: input.model,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        useSearch: input.useSearch,
      });

      if (raw.truncated) {
        // Output cap hit → incomplete JSON. Fail fast; don't retry (see class doc).
        throw new TruncatedResponseError(input.maxTokens, input.model);
      }

      const json = extractJson(raw.text);
      const parsed = input.schema.parse(json);
      return { parsed, raw };
    } catch (err) {
      lastError = err as Error;
      // Truncation is deterministic at a fixed maxTokens — surface it immediately
      // instead of burning the remaining attempts on the same doomed request.
      if (err instanceof TruncatedResponseError) throw err;
      if (attempt === maxAttempts) break;
      await sleepImpl(backoffMs(attempt, isOverloadedError(lastError)));
    }
  }
  throw new Error(
    `runAgent failed to parse after ${maxAttempts} attempts: ${lastError?.message}`
  );
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const candidate = fence ? fence[1]! : text;
  const start = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  const begin =
    start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
  if (begin === -1) throw new Error("No JSON found in response");
  // Slice to the END of the matching container, not the end of the string, so
  // trailing prose ("…here is the result {…}. Let me know!") doesn't force a
  // parse failure + full retry. This is common with Gemini grounding output.
  const slice = extractBalanced(candidate, begin) ?? candidate.slice(begin);
  try {
    return JSON.parse(slice);
  } catch (originalErr) {
    // Fallback: probeer common LLM-fouten te repareren voordat we opgeven
    try {
      const repaired = repairJson(slice);
      return JSON.parse(repaired);
    } catch {
      throw originalErr;
    }
  }
}

/**
 * Return the substring from `begin` (a `{` or `[`) to its matching close,
 * tracking depth while respecting string/escape state. Returns null when the
 * container is unbalanced (caller then falls back to the raw slice).
 */
function extractBalanced(s: string, begin: number): string | null {
  const open = s[begin];
  if (open !== "{" && open !== "[") return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = begin; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(begin, i + 1);
    }
  }
  return null;
}

/**
 * Repareer veelvoorkomende LLM-JSON fouten:
 * - Smart quotes (curly) → straight quotes
 * - Trailing commas vóór ] of }
 * - Onverpakte double-quotes in HTML-attributen binnen string-values
 *   (vervang `="..."` patroon binnen JSON-string door `='...'`)
 * - Unquoted property names (Claude valt soms terug op JS-object-syntax bij
 *   lange outputs — `foo: "bar"` → `"foo": "bar"`).
 */
function repairJson(s: string): string {
  let r = s;
  // Smart quotes → straight
  r = r.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  // Trailing comma vóór ] of }
  r = r.replace(/,(\s*[}\]])/g, "$1");
  // HTML attribute quotes binnen string-values: vervang `="` door `='` en `"` daarna door `'`
  // Risico: vals-positief op echte JSON-quotes. We doen het alleen voor HTML-achtige patronen.
  // Pattern: `(letter|=)"` binnen een al-open string. Conservatief: replace patroon `\sclass="..."` etc.
  r = r.replace(/(\s(?:class|id|href|src|alt|rel|target|style)=)"([^"]*?)"/g, "$1'$2'");
  // Unquoted property names — komt voor wanneer Claude bij een lang object
  // halverwege de JSON-discipline verliest. Match alleen aan het begin van
  // een regel (na newline + whitespace) gevolgd door identifier + colon, om
  // false-positives in stringwaardes te vermijden.
  r = r.replace(/([{,]\s*\n\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3');
  return r;
}
