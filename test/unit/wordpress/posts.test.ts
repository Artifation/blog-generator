import { describe, expect, it, vi } from "vitest";
import { createDraftPost } from "@/wordpress/posts";
import type { WordpressClient } from "@/wordpress/client";

describe("createDraftPost", () => {
  it("posts JSON with status=draft", async () => {
    const c = {
      get: vi.fn(),
      postJson: vi.fn(async () => ({ id: 99, link: "https://x.test/?p=99" })),
      postBinary: vi.fn(),
    } as unknown as WordpressClient & { postJson: ReturnType<typeof vi.fn> };
    const r = await createDraftPost(c, {
      title: "T",
      content: "C",
      slug: "s",
      excerpt: "e",
      featuredMediaId: 42,
      categories: [],
      tags: [],
    });
    expect(r.id).toBe(99);
    expect(c.postJson).toHaveBeenCalledWith(
      "/wp-json/wp/v2/posts",
      expect.objectContaining({ status: "draft", featured_media: 42 })
    );
  });
});
