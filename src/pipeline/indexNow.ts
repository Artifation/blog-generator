/**
 * IndexNow ping — notifies search engines about newly published URLs.
 *
 * As of 2026, Google does NOT adopt IndexNow and has no plans to do so.
 * This endpoint pings: Bing, Yandex, Naver, Seznam, Yep.
 * Source: https://www.indexnow.org/faq
 *
 * Setup: host a 32-char hex key at https://<host>/<key>.txt before enabling.
 */

export interface IndexNowInput {
  host: string;       // e.g. "artifation.nl"
  key: string;        // 32-char hex, hosted at https://<host>/<key>.txt
  urlList: string[];  // canonical URLs to notify
  fetchImpl?: typeof fetch;
}

export async function pingIndexNow(
  input: IndexNowInput
): Promise<{ ok: boolean; status: number; skipped?: boolean }> {
  // An empty key would fire an invalid request — skip with a clear signal so
  // the caller can warn instead of silently "succeeding".
  if (!input.key) {
    return { ok: false, status: 0, skipped: true };
  }
  const f = input.fetchImpl ?? fetch;
  const keyLocation = `https://${input.host}/${input.key}.txt`;

  const response = await f("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: input.host,
      key: input.key,
      keyLocation,
      urlList: input.urlList,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  return { ok: response.ok, status: response.status };
}
