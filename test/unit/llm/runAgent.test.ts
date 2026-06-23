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
