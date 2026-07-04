import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { LLMProvider } from "@/llm/types";

function makeProvider(text: string): LLMProvider {
  return {
    name: "anthropic",
    call: vi.fn(async () => ({
      text,
      inputTokens: 1,
      outputTokens: 1,
      model: "x",
      provider: "anthropic" as const,
    })),
  };
}

const noSleep = () => Promise.resolve();

describe("runAgent", () => {
  const schema = z.object({ greeting: z.string() });

  it("parses valid JSON response in code fence", async () => {
    const r = await runAgent(
      {
        provider: makeProvider('```json\n{"greeting":"hi"}\n```'),
        systemPrompt: "s",
        userPrompt: "u",
        model: "x",
        schema,
        maxTokens: 100,
      },
      noSleep
    );
    expect(r.parsed.greeting).toBe("hi");
  });

  it("extracts JSON without code fence", async () => {
    const r = await runAgent(
      {
        provider: makeProvider('Here you go: {"greeting":"hello"}'),
        systemPrompt: "s",
        userPrompt: "u",
        model: "x",
        schema,
        maxTokens: 100,
      },
      noSleep
    );
    expect(r.parsed.greeting).toBe("hello");
  });

  it("parses an unfenced object followed by trailing prose (Gemini grounding)", async () => {
    const r = await runAgent(
      {
        provider: makeProvider('Here is the result: {"greeting":"hi"}. Let me know if you need more!'),
        systemPrompt: "s",
        userPrompt: "u",
        model: "x",
        schema,
        maxTokens: 100,
      },
      noSleep
    );
    expect(r.parsed.greeting).toBe("hi");
  });

  it("ignores braces inside string values when extracting the object", async () => {
    const r = await runAgent(
      {
        provider: makeProvider('{"greeting":"a } b { c"}  …and some trailing note'),
        systemPrompt: "s",
        userPrompt: "u",
        model: "x",
        schema,
        maxTokens: 100,
      },
      noSleep
    );
    expect(r.parsed.greeting).toBe("a } b { c");
  });

  it("parses fenced JSON whose string value contains a markdown code fence", async () => {
    // The writer/content agents emit blog content that itself contains ``` code
    // fences. A non-greedy fence regex stops at the FIRST inner ```, truncating
    // the JSON mid-string -> 'Unterminated string in JSON'. The extractor must
    // find the real closing fence (or balance the braces) instead.
    const greeting = "Voorbeeld:\n```js\nconst x = 1;\n```\nKlaar.";
    const text = "```json\n" + JSON.stringify({ greeting }) + "\n```";
    const r = await runAgent(
      {
        provider: makeProvider(text),
        systemPrompt: "s",
        userPrompt: "u",
        model: "x",
        schema,
        maxTokens: 100,
      },
      noSleep
    );
    expect(r.parsed.greeting).toBe(greeting);
  });

  it("parses JSON with an embedded code fence even when the model omits the closing outer fence", async () => {
    // Long-output failure mode behind the user-reported
    // "Unterminated string in JSON at position 202" error: the model opens
    // ```json, emits an object whose string value contains a complete ```code```
    // block, but never writes the closing outer ```. Any fence-DELIMITED extractor
    // (greedy OR non-greedy) then mistakes the code block's ``` for the closing
    // fence and slices the JSON string in half. Only brace-balancing recovers it.
    const greeting = "Voorbeeld:\n```js\nconst x = 1;\n```\nKlaar.";
    const text = "```json\n" + JSON.stringify({ greeting }) + "\n"; // no closing ```
    const r = await runAgent(
      {
        provider: makeProvider(text),
        systemPrompt: "s",
        userPrompt: "u",
        model: "x",
        schema,
        maxTokens: 100,
      },
      noSleep
    );
    expect(r.parsed.greeting).toBe(greeting);
  });

  it("parses UNFENCED JSON whose string value contains a code fence (Gemini grounding shape)", async () => {
    // The model emits {…} with NO outer fence, but a string value contains a
    // complete ```code``` block. A fence-stripping extractor locks onto the inner
    // ``` and slices the JSON mid-string -> "No JSON found"/"Unterminated string".
    const greeting = "Voorbeeld:\n```js\nconst x = 1;\n```\nKlaar.";
    const text = JSON.stringify({ greeting }); // no outer fence at all
    const r = await runAgent(
      { provider: makeProvider(text), systemPrompt: "s", userPrompt: "u", model: "x", schema, maxTokens: 100 },
      noSleep
    );
    expect(r.parsed.greeting).toBe(greeting);
  });

  it("skips prose braces BEFORE the real fenced object (no regression from a naive first-bracket fix)", async () => {
    const text = 'Here is {an example}: ```json\n' + JSON.stringify({ greeting: "real" }) + "\n```";
    const r = await runAgent(
      { provider: makeProvider(text), systemPrompt: "s", userPrompt: "u", model: "x", schema, maxTokens: 100 },
      noSleep
    );
    expect(r.parsed.greeting).toBe("real");
  });

  it("skips a prose array before the real object", async () => {
    const text = "Options [a, b] then: " + JSON.stringify({ greeting: "real" });
    const r = await runAgent(
      { provider: makeProvider(text), systemPrompt: "s", userPrompt: "u", model: "x", schema, maxTokens: 100 },
      noSleep
    );
    expect(r.parsed.greeting).toBe("real");
  });

  it("repairs a trailing comma WITHOUT corrupting comma/bracket chars inside a string value", async () => {
    // The string value contains ", ]" — the old repair regex stripped that comma
    // too. The structural trailing comma after the value must be removed while the
    // string content stays byte-for-byte intact.
    const r = await runAgent(
      { provider: makeProvider('{"greeting":"a, ]",}'), systemPrompt: "s", userPrompt: "u", model: "x", schema, maxTokens: 100 },
      noSleep
    );
    expect(r.parsed.greeting).toBe("a, ]");
  });

  it("retries on parse failure (max 3 attempts)", async () => {
    const calls = ["bad", "still bad", '{"greeting":"ok"}'];
    let i = 0;
    const p: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: calls[i++]!,
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "anthropic" as const,
      })),
    };
    const r = await runAgent(
      {
        provider: p,
        systemPrompt: "s",
        userPrompt: "u",
        model: "x",
        schema,
        maxTokens: 100,
      },
      noSleep
    );
    expect(r.parsed.greeting).toBe("ok");
    expect(p.call).toHaveBeenCalledTimes(3);
  });

  it("throws after 3 failed retries", async () => {
    const p: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: "garbage",
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "anthropic" as const,
      })),
    };
    await expect(
      runAgent(
        {
          provider: p,
          systemPrompt: "s",
          userPrompt: "u",
          model: "x",
          schema,
          maxTokens: 100,
        },
        noSleep
      )
    ).rejects.toThrow(/parse/);
  });

  it("fails fast on a truncated (max_tokens) response instead of retrying the same request", async () => {
    // A truncated response is incomplete JSON; re-issuing the identical request
    // just truncates again and burns input tokens. runAgent should stop after
    // one call and surface an actionable 'truncated at maxTokens' error.
    const p: LLMProvider = {
      name: "gemini",
      call: vi.fn(async () => ({
        text: '{"greeting":"hi',
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "gemini" as const,
        truncated: true,
      })),
    };
    await expect(
      runAgent(
        { provider: p, systemPrompt: "s", userPrompt: "u", model: "x", schema, maxTokens: 256 },
        noSleep
      )
    ).rejects.toThrow(/truncat/i);
    expect(p.call).toHaveBeenCalledTimes(1);
  });

  it("truncation error names the maxTokens so the operator can raise it", async () => {
    const p = makeProvider('{"greeting":"hi');
    (p.call as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: '{"greeting":"hi',
      inputTokens: 1,
      outputTokens: 1,
      model: "x",
      provider: "anthropic",
      truncated: true,
    });
    await expect(
      runAgent(
        { provider: p, systemPrompt: "s", userPrompt: "u", model: "x", schema, maxTokens: 777 },
        noSleep
      )
    ).rejects.toThrow(/777/);
  });

  describe("retry backoff policy", () => {
    function makeFailingProvider(error: Error, attempts: { count: number }): LLMProvider {
      return {
        name: "anthropic",
        call: vi.fn(async () => {
          attempts.count++;
          throw error;
        }),
      };
    }

    function makeRecordingSleep(): { sleep: (ms: number) => Promise<void>; durations: number[] } {
      const durations: number[] = [];
      return {
        durations,
        sleep: (ms: number) => {
          durations.push(ms);
          return Promise.resolve();
        },
      };
    }

    it("uses long backoff (>= 60s) for Anthropic 529 overloaded errors", async () => {
      const err = new Error(
        '529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'
      );
      const attempts = { count: 0 };
      const provider = makeFailingProvider(err, attempts);
      const { sleep, durations } = makeRecordingSleep();

      await expect(
        runAgent(
          {
            provider,
            systemPrompt: "s",
            userPrompt: "u",
            model: "x",
            schema,
            maxTokens: 100,
            maxAttempts: 3,
          },
          sleep
        )
      ).rejects.toThrow(/Overloaded/);

      // Two sleeps between three attempts. Both should be >= 60s for 529.
      expect(durations).toHaveLength(2);
      expect(durations[0]!).toBeGreaterThanOrEqual(60_000);
      expect(durations[1]!).toBeGreaterThanOrEqual(120_000);
    });

    it("detects overloaded_error message even without explicit 529 status", async () => {
      const err = new Error(
        '"type":"overloaded_error","message":"Anthropic is overloaded"'
      );
      const attempts = { count: 0 };
      const { sleep, durations } = makeRecordingSleep();
      await expect(
        runAgent(
          {
            provider: makeFailingProvider(err, attempts),
            systemPrompt: "s",
            userPrompt: "u",
            model: "x",
            schema,
            maxTokens: 100,
            maxAttempts: 2,
          },
          sleep
        )
      ).rejects.toThrow();
      expect(durations).toHaveLength(1);
      expect(durations[0]!).toBeGreaterThanOrEqual(60_000);
    });

    it("uses short backoff (< 30s) for other errors (parse failures, 4xx, etc.)", async () => {
      const err = new Error("400 invalid_request_error");
      const attempts = { count: 0 };
      const { sleep, durations } = makeRecordingSleep();

      await expect(
        runAgent(
          {
            provider: makeFailingProvider(err, attempts),
            systemPrompt: "s",
            userPrompt: "u",
            model: "x",
            schema,
            maxTokens: 100,
            maxAttempts: 3,
          },
          sleep
        )
      ).rejects.toThrow();

      expect(durations).toHaveLength(2);
      expect(durations[0]!).toBeLessThan(30_000);
      expect(durations[1]!).toBeLessThan(30_000);
    });

    it("retries 5xx errors with short backoff (transient server issues)", async () => {
      const err = new Error("500 internal_server_error");
      const attempts = { count: 0 };
      const { sleep, durations } = makeRecordingSleep();
      await expect(
        runAgent(
          {
            provider: makeFailingProvider(err, attempts),
            systemPrompt: "s",
            userPrompt: "u",
            model: "x",
            schema,
            maxTokens: 100,
            maxAttempts: 2,
          },
          sleep
        )
      ).rejects.toThrow();
      expect(durations).toHaveLength(1);
      expect(durations[0]!).toBeLessThan(30_000);
    });

    it("succeeds on retry after initial 529 if next attempt returns valid JSON", async () => {
      let calls = 0;
      const provider: LLMProvider = {
        name: "anthropic",
        call: vi.fn(async () => {
          calls++;
          if (calls === 1) {
            throw new Error(
              '529 {"error":{"type":"overloaded_error","message":"Overloaded"}}'
            );
          }
          return {
            text: '{"greeting":"recovered"}',
            inputTokens: 1,
            outputTokens: 1,
            model: "x",
            provider: "anthropic" as const,
          };
        }),
      };
      const { sleep, durations } = makeRecordingSleep();
      const result = await runAgent(
        {
          provider,
          systemPrompt: "s",
          userPrompt: "u",
          model: "x",
          schema,
          maxTokens: 100,
        },
        sleep
      );
      expect(result.parsed.greeting).toBe("recovered");
      expect(durations).toHaveLength(1);
      expect(durations[0]!).toBeGreaterThanOrEqual(60_000);
    });
  });

  describe("JSON repair", () => {
    it("repairs unquoted property names (Claude long-output failure mode)", async () => {
      // Simulates Claude losing JSON discipline halfway through a long output:
      // it started with quoted keys, then slipped into JS-object syntax mid-way.
      const broken = `{
  "greeting": "hi",
  count: 3
}`;
      const r = await runAgent(
        {
          provider: makeProvider(broken),
          systemPrompt: "s",
          userPrompt: "u",
          model: "x",
          schema: z.object({ greeting: z.string(), count: z.number() }),
          maxTokens: 100,
        },
        noSleep
      );
      expect(r.parsed.greeting).toBe("hi");
      expect(r.parsed.count).toBe(3);
    });

    it("repairs multiple unquoted property names in nested objects", async () => {
      const broken = `{
  "outline": {
    h1: "Test heading",
    "body": "ok",
    count: 5
  }
}`;
      const r = await runAgent(
        {
          provider: makeProvider(broken),
          systemPrompt: "s",
          userPrompt: "u",
          model: "x",
          schema: z.object({
            outline: z.object({ h1: z.string(), body: z.string(), count: z.number() }),
          }),
          maxTokens: 100,
        },
        noSleep
      );
      expect(r.parsed.outline.h1).toBe("Test heading");
      expect(r.parsed.outline.count).toBe(5);
    });
  });
});
