/**
 * DataForSEO SERP integratie — top-10 organic-resultaten voor een keyword,
 * gebruikt door de Strategist om outline te baseren op wat feitelijk rankt
 * (titel-patronen, missing topics, snippet-style, ranking-domains).
 *
 * Endpoint: POST /v3/serp/google/organic/live/regular
 * Auth: HTTP Basic met email:password.
 * Cost: ~$0.0006 per call (regular tier).
 */

export interface DataForSeoCreds {
  login: string;
  password: string;
}

export interface SerpFetchInput {
  keyword: string;
  locationCode?: number; // default 2528 = Netherlands
  languageCode?: string; // default "nl"
  device?: "desktop" | "mobile"; // default "desktop"
  fetchImpl?: typeof fetch;
}

export interface SerpResult {
  rank: number;
  url: string;
  domain: string;
  title: string;
  description: string;
}

export interface SerpResponse {
  keyword: string;
  results: SerpResult[];
  serp_total_count?: number;
}

const ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/regular";

export async function fetchSerpResults(
  creds: DataForSeoCreds,
  input: SerpFetchInput
): Promise<SerpResponse> {
  const fetchFn = input.fetchImpl ?? fetch;
  const auth = `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString("base64")}`;

  const body = [
    {
      keyword: input.keyword,
      location_code: input.locationCode ?? 2528, // Netherlands
      language_code: input.languageCode ?? "nl",
      device: input.device ?? "desktop",
      // Request 30 SERP items: the response mixes item types (featured snippet,
      // "people also ask", ads, organic, …); asking for only 10 total then
      // filtering to `organic` + slice(0,10) frequently left far fewer than 10.
      depth: 30,
    },
  ];

  const res = await fetchFn(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`DataForSEO SERP failed: ${res.status} ${txt.slice(0, 300)}`);
  }

  const payload = (await res.json()) as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      result?: Array<{
        items?: Array<{
          type?: string;
          rank_absolute?: number;
          url?: string;
          domain?: string;
          title?: string;
          description?: string;
        }>;
        se_results_count?: number;
      }>;
    }>;
  };

  const task = payload.tasks?.[0];
  if (!task) throw new Error("DataForSEO returned no tasks");
  if (task.status_code !== undefined && task.status_code >= 40000) {
    throw new Error(`DataForSEO task error: ${task.status_code} ${task.status_message ?? ""}`);
  }

  const taskResult = task.result?.[0];
  const items = taskResult?.items ?? [];

  const results: SerpResult[] = items
    .filter((it) => it.type === "organic" && it.url && it.title)
    .slice(0, 10)
    .map((it) => ({
      rank: it.rank_absolute ?? 0,
      url: it.url!,
      domain: it.domain ?? new URL(it.url!).host,
      title: it.title!,
      description: it.description ?? "",
    }));

  return {
    keyword: input.keyword,
    results,
    serp_total_count: taskResult?.se_results_count,
  };
}
