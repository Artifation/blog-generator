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
  /** runAgent never retries an error flagged non-retryable (see the loop). */
  readonly nonRetryable = true;
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
  // Accumulate tokens across ALL attempts (every retry still consumed input
  // tokens upstream), so the returned cost reflects real spend, not just the
  // final successful call.
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

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
      totalInputTokens += raw.inputTokens ?? 0;
      totalOutputTokens += raw.outputTokens ?? 0;

      if (raw.truncated) {
        // Output cap hit → incomplete JSON. Fail fast; don't retry (see class doc).
        throw new TruncatedResponseError(input.maxTokens, input.model);
      }

      const json = extractJson(raw.text);
      const parsed = input.schema.parse(json);
      return {
        parsed,
        raw: { ...raw, inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    } catch (err) {
      lastError = err as Error;
      // Some errors are deterministic for an identical request (truncation at a
      // fixed maxTokens, a refusal) — surface them immediately instead of burning
      // the remaining attempts on the same doomed call.
      if ((err as { nonRetryable?: boolean } | null)?.nonRetryable) throw err;
      if (attempt === maxAttempts) break;
      await sleepImpl(backoffMs(attempt, isOverloadedError(lastError)));
    }
  }
  throw new Error(
    `runAgent failed to parse after ${maxAttempts} attempts: ${lastError?.message}`
  );
}

function extractJson(text: string): unknown {
  // Scan EVERY candidate JSON start ({ or [) in the raw text, left to right, and
  // return the first one that both BALANCES (string/escape-aware) and PARSES. We
  // deliberately do NOT strip a leading ``` fence or lock onto the first bracket:
  //  - Content agents emit JSON whose string values contain markdown ``` fences
  //    AND stray { }. A fence-delimited or first-bracket extractor slices those
  //    in half ("Unterminated string in JSON") — extractBalanced walks the real
  //    string boundaries so inner ``` / braces are just ordinary characters.
  //  - Parse-validating each candidate skips prose like "{an example}" or
  //    "[a, b]" that precedes the real object instead of locking onto it.
  const candidates: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[") candidates.push(i);
  }
  if (candidates.length === 0) throw new Error("No JSON found in response");

  let firstError: unknown = null;
  for (const begin of candidates) {
    const balanced = extractBalanced(text, begin);
    if (!balanced) continue;
    try {
      return JSON.parse(balanced);
    } catch (err) {
      if (firstError === null) firstError = err;
      // Fallback: repair common LLM-JSON mistakes before moving on.
      try {
        return JSON.parse(repairJson(balanced));
      } catch {
        /* try the next candidate */
      }
    }
  }

  // No candidate balanced+parsed (e.g. genuinely unbalanced/truncated braces not
  // flagged as `truncated`). Fall back to the classic first-bracket→end-of-string
  // slice + repair so trailing-prose truncation still gets a recovery attempt.
  const begin = candidates[0]!;
  const slice = text.slice(begin);
  try {
    return JSON.parse(slice);
  } catch (originalErr) {
    try {
      return JSON.parse(repairJson(slice));
    } catch {
      throw firstError ?? originalErr;
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
 * Split `s` into alternating segments tagged in-string / out-of-string, tracking
 * escape state. Best-effort on malformed input, but for the common repair target
 * (structurally-broken JSON with intact string values) it reliably protects the
 * CONTENT of string values from the structural regexes below.
 */
function splitJsonSegments(s: string): { text: string; inStr: boolean }[] {
  const segs: { text: string; inStr: boolean }[] = [];
  let buf = "";
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr) {
      buf += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        segs.push({ text: buf, inStr: true });
        buf = "";
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      if (buf) segs.push({ text: buf, inStr: false });
      buf = '"';
      inStr = true;
      continue;
    }
    buf += ch;
  }
  if (buf) segs.push({ text: buf, inStr });
  return segs;
}

/**
 * Repareer veelvoorkomende LLM-JSON fouten — maar UITSLUITEND op de structurele
 * (buiten-string) delen, zodat we nooit de inhoud van een string-value stukmaken
 * (een komma of `word:` binnen een string is data, geen syntax):
 * - Smart quotes (curly) → straight quotes (alleen als delimiter, buiten strings)
 * - Trailing commas vóór ] of }
 * - Unquoted property names (Claude valt soms terug op JS-object-syntax bij
 *   lange outputs — `foo: "bar"` → `"foo": "bar"`).
 *
 * (De vroegere HTML-attribuut-quote-repair is verwijderd: hoog risico op
 * false-positives en extractBalanced dekt de trailing-prose-case al af.)
 */
function repairJson(s: string): string {
  return splitJsonSegments(s)
    .map((seg) => {
      if (seg.inStr) return seg.text; // never touch string CONTENT
      let t = seg.text;
      // Smart quotes used as delimiters → straight.
      t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
      // Trailing comma before ] or }.
      t = t.replace(/,(\s*[}\]])/g, "$1");
      // Unquoted property names (JS-object-style keys).
      t = t.replace(/([{,]\s*\n?\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3');
      return t;
    })
    .join("");
}
