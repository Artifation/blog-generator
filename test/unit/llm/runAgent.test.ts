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
});
