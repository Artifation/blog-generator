"use server";

import { revalidatePath } from "next/cache";
import { requireSite } from "~/lib/auth";
import { currentUserHasRole } from "~/lib/auth/roles";
import { runGscSnapshotForSite } from "~/lib/pipeline/gscSnapshotForSite";

export interface SnapshotActionResult {
  ok: boolean;
  message: string;
  postsScanned?: number;
  totalClicks30d?: number;
  totalImpressions30d?: number;
  snapshotDate?: string;
}

export async function runGscSnapshotAction(): Promise<SnapshotActionResult> {
  const site = await requireSite();
  if (!(await currentUserHasRole("editor"))) {
    return { ok: false, message: "Alleen editors of eigenaren kunnen een GSC-snapshot draaien." };
  }
  const result = await runGscSnapshotForSite({ site });
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `Snapshot opgeslagen — ${result.postsScanned} posts gescand.`,
    postsScanned: result.postsScanned,
    totalClicks30d: result.snapshot.summary.total_clicks_last_30d,
    totalImpressions30d: result.snapshot.summary.total_impressions_last_30d,
    snapshotDate: result.snapshot.snapshot_date,
  };
}
