import { describe, expect, it, vi } from "vitest";
import { readPage, readPages } from "@/integrations/jinaReader";

// ---------------------------------------------------------------------------
// Fixture: typical Jina Reader response body
// ---------------------------------------------------------------------------
// Jina returns a plain-text envelope:
//   Title: <page title>
//   URL Source: <resolved url>
//   Markdown Content:
//   <markdown body>
// We test that we parse all three pieces.

const JINA_BODY = `Title: ChatGPT voor MKB — Praktische gids

URL Source: https://example.nl/chatgpt-mkb/

Markdown Content:
# ChatGPT voor MKB

Een korte intro.

## Belangrijke punten

- Punt 1 met [interne link](/over-ons)
- Punt 2 met [externe link](https://anders.nl/article)

Meer tekst hier.
`;

const JINA_BODY_NO_LINKS = `Title: Plain page

URL Source: https://plain.nl/

Markdown Content:
Geen links hier, alleen tekst.
`;

function makeFetch(map: Record<string, { ok: boolean; status?: number; text: string }>): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const key = url.toString();
    const entry = map[key];
    if (!entry) return { ok: false, status: 404, text: async () => "" } as unknown as Response;
    return {
      ok: entry.ok,
      status: entry.status ?? (entry.ok ? 200 : 500),
      text: async () => entry.text,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("readPage", () => {
  it("parses title, markdown and links from a Jina Reader response", async () => {
    const fetchImpl = makeFetch({
      "https://r.jina.ai/https://example.nl/chatgpt-mkb/": { ok: true, text: JINA_BODY },
    });

    const result = await readPage({ url: "https://example.nl/chatgpt-mkb/", fetchImpl });

    expect(result.title).toBe("ChatGPT voor MKB — Praktische gids");
    expect(result.markdown).toContain("# ChatGPT voor MKB");
    expect(result.markdown).toContain("- Punt 1");
    expect(result.url).toBe("https://example.nl/chatgpt-mkb/");
    expect(result.links).toEqual(
      expect.arrayContaining([
        "https://example.nl/over-ons",
        "https://anders.nl/article",
      ])
    );
  });

  it("returns empty links array when page contains no links", async () => {
    const fetchImpl = makeFetch({
      "https://r.jina.ai/https://plain.nl/": { ok: true, text: JINA_BODY_NO_LINKS },
    });

    const result = await readPage({ url: "https://plain.nl/", fetchImpl });

    expect(result.title).toBe("Plain page");
    expect(result.links).toEqual([]);
  });

  it("forwards API key as Authorization header when provided", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JINA_BODY,
    })) as unknown as typeof fetch;

    await readPage({
      url: "https://example.nl/x/",
      apiKey: "jina_secret_123",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://r.jina.ai/https://example.nl/x/",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer jina_secret_123",
        }),
      })
    );
  });

  it("throws on non-2xx response", async () => {
    const fetchImpl = makeFetch({
      "https://r.jina.ai/https://broken.nl/": { ok: false, status: 502, text: "Bad gateway" },
    });

    await expect(
      readPage({ url: "https://broken.nl/", fetchImpl })
    ).rejects.toThrow(/502/);
  });

  it("handles a body without the standard envelope (graceful fallback)", async () => {
    const fetchImpl = makeFetch({
      "https://r.jina.ai/https://raw.nl/": {
        ok: true,
        text: "just some plain content without headers",
      },
    });

    const result = await readPage({ url: "https://raw.nl/", fetchImpl });
    expect(result.title).toBe("");
    expect(result.markdown).toBe("just some plain content without headers");
    expect(result.url).toBe("https://raw.nl/");
  });

  it("respects abort signal", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new Error("aborted");
      return { ok: true, status: 200, text: async () => JINA_BODY } as unknown as Response;
    }) as unknown as typeof fetch;

    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      readPage({ url: "https://x.nl/", fetchImpl, signal: ctrl.signal })
    ).rejects.toThrow();
  });
});

describe("readPages", () => {
  it("fetches multiple URLs and returns results in input order, skipping failures", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes("ok-1.nl")) return { ok: true, status: 200, text: async () => JINA_BODY } as unknown as Response;
      if (u.includes("ok-2.nl")) return { ok: true, status: 200, text: async () => JINA_BODY_NO_LINKS } as unknown as Response;
      if (u.includes("fail.nl")) throw new Error("ECONNRESET");
      return { ok: false, status: 404, text: async () => "" } as unknown as Response;
    }) as unknown as typeof fetch;

    const results = await readPages({
      urls: ["https://ok-1.nl/", "https://fail.nl/", "https://ok-2.nl/"],
      fetchImpl,
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.url).toBe("https://ok-1.nl/");
    expect(results[1]!.url).toBe("https://ok-2.nl/");
  });

  it("respects concurrency limit (sequential default)", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const fetchImpl = vi.fn(async () => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return { ok: true, status: 200, text: async () => JINA_BODY } as unknown as Response;
    }) as unknown as typeof fetch;

    await readPages({
      urls: ["https://a.nl/", "https://b.nl/", "https://c.nl/", "https://d.nl/"],
      concurrency: 2,
      fetchImpl,
    });

    expect(maxInflight).toBeLessThanOrEqual(2);
  });
});
