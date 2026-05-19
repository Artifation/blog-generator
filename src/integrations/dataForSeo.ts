/**
 * DataForSEO Labs API — Keyword Ideas endpoint.
 * https://docs.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/
 *
 * Real monthly search volumes, keyword difficulty (0-100), CPC and competition
 * scores per keyword. The blog tool's free GSC stack tells us what *our* site
 * already shows up for; DataForSEO tells us what the market is searching for
 * regardless of our presence. Together they cover both "improve existing
 * ranking" and "explore new opportunities".
 *
 * Auth: HTTP Basic with login + password (NOT an API key).
 * Pricing (ballpark, may differ per account): ~$0.0075 per Keyword Ideas call.
 */

export interface DataForSeoCredentials {
  login: string;
  password: string;
}

export interface KeywordIdeasInput {
  keyword: string;
  /** Numeric location code (NL=2528, US=2840, etc.). See DataForSEO Locations API. */
  locationCode: number;
  /** ISO language code, e.g. "nl", "en", "de". */
  languageCode: string;
  /** Max ideas to return per call (default 100, max 1000). */
  limit: number;
  /** Filter out ideas with monthly search volume below this. */
  minVolume: number;
}

export interface KeywordIdea {
  keyword: string;
  searchVolume: number;
  cpc: number | null;
  /** 0..100 keyword difficulty score from DataForSEO Labs. */
  difficulty: number | null;
  /** 0..1 competition score (Google Ads concept). */
  competition: number | null;
}

export interface DataForSeoOpts {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Override the base URL for testing. */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.dataforseo.com";

interface RawTask {
  status_code: number;
  status_message?: string;
  result?: RawResult[] | null;
}

interface RawResult {
  items?: RawItem[] | null;
}

interface RawItem {
  keyword?: string;
  keyword_info?: {
    search_volume?: number | null;
    cpc?: number | null;
    competition?: number | null;
  };
  keyword_properties?: {
    keyword_difficulty?: number | null;
  };
}

interface RawResponse {
  status_code: number;
  status_message?: string;
  tasks?: RawTask[] | null;
}

function authHeader(creds: DataForSeoCredentials): string {
  const token = Buffer.from(`${creds.login}:${creds.password}`).toString("base64");
  return `Basic ${token}`;
}

export async function fetchKeywordIdeas(
  input: KeywordIdeasInput,
  creds: DataForSeoCredentials,
  opts: DataForSeoOpts = {}
): Promise<KeywordIdea[]> {
  const f = opts.fetchImpl ?? globalThis.fetch;
  const base = opts.baseUrl ?? DEFAULT_BASE_URL;

  const body = [
    {
      keywords: [input.keyword],
      location_code: input.locationCode,
      language_code: input.languageCode,
      limit: input.limit,
      include_serp_info: false,
    },
  ];

  const res = await f(`${base}/v3/dataforseo_labs/google/keyword_ideas/live`, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`DataForSEO HTTP ${res.status}`);
  }

  const data = (await res.json()) as RawResponse;
  const task = data.tasks?.[0];
  if (!task) return [];

  // DataForSEO uses status_code 20000 for success at both the wrapper and task
  // level. Wrapper-level errors throw above (non-2xx); task-level errors are
  // returned as 4xxxx codes with a status_message.
  if (task.status_code !== 20000) {
    throw new Error(`DataForSEO task error ${task.status_code}: ${task.status_message ?? "unknown"}`);
  }

  const items = task.result?.[0]?.items ?? [];

  return items
    .filter((it): it is RawItem & { keyword: string } => typeof it.keyword === "string" && it.keyword.length > 0)
    .map((it) => ({
      keyword: it.keyword,
      searchVolume: it.keyword_info?.search_volume ?? 0,
      cpc: it.keyword_info?.cpc ?? null,
      difficulty: it.keyword_properties?.keyword_difficulty ?? null,
      competition: it.keyword_info?.competition ?? null,
    }))
    .filter((it) => it.searchVolume >= input.minVolume)
    .sort((a, b) => b.searchVolume - a.searchVolume);
}
