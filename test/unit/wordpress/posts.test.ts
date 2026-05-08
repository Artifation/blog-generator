import { describe, expect, it, vi } from "vitest";
import { createDraftPost, getPost, updatePostContent } from "@/wordpress/posts";
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

describe("getPost", () => {
  it("fetches a post by id", async () => {
    const c = {
      get: vi.fn(async () => ({
        id: 42,
        link: "https://x.test/?p=42",
        content: { rendered: "<p>html</p>" },
        slug: "x",
        title: { rendered: "X" },
      })),
      postJson: vi.fn(),
      postBinary: vi.fn(),
      patchJson: vi.fn(),
    } as unknown as WordpressClient;
    const r = await getPost(c, 42);
    expect(c.get).toHaveBeenCalledWith("/wp-json/wp/v2/posts/42");
    expect(r.id).toBe(42);
  });
});

describe("updatePostContent", () => {
  it("PATCHes the post with new content", async () => {
    const c = {
      get: vi.fn(),
      postJson: vi.fn(),
      postBinary: vi.fn(),
      patchJson: vi.fn(async () => ({ id: 42, link: "https://x.test/?p=42" })),
    } as unknown as WordpressClient & { patchJson: ReturnType<typeof vi.fn> };
    await updatePostContent(c, 42, "<p>new html</p>");
    expect(c.patchJson).toHaveBeenCalledWith(
      "/wp-json/wp/v2/posts/42",
      expect.objectContaining({ content: "<p>new html</p>" })
    );
  });
});
