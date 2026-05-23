/**
 * Liveness probe for container orchestrators (Docker HEALTHCHECK, systemd,
 * reverse-proxy upstream-check, uptime monitors). Returns 200 with a tiny JSON
 * payload as long as the Next.js server is running.
 *
 * Intentionally does NOT touch the database — a DB-level check would couple
 * liveness to readiness and cause restart-storms during long migrations. If a
 * deeper check is needed later, add `/api/ready` separately.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
