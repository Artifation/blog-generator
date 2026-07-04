import { describe, expect, it } from "vitest";
import { createProviderRegistry } from "@/llm/client";

describe("createProviderRegistry availability", () => {
  it("reports all providers available when all env keys set", () => {
    const reg = createProviderRegistry({
      ANTHROPIC_API_KEY: "x",
      GEMINI_API_KEY: "x",
      GROQ_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    expect(reg.has("anthropic")).toBe(true);
    expect(reg.has("gemini")).toBe(true);
    expect(reg.has("groq")).toBe(true);
  });

  it("reports anthropic unavailable when ANTHROPIC_API_KEY missing", () => {
    const reg = createProviderRegistry({
      GEMINI_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    expect(reg.has("anthropic")).toBe(false);
    expect(reg.has("gemini")).toBe(true);
  });

  it("does NOT throw on construction when keys missing", () => {
    expect(() =>
      createProviderRegistry({} as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("get() throws only when the unavailable provider is actually requested", () => {
    const reg = createProviderRegistry({
      GEMINI_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    expect(() => reg.get("anthropic")).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => reg.get("gemini")).not.toThrow();
  });
});
