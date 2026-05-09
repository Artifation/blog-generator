import { describe, expect, it } from "vitest";
import { buildAnchorHistory, findOvertusedAnchors } from "@/pipeline/anchorTracker";
import type { AnchorHistoryEntry } from "@/pipeline/anchorTracker";

// ---------------------------------------------------------------------------
// Fake post HTML fixtures
// ---------------------------------------------------------------------------

const POST_A_HTML = `
<html><body>
  <article>
    <p>Lees meer over <a href="https://artifation.nl/ai-in-hr-mkb/">AI in HR</a> en hoe je dat toepast.</p>
    <p>Bekijk ook onze <a href="https://artifation.nl/ai-scan/">ai scan</a> pagina.</p>
    <p>En nog een keer <a href="https://artifation.nl/ai-in-hr-mkb/">ai in hr mkb</a> exact match.</p>
  </article>
</body></html>
`;

const POST_B_HTML = `
<html><body>
  <article>
    <p>De <a href="https://artifation.nl/ai-in-hr-mkb/">AI in HR MKB</a> aanpak werkt goed.</p>
    <p>Meer weten over <a href="https://artifation.nl/ai-scan/">onze scan tool</a>?</p>
  </article>
</body></html>
`;

const POST_C_HTML = `
<html><body>
  <article>
    <p>Geen interne links hier. Extern: <a href="https://rvo.nl">RVO</a>.</p>
  </article>
</body></html>
`;

const PUBLISHED_URLS = [
  "https://artifation.nl/ai-in-hr-mkb/",
  "https://artifation.nl/ai-scan/",
  "https://artifation.nl/derde-post/",
];

function makeFetch(responses: Record<string, string>): typeof fetch {
  return async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const body = responses[url];
    if (body === undefined) {
      return { ok: false, status: 404, text: async () => "" } as unknown as Response;
    }
    return { ok: true, status: 200, text: async () => body } as unknown as Response;
  };
}

// ---------------------------------------------------------------------------
// Tests for buildAnchorHistory
// ---------------------------------------------------------------------------

describe("buildAnchorHistory", () => {
  it("counts exact-match anchors per target URL from 3 mock posts", async () => {
    const fetchImpl = makeFetch({
      "https://artifation.nl/ai-in-hr-mkb/": POST_A_HTML,
      "https://artifation.nl/ai-scan/": POST_B_HTML,
      "https://artifation.nl/derde-post/": POST_C_HTML,
    });

    const history = await buildAnchorHistory({
      publishedPostUrls: PUBLISHED_URLS,
      fetchImpl,
    });

    expect(history).toHaveLength(3);

    // ai-in-hr-mkb: POST_B links to it once with anchor "ai in hr mkb" (exact match for slug)
    const hrEntry = history.find((e) => e.target_url === "https://artifation.nl/ai-in-hr-mkb/");
    expect(hrEntry).toBeDefined();
    // POST_B references "ai in hr mkb" which should be counted as exact_match
    const totalExact = Object.values(hrEntry!.exact_match_anchors).reduce((a, b) => a + b, 0);
    expect(totalExact).toBeGreaterThanOrEqual(1);
  });

  it("returns empty maps for a URL that nobody links to", async () => {
    const fetchImpl = makeFetch({
      "https://artifation.nl/ai-in-hr-mkb/": POST_A_HTML,
      "https://artifation.nl/ai-scan/": POST_B_HTML,
      "https://artifation.nl/derde-post/": POST_C_HTML,
    });

    const history = await buildAnchorHistory({
      publishedPostUrls: PUBLISHED_URLS,
      fetchImpl,
    });

    const derdeEntry = history.find((e) => e.target_url === "https://artifation.nl/derde-post/");
    expect(derdeEntry).toBeDefined();
    expect(Object.keys(derdeEntry!.exact_match_anchors)).toHaveLength(0);
    expect(Object.keys(derdeEntry!.partial_match_anchors)).toHaveLength(0);
  });

  it("gracefully skips URLs that return non-ok responses", async () => {
    const fetchImpl = makeFetch({
      // Only one URL responds successfully
      "https://artifation.nl/derde-post/": POST_C_HTML,
    });

    // Should not throw
    const history = await buildAnchorHistory({
      publishedPostUrls: PUBLISHED_URLS,
      fetchImpl,
    });

    expect(history).toHaveLength(3);
  });

  it("handles empty publishedPostUrls array", async () => {
    const fetchImpl = makeFetch({});
    const history = await buildAnchorHistory({ publishedPostUrls: [], fetchImpl });
    expect(history).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests for findOvertusedAnchors
// ---------------------------------------------------------------------------

describe("findOvertusedAnchors", () => {
  const fixture: AnchorHistoryEntry[] = [
    {
      target_url: "https://artifation.nl/ai-in-hr-mkb/",
      exact_match_anchors: {
        "ai in hr mkb": 4,  // above threshold
        "ai in hr": 2,       // below threshold
      },
      partial_match_anchors: { "meer over ai": 1 },
    },
    {
      target_url: "https://artifation.nl/ai-scan/",
      exact_match_anchors: {
        "ai scan": 3,  // at threshold → should be flagged
      },
      partial_match_anchors: {},
    },
    {
      target_url: "https://artifation.nl/derde-post/",
      exact_match_anchors: {
        "derde post": 1,  // well below threshold
      },
      partial_match_anchors: {},
    },
  ];

  it("returns anchors at or above the threshold", () => {
    const overtused = findOvertusedAnchors({ history: fixture, threshold: 3 });
    expect(overtused).toHaveLength(2);

    const hrEntry = overtused.find((e) => e.url === "https://artifation.nl/ai-in-hr-mkb/");
    expect(hrEntry).toBeDefined();
    expect(hrEntry!.anchor).toBe("ai in hr mkb");
    expect(hrEntry!.count).toBe(4);

    const scanEntry = overtused.find((e) => e.url === "https://artifation.nl/ai-scan/");
    expect(scanEntry).toBeDefined();
    expect(scanEntry!.anchor).toBe("ai scan");
    expect(scanEntry!.count).toBe(3);
  });

  it("returns empty array when nothing exceeds threshold", () => {
    const overtused = findOvertusedAnchors({ history: fixture, threshold: 10 });
    expect(overtused).toHaveLength(0);
  });

  it("handles empty history", () => {
    const overtused = findOvertusedAnchors({ history: [], threshold: 3 });
    expect(overtused).toHaveLength(0);
  });

  it("handles entries with no exact_match_anchors", () => {
    const empty: AnchorHistoryEntry[] = [
      {
        target_url: "https://artifation.nl/nieuw/",
        exact_match_anchors: {},
        partial_match_anchors: { "bekijk hier": 5 },
      },
    ];
    const overtused = findOvertusedAnchors({ history: empty, threshold: 3 });
    expect(overtused).toHaveLength(0);
  });
});
