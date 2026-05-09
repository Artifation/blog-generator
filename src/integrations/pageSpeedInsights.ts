/**
 * PageSpeed Insights v5 API client.
 *
 * Endpoint: https://www.googleapis.com/pagespeedonline/v5/runPagespeed
 * Docs: https://developers.google.com/speed/docs/insights/v5/reference/pagespeedapi/runpagespeed
 *
 * Works without an API key but is rate-limited. Pass apiKey (PSI_API_KEY)
 * for higher quota (25 000 requests/day free tier).
 */

export interface PsiInput {
  url: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  strategy?: "mobile" | "desktop"; // default: mobile (Google's primary signal)
}

export interface PsiResult {
  url: string;
  lcp_ms: number;           // Largest Contentful Paint, milliseconds
  inp_ms: number;           // Interaction to Next Paint, milliseconds
  cls: number;              // Cumulative Layout Shift (unitless)
  performance_score: number; // 0-100
  fetched_at: string;       // ISO timestamp
}

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export async function fetchPsi(input: PsiInput): Promise<PsiResult> {
  const f = input.fetchImpl ?? globalThis.fetch;
  const strategy = input.strategy ?? "mobile";

  const params = new URLSearchParams({
    url: input.url,
    strategy,
    ...(input.apiKey ? { key: input.apiKey } : {}),
  });

  const res = await f(`${PSI_ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PSI API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as PsiApiResponse;

  const audits = json.lighthouseResult?.audits ?? {};

  const lcp_ms = audits["largest-contentful-paint"]?.numericValue ?? 0;
  const inp_ms = audits["interaction-to-next-paint"]?.numericValue ?? 0;
  const cls = audits["cumulative-layout-shift"]?.numericValue ?? 0;

  const performance_score = Math.round(
    (json.lighthouseResult?.categories?.performance?.score ?? 0) * 100
  );

  return {
    url: input.url,
    lcp_ms,
    inp_ms,
    cls,
    performance_score,
    fetched_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CWV classification thresholds (Google's official ranges)
// ---------------------------------------------------------------------------

export type CwvStatus = "good" | "needs_improvement" | "poor";

export interface CwvClassification {
  lcp: CwvStatus;
  inp: CwvStatus;
  cls: CwvStatus;
  overall: CwvStatus;
}

export function classifyCwv(result: PsiResult): CwvClassification {
  const lcp = classifyLcp(result.lcp_ms);
  const inp = classifyInp(result.inp_ms);
  const cls = classifyCls(result.cls);

  // Overall is "poor" if any metric is poor, else "needs_improvement" if any NI, else "good"
  const statuses = [lcp, inp, cls];
  let overall: CwvStatus = "good";
  if (statuses.includes("poor")) {
    overall = "poor";
  } else if (statuses.includes("needs_improvement")) {
    overall = "needs_improvement";
  }

  return { lcp, inp, cls, overall };
}

function classifyLcp(ms: number): CwvStatus {
  if (ms < 2500) return "good";
  if (ms < 4000) return "needs_improvement";
  return "poor";
}

function classifyInp(ms: number): CwvStatus {
  if (ms < 200) return "good";
  if (ms < 500) return "needs_improvement";
  return "poor";
}

function classifyCls(value: number): CwvStatus {
  if (value < 0.1) return "good";
  if (value < 0.25) return "needs_improvement";
  return "poor";
}

// ---------------------------------------------------------------------------
// Minimal PSI API response type (only the fields we use)
// ---------------------------------------------------------------------------

interface PsiApiResponse {
  lighthouseResult?: {
    categories?: {
      performance?: { score: number };
    };
    audits?: Record<
      string,
      { numericValue?: number; displayValue?: string } | undefined
    >;
  };
}
