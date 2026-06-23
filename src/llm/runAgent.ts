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

      const json = extractJson(raw.text);
      const parsed = input.schema.parse(json);
      return { parsed, raw };
    } catch (err) {
      lastError = err as Error;
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
  const slice = candidate.slice(begin);
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
