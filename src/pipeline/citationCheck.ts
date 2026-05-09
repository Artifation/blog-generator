export interface CitationCheckInput {
  urls: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface CitationCheckResult {
  total: number;
  alive: number;
  dead: { url: string; reason: string }[];
  deadRatio: number; // 0-1
}

export async function checkCitations(input: CitationCheckInput): Promise<CitationCheckResult> {
  const fetchFn = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 5000;
  const urls = [...new Set(input.urls)]; // deduplicate

  const dead: { url: string; reason: string }[] = [];

  await Promise.all(
    urls.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchFn(url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
        });
        if (res.status >= 400) {
          dead.push({ url, reason: `status:${res.status}` });
        }
        // 200-399 = alive
      } catch (err: unknown) {
        if (
          (err instanceof Error && err.name === "AbortError") ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          dead.push({ url, reason: "timeout" });
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          dead.push({ url, reason: `network:${msg}` });
        }
      } finally {
        clearTimeout(timer);
      }
    })
  );

  const total = urls.length;
  const alive = total - dead.length;
  const deadRatio = total > 0 ? dead.length / total : 0;

  return { total, alive, dead, deadRatio };
}

export function enrichSignalsWithCitationCheck<T extends object>(
  signals: T,
  citationResult: CitationCheckResult
): T & { dead_external_link_count: number; external_link_check_total: number } {
  return {
    ...signals,
    dead_external_link_count: citationResult.dead.length,
    external_link_check_total: citationResult.total,
  };
}
