import { describe, expect, it, vi } from "vitest";
import { createWordpressClient } from "@/wordpress/client";

describe("WordpressClient", () => {
  it("sends Basic auth header", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response));

    const c = createWordpressClient({
      baseUrl: "https://x.test",
      user: "u",
      appPassword: "p",
      fetchImpl,
    });

    await c.get("/wp-json/wp/v2/posts");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://x.test/wp-json/wp/v2/posts",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from("u:p").toString("base64")}`,
        }),
      })
    );
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    } as Response));

    const c = createWordpressClient({
      baseUrl: "https://x.test",
      user: "u",
      appPassword: "p",
      fetchImpl,
    });

    await expect(c.get("/wp-json/wp/v2/posts")).rejects.toThrow(/401/);
  });
});
