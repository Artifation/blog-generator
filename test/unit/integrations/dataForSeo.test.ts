import { describe, expect, it, vi } from "vitest";
import { fetchKeywordIdeas, type DataForSeoCredentials } from "@/integrations/dataForSeo";

const CREDS: DataForSeoCredentials = { login: "user", password: "pass" };

const KEYWORD_IDEAS_OK = {
  status_code: 20000,
  status_message: "Ok.",
  tasks: [
    {
      status_code: 20000,
      status_message: "Ok.",
      result: [
        {
          items: [
            {
              keyword: "ai voor mkb",
              keyword_info: { search_volume: 880, cpc: 2.4, competition: 0.45 },
              keyword_properties: { keyword_difficulty: 32 },
            },
            {
              keyword: "ai tools voor mkb",
              keyword_info: { search_volume: 480, cpc: 3.1, competition: 0.55 },
              keyword_properties: { keyword_difficulty: 41 },
            },
            {
              keyword: "ai implementatie mkb",
              keyword_info: { search_volume: 110, cpc: 4.2, competition: 0.62 },
              keyword_properties: { keyword_difficulty: 58 },
            },
            {
              keyword: "low volume noise",
              keyword_info: { search_volume: 10, cpc: 0.5, competition: 0.2 },
              keyword_properties: { keyword_difficulty: 15 },
            },
          ],
        },
      ],
    },
  ],
};

const KEYWORD_IDEAS_NO_ITEMS = {
  status_code: 20000,
  status_message: "Ok.",
  tasks: [{ status_code: 20000, result: [{ items: [] }] }],
};

const KEYWORD_IDEAS_TASK_ERROR = {
  status_code: 20000,
  status_message: "Ok.",
  tasks: [
    {
      status_code: 40400,
      status_message: "Invalid keyword.",
    },
  ],
};

function makeFetch(body: unknown, opts?: { ok?: boolean; status?: number }) {
  return vi.fn(async () => ({
    ok: opts?.ok ?? true,
    status: opts?.status ?? 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("fetchKeywordIdeas", () => {
  it("returns parsed keyword ideas with volume + difficulty + cpc, filtered by minVolume", async () => {
    const fetchImpl = makeFetch(KEYWORD_IDEAS_OK);
    const ideas = await fetchKeywordIdeas(
      { keyword: "ai", locationCode: 2528, languageCode: "nl", limit: 100, minVolume: 50 },
      CREDS,
      { fetchImpl }
    );

    expect(ideas).toHaveLength(3); // low-volume noise filtered out
    expect(ideas[0]).toMatchObject({
      keyword: "ai voor mkb",
      searchVolume: 880,
      cpc: 2.4,
      difficulty: 32,
      competition: 0.45,
    });
  });

  it("sorts by search volume descending so the highest-opportunity items come first", async () => {
    const fetchImpl = makeFetch(KEYWORD_IDEAS_OK);
    const ideas = await fetchKeywordIdeas(
      { keyword: "ai", locationCode: 2528, languageCode: "nl", limit: 100, minVolume: 0 },
      CREDS,
      { fetchImpl }
    );

    const volumes = ideas.map((i) => i.searchVolume);
    expect(volumes).toEqual([...volumes].sort((a, b) => b - a));
  });

  it("sends basic auth header built from login + password", async () => {
    const fetchImpl = makeFetch(KEYWORD_IDEAS_OK);
    await fetchKeywordIdeas(
      { keyword: "ai", locationCode: 2528, languageCode: "nl", limit: 50, minVolume: 0 },
      CREDS,
      { fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const auth = (init as { headers: Record<string, string> }).headers.Authorization;
    expect(auth).toMatch(/^Basic /);
    const decoded = Buffer.from(auth!.replace("Basic ", ""), "base64").toString("utf-8");
    expect(decoded).toBe("user:pass");
  });

  it("returns empty list when the response has no items", async () => {
    const fetchImpl = makeFetch(KEYWORD_IDEAS_NO_ITEMS);
    const ideas = await fetchKeywordIdeas(
      { keyword: "ai", locationCode: 2528, languageCode: "nl", limit: 50, minVolume: 0 },
      CREDS,
      { fetchImpl }
    );
    expect(ideas).toEqual([]);
  });

  it("throws when the task itself returned an error status", async () => {
    const fetchImpl = makeFetch(KEYWORD_IDEAS_TASK_ERROR);
    await expect(
      fetchKeywordIdeas(
        { keyword: "ai", locationCode: 2528, languageCode: "nl", limit: 50, minVolume: 0 },
        CREDS,
        { fetchImpl }
      )
    ).rejects.toThrow(/40400|Invalid keyword/);
  });

  it("throws on non-2xx HTTP response", async () => {
    const fetchImpl = makeFetch({ error: "auth failed" }, { ok: false, status: 401 });
    await expect(
      fetchKeywordIdeas(
        { keyword: "ai", locationCode: 2528, languageCode: "nl", limit: 50, minVolume: 0 },
        CREDS,
        { fetchImpl }
      )
    ).rejects.toThrow(/401/);
  });

  it("respects abort signal", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new Error("aborted");
      return { ok: true, status: 200, json: async () => KEYWORD_IDEAS_OK } as unknown as Response;
    }) as unknown as typeof fetch;

    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      fetchKeywordIdeas(
        { keyword: "ai", locationCode: 2528, languageCode: "nl", limit: 50, minVolume: 0 },
        CREDS,
        { fetchImpl, signal: ctrl.signal }
      )
    ).rejects.toThrow();
  });
});
