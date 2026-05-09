import { google } from "googleapis";

export interface GscClientOpts {
  serviceAccountJson: string; // raw JSON string of service account credentials
}

export interface GscQueryInput {
  propertyUrl: string; // e.g. "sc-domain:artifation.nl" or "https://artifation.nl/"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dimensions?: ("query" | "page" | "country" | "device" | "date")[];
  rowLimit?: number; // default 1000, max 25000
  filters?: {
    dimension: string;
    operator: "equals" | "contains" | "notEquals" | "notContains";
    expression: string;
  }[];
}

export interface GscRow {
  keys: string[]; // matches dimensions
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscQueryResult {
  rows: GscRow[];
  totals: { clicks: number; impressions: number; ctr: number; position: number };
}

function buildAuth(opts: GscClientOpts) {
  const credentials = JSON.parse(opts.serviceAccountJson) as {
    client_email: string;
    private_key: string;
  };
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

export async function querySearchConsole(
  opts: GscClientOpts,
  input: GscQueryInput
): Promise<GscQueryResult> {
  const auth = buildAuth(opts);
  const sc = google.searchconsole({ version: "v1", auth });

  const response = await sc.searchanalytics.query({
    siteUrl: input.propertyUrl,
    requestBody: {
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: input.dimensions ?? ["query", "page"],
      rowLimit: input.rowLimit ?? 1000,
      dimensionFilterGroups: input.filters && input.filters.length > 0
        ? [
            {
              filters: input.filters.map((f) => ({
                dimension: f.dimension,
                operator: f.operator,
                expression: f.expression,
              })),
            },
          ]
        : undefined,
    },
  });

  const rawRows = response.data.rows ?? [];

  const rows: GscRow[] = rawRows.map((r) => ({
    keys: r.keys ?? [],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));

  if (rows.length === 0) {
    return {
      rows: [],
      totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    };
  }

  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPosition = rows.reduce((s, r) => s + r.position, 0) / rows.length;

  return {
    rows,
    totals: {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: avgCtr,
      position: avgPosition,
    },
  };
}

export async function listProperties(opts: GscClientOpts): Promise<string[]> {
  const auth = buildAuth(opts);
  const sc = google.searchconsole({ version: "v1", auth });

  const response = await sc.sites.list();
  const siteEntry = response.data.siteEntry ?? [];
  return siteEntry.map((s) => s.siteUrl ?? "").filter((u) => u.length > 0);
}
