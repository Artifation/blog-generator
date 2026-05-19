import { describe, expect, it, vi } from "vitest";
import { fetchSerpResults } from "@/integrations/dataForSeoSerp";

function makeFetch(payload: unknown, ok: boolean = true, status: number = 200): typeof fetch {
  return vi.fn(async () =>
    ({
      ok,
      status,
      text: async () => (typeof payload === "string" ? payload : JSON.stringify(payload)),
      json: async () => payload,
    }) as Response
  ) as unknown as typeof fetch;
}

const SUCCESS_PAYLOAD = {
  tasks: [
    {
      status_code: 20000,
      status_message: "Ok",
      result: [
        {
          se_results_count: 1230000,
          items: [
            {
              type: "organic",
              rank_absolute: 1,
              url: "https://example.nl/ai-act",
              domain: "example.nl",
              title: "AI Act voor MKB",
              description: "Wat het inhoudt.",
            },
            {
              type: "featured_snippet",
              rank_absolute: 2,
              url: "https://snippet.nl/x",
              title: "Snippet",
            },
            {
              type: "organic",
              rank_absolute: 3,
              url: "https://another.nl/ai-act-mkb",
              domain: "another.nl",
              title: "AI Act voor het MKB",
              description: "Stappenplan",
            },
          ],
        },
      ],
    },
  ],
};

describe("fetchSerpResults", () => {
  it("returns top organic results sorted by rank", async () => {
    const fetchImpl = makeFetch(SUCCESS_PAYLOAD);
    const r = await fetchSerpResults(
      { login: "x", password: "y" },
      { keyword: "AI Act MKB", fetchImpl }
    );
    expect(r.keyword).toBe("AI Act MKB");
    expect(r.results).toHaveLength(2); // featured_snippet filtered out
    expect(r.results[0]!.rank).toBe(1);
    expect(r.results[0]!.domain).toBe("example.nl");
    expect(r.results[1]!.rank).toBe(3);
  });

  it("sends Basic auth + NL defaults to endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(SUCCESS_PAYLOAD),
        json: async () => SUCCESS_PAYLOAD,
      }) as Response
    ) as unknown as typeof fetch;

    await fetchSerpResults({ login: "u", password: "p" }, { keyword: "x", fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe("https://api.dataforseo.com/v3/serp/google/organic/live/regular");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    const body = JSON.parse(init.body as string) as Array<{
      keyword: string;
      location_code: number;
      language_code: string;
      device: string;
    }>;
    expect(body[0]!.keyword).toBe("x");
    expect(body[0]!.location_code).toBe(2528); // NL
    expect(body[0]!.language_code).toBe("nl");
    expect(body[0]!.device).toBe("desktop");
  });

  it("throws on HTTP error with status detail", async () => {
    const fetchImpl = makeFetch("Unauthorized", false, 401);
    await expect(
      fetchSerpResults({ login: "x", password: "y" }, { keyword: "k", fetchImpl })
    ).rejects.toThrow(/DataForSEO SERP failed: 401/);
  });

  it("throws on task-level error (40000+)", async () => {
    const errPayload = {
      tasks: [{ status_code: 40400, status_message: "Not Found", result: [] }],
    };
    const fetchImpl = makeFetch(errPayload);
    await expect(
      fetchSerpResults({ login: "x", password: "y" }, { keyword: "k", fetchImpl })
    ).rejects.toThrow(/40400/);
  });

  it("handles empty results gracefully", async () => {
    const empty = {
      tasks: [{ status_code: 20000, result: [{ items: [] }] }],
    };
    const fetchImpl = makeFetch(empty);
    const r = await fetchSerpResults({ login: "x", password: "y" }, { keyword: "k", fetchImpl });
    expect(r.results).toHaveLength(0);
  });
});
