import { describe, expect, it, vi } from "vitest";

const { subscribeMock } = vi.hoisted(() => ({
  subscribeMock: vi.fn(async () => ({
    data: { images: [{ url: "https://fal.test/img.png" }] },
  })),
}));

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: vi.fn(),
    subscribe: subscribeMock,
  },
}));

import { generateImageWithFal, composeBrandedPrompt, BRAND_STYLE_PREFIX, BRAND_NEGATIVE_TERMS } from "@/image/fal";

describe("composeBrandedPrompt", () => {
  it("prepends brand-style prefix and appends negatives", () => {
    const out = composeBrandedPrompt("a robot on a desk", "no humans");
    expect(out.startsWith(BRAND_STYLE_PREFIX)).toBe(true);
    expect(out).toContain("a robot on a desk");
    expect(out).toContain("no humans");
    expect(out).toContain(BRAND_NEGATIVE_TERMS);
  });

  it("handles empty extra-negatives gracefully", () => {
    const out = composeBrandedPrompt("scene", "");
    expect(out).toContain(BRAND_NEGATIVE_TERMS);
    expect(out).not.toMatch(/,\s*,/);
  });
});

describe("generateImageWithFal", () => {
  it("returns image url + bytes", async () => {
    subscribeMock.mockClear();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      headers: new Headers({ "content-type": "image/png" }),
    } as Response));

    const r = await generateImageWithFal({
      prompt: "x",
      negative_prompt: "y",
      apiKey: "test",
      fetchImpl,
    });
    expect(r.url).toBe("https://fal.test/img.png");
    expect(r.bytes).toBeInstanceOf(Buffer);
  });

  it("submits branded prompt + 16:9 aspect ratio to fal.subscribe", async () => {
    subscribeMock.mockClear();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      headers: new Headers({ "content-type": "image/png" }),
    } as Response));

    await generateImageWithFal({
      prompt: "industrial workshop",
      negative_prompt: "neon",
      apiKey: "test",
      fetchImpl,
    });

    expect(subscribeMock).toHaveBeenCalledOnce();
    const callArgs = subscribeMock.mock.calls[0] as unknown as [
      string,
      { input: { prompt: string; aspect_ratio: string } }
    ];
    const callArg = callArgs[1];
    expect(callArg.input.aspect_ratio).toBe("16:9");
    expect(callArg.input.prompt).toContain(BRAND_STYLE_PREFIX);
    expect(callArg.input.prompt).toContain("industrial workshop");
    expect(callArg.input.prompt).toContain("neon");
  });
});
