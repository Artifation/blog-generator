import { querySearchConsole, type GscClientOpts } from "@/integrations/searchConsole";

export interface GscCannibalizationInput {
  gscOpts: GscClientOpts;
  propertyUrl: string;
  targetKeyword: string;
  lookbackDays?: number;    // default 90
  minImpressions?: number;  // default 100
  now?: Date;
}

export interface GscCannibalizationResult {
  isCannibalized: boolean;
  reason: string;
  competingPages: { page: string; clicks: number; impressions: number; position: number }[];
}

function dateYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function detectCannibalizationViaGsc(
  input: GscCannibalizationInput
): Promise<GscCannibalizationResult> {
  const lookbackDays = input.lookbackDays ?? 90;
  const minImpressions = input.minImpressions ?? 100;
  const now = input.now ?? new Date();

  const endDate = dateYmd(now);
  const startDate = dateYmd(new Date(now.getTime() - lookbackDays * 86_400_000));

  const result = await querySearchConsole(input.gscOpts, {
    propertyUrl: input.propertyUrl,
    startDate,
    endDate,
    dimensions: ["query", "page"],
    rowLimit: 25000,
    filters: [
      {
        dimension: "query",
        operator: "equals",
        expression: input.targetKeyword,
      },
    ],
  });

  // Aggregate by page (sum across all query rows for this page)
  const pageMap = new Map<string, { clicks: number; impressions: number; position: number; count: number }>();
  for (const row of result.rows) {
    const page = row.keys[1] ?? "";
    if (!page) continue;
    const existing = pageMap.get(page);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.position += row.position;
      existing.count += 1;
    } else {
      pageMap.set(page, { clicks: row.clicks, impressions: row.impressions, position: row.position, count: 1 });
    }
  }

  // Filter pages meeting minImpressions threshold
  const qualifying = Array.from(pageMap.entries())
    .map(([page, data]) => ({
      page,
      clicks: data.clicks,
      impressions: data.impressions,
      position: data.count > 0 ? data.position / data.count : 0,
    }))
    .filter((p) => p.impressions >= minImpressions)
    .sort((a, b) => b.impressions - a.impressions);

  if (qualifying.length < 2) {
    return {
      isCannibalized: false,
      reason:
        qualifying.length === 0
          ? `Geen pages ranken op "${input.targetKeyword}" met ≥${minImpressions} impressies.`
          : `Slechts 1 page rankt op "${input.targetKeyword}" — geen cannibalizatie.`,
      competingPages: qualifying,
    };
  }

  const winner = qualifying[0]!;
  return {
    isCannibalized: true,
    reason: `${qualifying.length} pages ranken op "${input.targetKeyword}" met ≥${minImpressions} impressies. Sterkste: ${winner.page} (${winner.impressions} impressies).`,
    competingPages: qualifying,
  };
}
