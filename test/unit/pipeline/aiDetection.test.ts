import { describe, expect, it, vi } from "vitest";
import { detectAiContent } from "@/pipeline/aiDetection";

function makeJsonFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

describe("detectAiContent — GPTZero", () => {
  it("parses GPTZero response and returns ai_score_pct", async () => {
    const fetchImpl = makeJsonFetch(200, {
      documents: [{ class_probabilities: { ai: 0.72, human: 0.28 } }],
    });
    const result = await detectAiContent({
      text: "Dit is een test.",
      apiKey: "test-key",
      provider: "gptzero",
      fetchImpl,
    });
    expect(result.provider).toBe("gptzero");
    expect(result.ai_score_pct).toBe(72);
    expect(result.human_score_pct).toBe(28);
  });

  it("defaults to gptzero when provider is omitted", async () => {
    const fetchImpl = makeJsonFetch(200, {
      documents: [{ class_probabilities: { ai: 0.1, human: 0.9 } }],
    });
    const result = await detectAiContent({
      text: "Dit is een test.",
      apiKey: "test-key",
      fetchImpl,
    });
    expect(result.provider).toBe("gptzero");
    expect(result.ai_score_pct).toBe(10);
  });

  it("throws on non-200 GPTZero response", async () => {
    const fetchImpl = makeJsonFetch(401, { error: "unauthorized" });
    await expect(
      detectAiContent({ text: "x", apiKey: "bad-key", provider: "gptzero", fetchImpl })
    ).rejects.toThrow("GPTZero returned status 401");
  });

  it("throws on malformed GPTZero response (missing field)", async () => {
    const fetchImpl = makeJsonFetch(200, { documents: [{ class_probabilities: {} }] });
    await expect(
      detectAiContent({ text: "x", apiKey: "key", provider: "gptzero", fetchImpl })
    ).rejects.toThrow("GPTZero response malformed");
  });

  it("throws on completely empty GPTZero response", async () => {
    const fetchImpl = makeJsonFetch(200, {});
    await expect(
      detectAiContent({ text: "x", apiKey: "key", provider: "gptzero", fetchImpl })
    ).rejects.toThrow("GPTZero response malformed");
  });
});

describe("detectAiContent — Originality.ai", () => {
  it("parses Originality.ai response and returns ai_score_pct", async () => {
    const fetchImpl = makeJsonFetch(200, { score: { ai: 0.45, human: 0.55 } });
    const result = await detectAiContent({
      text: "Dit is een test.",
      apiKey: "test-key",
      provider: "originality",
      fetchImpl,
    });
    expect(result.provider).toBe("originality");
    expect(result.ai_score_pct).toBe(45);
    expect(result.human_score_pct).toBe(55);
  });

  it("throws on non-200 Originality.ai response", async () => {
    const fetchImpl = makeJsonFetch(403, { error: "forbidden" });
    await expect(
      detectAiContent({ text: "x", apiKey: "key", provider: "originality", fetchImpl })
    ).rejects.toThrow("Originality.ai returned status 403");
  });

  it("throws on malformed Originality.ai response", async () => {
    const fetchImpl = makeJsonFetch(200, { score: {} });
    await expect(
      detectAiContent({ text: "x", apiKey: "key", provider: "originality", fetchImpl })
    ).rejects.toThrow("Originality.ai response malformed");
  });
});
