import { describe, expect, it, vi } from "vitest";
import { checkCitations, enrichSignalsWithCitationCheck } from "@/pipeline/citationCheck";

function makeFetch(responses: Record<string, { status: number } | "timeout" | "network">): typeof fetch {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const key = url.toString();
    const response = responses[key];
    if (response === "timeout") {
      // simulate abort
      const signal = (init as RequestInit | undefined)?.signal;
      if (signal) {
        await new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
        );
      }
      throw new DOMException("Aborted", "AbortError");
    }
    if (response === "network") {
      throw new Error("ECONNREFUSED");
    }
    return new Response(null, { status: (response as { status: number }).status }) as Response;
  }) as unknown as typeof fetch;
}

describe("checkCitations", () => {
  it("marks 200 as alive", async () => {
    const fetchImpl = makeFetch({ "https://example.com/a": { status: 200 } });
    const result = await checkCitations({ urls: ["https://example.com/a"], fetchImpl });
    expect(result.total).toBe(1);
    expect(result.alive).toBe(1);
    expect(result.dead).toHaveLength(0);
    expect(result.deadRatio).toBe(0);
  });

  it("marks 301 redirect as alive", async () => {
    const fetchImpl = makeFetch({ "https://example.com/redirect": { status: 301 } });
    const result = await checkCitations({ urls: ["https://example.com/redirect"], fetchImpl });
    expect(result.alive).toBe(1);
    expect(result.dead).toHaveLength(0);
  });

  it("marks 404 as dead with reason status:404", async () => {
    const fetchImpl = makeFetch({ "https://example.com/missing": { status: 404 } });
    const result = await checkCitations({ urls: ["https://example.com/missing"], fetchImpl });
    expect(result.dead).toHaveLength(1);
    expect(result.dead[0]!.reason).toBe("status:404");
    expect(result.dead[0]!.url).toBe("https://example.com/missing");
    expect(result.deadRatio).toBe(1);
  });

  it("marks timeout as dead with reason timeout", async () => {
    const fetchImpl = makeFetch({ "https://example.com/slow": "timeout" });
    const result = await checkCitations({
      urls: ["https://example.com/slow"],
      fetchImpl,
      timeoutMs: 1,
    });
    expect(result.dead).toHaveLength(1);
    expect(result.dead[0]!.reason).toBe("timeout");
  });

  it("marks network error as dead with reason network:<msg>", async () => {
    const fetchImpl = makeFetch({ "https://example.com/down": "network" });
    const result = await checkCitations({ urls: ["https://example.com/down"], fetchImpl });
    expect(result.dead).toHaveLength(1);
    expect(result.dead[0]!.reason).toMatch(/^network:/);
  });

  it("handles mixed alive and dead URLs", async () => {
    const fetchImpl = makeFetch({
      "https://example.com/ok": { status: 200 },
      "https://example.com/gone": { status: 410 },
      "https://example.com/another": { status: 200 },
    });
    const result = await checkCitations({
      urls: [
        "https://example.com/ok",
        "https://example.com/gone",
        "https://example.com/another",
      ],
      fetchImpl,
    });
    expect(result.total).toBe(3);
    expect(result.alive).toBe(2);
    expect(result.dead).toHaveLength(1);
    expect(result.deadRatio).toBeCloseTo(1 / 3);
  });

  it("marks soft-404 with status 200 + 404-title as dead with reason status:soft404", async () => {
    const html =
      "<!doctype html><html><head><title>404 Pagina niet gevonden | Wolters Kluwer</title></head><body>...</body></html>";
    const fetchImpl: typeof fetch = vi.fn(async () => {
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }) as Response;
    }) as unknown as typeof fetch;

    const result = await checkCitations({
      urls: ["https://wolterskluwer.com/missing"],
      fetchImpl,
    });
    expect(result.dead).toHaveLength(1);
    expect(result.dead[0]!.reason).toBe("status:soft404");
  });

  it("marks soft-404 via final URL containing /404/ as dead", async () => {
    // Server returns 200 but final response.url indicates a 404-page redirect.
    const fetchImpl: typeof fetch = vi.fn(async () => {
      const res = new Response("<html><title>Niet beschikbaar</title></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }) as Response & { url: string };
      // simulate redirect: Response.url reports the final URL
      Object.defineProperty(res, "url", { value: "https://example.com/404/" });
      return res;
    }) as unknown as typeof fetch;

    const result = await checkCitations({
      urls: ["https://example.com/some-old-page"],
      fetchImpl,
    });
    expect(result.dead).toHaveLength(1);
    expect(result.dead[0]!.reason).toBe("status:soft404");
  });

  it("does NOT mark a valid 200 page as soft-404", async () => {
    const html =
      "<!doctype html><html><head><title>De complete gids voor AI in MKB</title></head><body>article body</body></html>";
    const fetchImpl: typeof fetch = vi.fn(async () => {
      return new Response(html, { status: 200 }) as Response;
    }) as unknown as typeof fetch;
    const result = await checkCitations({
      urls: ["https://example.com/legit"],
      fetchImpl,
    });
    expect(result.alive).toBe(1);
    expect(result.dead).toHaveLength(0);
  });

  it("does NOT false-positive when 404 appears in URL path but not in title", async () => {
    // Some sites have legit content with "404" in the URL/title (anti-pattern but exists).
    // We only mark soft-404 when the TITLE specifically signals not-found, not the path.
    const html =
      "<!doctype html><html><head><title>Top 404 tools voor MKB</title></head><body>article</body></html>";
    const fetchImpl: typeof fetch = vi.fn(async () => {
      return new Response(html, { status: 200 }) as Response;
    }) as unknown as typeof fetch;
    const result = await checkCitations({
      urls: ["https://example.com/legit-404-article"],
      fetchImpl,
    });
    // "404" in title alone is not enough — we need a phrase indicating not-found.
    // This particular title doesn't contain "niet gevonden" / "not found" / "404 error"
    // / "page not found", so it should stay alive.
    expect(result.alive).toBe(1);
  });

  it("deduplicates URLs", async () => {
    const fetchImpl = makeFetch({ "https://example.com/a": { status: 200 } });
    const result = await checkCitations({
      urls: ["https://example.com/a", "https://example.com/a"],
      fetchImpl,
    });
    expect(result.total).toBe(1);
  });

  it("returns zero totals for empty URL list", async () => {
    const fetchImpl = makeFetch({});
    const result = await checkCitations({ urls: [], fetchImpl });
    expect(result.total).toBe(0);
    expect(result.alive).toBe(0);
    expect(result.deadRatio).toBe(0);
  });
});

describe("enrichSignalsWithCitationCheck", () => {
  it("sets dead_external_link_count and external_link_check_total on signals", () => {
    const signals = { word_count: 500 };
    const citationResult = { total: 5, alive: 3, dead: [{ url: "x", reason: "status:404" }, { url: "y", reason: "timeout" }], deadRatio: 0.4 };
    const enriched = enrichSignalsWithCitationCheck(signals, citationResult);
    expect(enriched.dead_external_link_count).toBe(2);
    expect(enriched.external_link_check_total).toBe(5);
    expect(enriched.word_count).toBe(500);
  });
});
