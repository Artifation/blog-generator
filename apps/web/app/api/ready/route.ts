/**
 * Readiness probe (vs /api/health = liveness). Returns 200 only when the DB is
 * reachable, the at-rest encryption key is usable, and CRON_TOKEN is set;
 * otherwise 503 with a terse per-check boolean breakdown (no error strings).
 * Point the orchestrator's readiness gate / a deeper uptime check here, and keep
 * /api/health for liveness so long migrations don't trigger restart-storms.
 */

import { NextResponse } from "next/server";
import { checkReadiness } from "~/lib/health/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const report = await checkReadiness();
  return NextResponse.json(
    {
      ok: report.ready,
      status: report.ready ? "ready" : "not-ready",
      checks: report.checks,
      timestamp: new Date().toISOString(),
    },
    {
      status: report.ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    }
  );
}
