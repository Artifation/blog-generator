import { describe, expect, it, vi } from "vitest";
import { filterDeadResearchUrls } from "@/pipeline/researchUrlFilter";
import type { ResearchOutput } from "@/agents/researcher";

function makeResearch(): ResearchOutput {
  return {
    fan_out_subqueries: ["a", "b", "c"],
    key_entities: ["AVG", "AI Act", "MKB"],
    internal_link_targets: [],
    external_authority_sources: [
      { url: "https://alive.test/a", title: "Alive A", why_authoritative: "x" },
      { url: "https://dead.test/b", title: "Dead B", why_authoritative: "y" },
    ],
    key_facts: [
      { claim: "fact 1", source_url: "https://alive.test/a" },
      { claim: "fact 2", source_url: "https://dead.test/c" },
    ],
    competitor_serp_summary: "summary",
  };
}

function makeFetch(deadUrls: string[]): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const u = url.toString();
    const status = deadUrls.includes(u) ? 404 : 200;
    return new Response(null, { status }) as Response;
  }) as unknown as typeof fetch;
}

describe("filterDeadResearchUrls", () => {
  it("drops dead URLs from external_authority_sources and key_facts", async () => {
    const research = makeResearch();
    const fetchImpl = makeFetch(["https://dead.test/b", "https://dead.test/c"]);

    const r = await filterDeadResearchUrls(research, fetchImpl);

    expect(r.dropped).toBe(2);
    expect(r.filtered.external_authority_sources).toHaveLength(1);
    expect(r.filtered.external_authority_sources[0]!.url).toBe("https://alive.test/a");
    expect(r.filtered.key_facts).toHaveLength(1);
    expect(r.filtered.key_facts[0]!.source_url).toBe("https://alive.test/a");
  });

  it("preserves research when all URLs alive", async () => {
    const research = makeResearch();
    const fetchImpl = makeFetch([]);

    const r = await filterDeadResearchUrls(research, fetchImpl);

    expect(r.dropped).toBe(0);
    expect(r.filtered.external_authority_sources).toHaveLength(2);
    expect(r.filtered.key_facts).toHaveLength(2);
  });

  it("returns deadUrls array for logging", async () => {
    const research = makeResearch();
    const fetchImpl = makeFetch(["https://dead.test/b"]);

    const r = await filterDeadResearchUrls(research, fetchImpl);

    expect(r.deadUrls).toContain("https://dead.test/b");
  });
});
