import { describe, expect, it, vi } from "vitest";
import { uploadMedia } from "@/wordpress/media";
import type { WordpressClient } from "@/wordpress/client";

describe("uploadMedia", () => {
  it("posts binary and returns media id + url", async () => {
    const c = {
      get: vi.fn(),
      postJson: vi.fn(),
      postBinary: vi.fn(async () => ({ id: 42, source_url: "https://x.test/i.png" })),
    } as unknown as WordpressClient & { postBinary: ReturnType<typeof vi.fn> };
    const r = await uploadMedia(c, {
      bytes: Buffer.from("x"),
      contentType: "image/png",
      filename: "header.png",
      altText: "Alt",
    });
    expect(r.id).toBe(42);
    expect(c.postBinary).toHaveBeenCalledWith(
      "/wp-json/wp/v2/media",
      expect.any(Buffer),
      "image/png",
      "header.png"
    );
  });
});
