import { describe, expect, it, vi } from "vitest";

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(async () => ({
      data: { images: [{ url: "https://fal.test/img.png" }] },
    })),
  },
}));

import { generateImageWithFal } from "@/image/fal";

describe("generateImageWithFal", () => {
  it("returns image url + dimensions", async () => {
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
});
