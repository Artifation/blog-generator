/**
 * Cron-runner endpoint.
 *
 *   GET /api/cron/[siteSlug]
 *   Authorization: Bearer <CRON_TOKEN>     (preferred — keeps the token out of
 *                                           access logs / process lists)
 *   or header  X-Cron-Token: <CRON_TOKEN>
 *   or (deprecated) ?token=<CRON_TOKEN>     (still accepted for compatibility)
 *
 * Hook this up to an external scheduler (Vercel cron, GitHub Actions, system
 * cron, EasyCron, etc.). It picks the highest-priority queued topic for the
 * site, runs the multi-agent pipeline, and returns a JSON summary.
 *
 * Auth: the supplied token must equal env CRON_TOKEN (constant-time compare).
 * Without that env var the endpoint refuses to serve to prevent open
 * invocations.
 *
 * Auto-publish: if the site has autoPublish=true, an approved draft is
 * immediately pushed to its destination. Otherwise it lands as pending_review
 * for human approval.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSiteBySlug } from "~/lib/sites";
import { listTopicsForSite } from "~/lib/topics";

/** Constant-time string compare — avoids a timing oracle on the cron token. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
// Heavy modules (sharp via image/optimize, fal, etc.) lazy-loaded inside the
// handler so Next.js doesn't try to evaluate them during build-time data collection.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request, { params }: { params: Promise<{ siteSlug: string }> }) {
  const { siteSlug } = await params;
  const url = new URL(req.url);

  const expected = process.env.CRON_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Cron endpoint is uitgeschakeld — server heeft geen CRON_TOKEN ingesteld." },
      { status: 503 }
    );
  }
  // Prefer header-based auth (keeps the token out of access logs / process
  // lists); fall back to the deprecated ?token= query param for compatibility.
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const token = bearer || req.headers.get("x-cron-token") || url.searchParams.get("token") || "";
  if (!token || !safeEqual(token, expected)) {
    return NextResponse.json({ ok: false, error: "Ongeldige token." }, { status: 401 });
  }

  const site = await getSiteBySlug(siteSlug);
  if (!site) {
    return NextResponse.json({ ok: false, error: `Site ${siteSlug} niet gevonden` }, { status: 404 });
  }

  const queued = await listTopicsForSite(site.id, "queued");
  if (queued.length === 0) {
    return NextResponse.json({ ok: true, action: "skip", reason: "geen queued topics" });
  }

  const topic = queued.sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))[0]!;
  const { runForSite } = await import("~/lib/pipeline/runForSite");
  const result = await runForSite(site, topic);

  if (result.verdict === "published" && result.draftId && (site as { autoPublish?: boolean }).autoPublish) {
    const { getDraft } = await import("~/lib/drafts");
    const { publishDraft } = await import("~/lib/publish");
    const draft = await getDraft(result.draftId);
    if (draft) {
      try {
        const pub = await publishDraft(draft, site);
        return NextResponse.json({
          ok: true,
          action: "published",
          topic: topic.title,
          draftId: result.draftId,
          score: result.weightedTotal,
          cost: result.costUsd,
          destination: pub.destination,
          url: pub.url,
        });
      } catch (err) {
        return NextResponse.json(
          { ok: false, error: `Pipeline OK maar publish faalde: ${(err as Error).message}` },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    action: result.verdict,
    topic: topic.title,
    draftId: result.draftId,
    score: result.weightedTotal,
    hardFails: result.hardFails,
    reason: result.reason,
    cost: result.costUsd,
  });
}
