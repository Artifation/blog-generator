import path from "node:path";
import { TrendingDown, TrendingUp, Minus, Clock } from "lucide-react";
import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { listPublishedPostsForSite } from "~/lib/drafts";
import { listRefreshOpportunitiesForSite, listRefreshesForSite } from "~/lib/refreshes";
import { formatRelative } from "~/lib/utils";
import { RefreshButton } from "./refresh-button";
import type { RefreshCategory } from "@/pipeline/refreshOpportunities";
import { loadLatestSnapshot } from "@/pipeline/gscPerformanceInsights";
import { computeRefreshEffect, type RefreshEffectVerdict } from "@/pipeline/refreshEffect";
import type { PostPerformance } from "@/pipeline/gscSnapshot";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<RefreshCategory, string> = {
  decaying: "Decaying",
  striking_distance: "Striking distance",
  stagnant_evergreen: "Stagnant evergreen",
  freshness_overdue: "Freshness overdue",
};

const CATEGORY_BADGE: Record<RefreshCategory, string> = {
  decaying: "b-red",
  striking_distance: "b-green",
  stagnant_evergreen: "b-yellow",
  freshness_overdue: "b-blue",
};

const EFFECT_LABEL: Record<RefreshEffectVerdict, string> = {
  improved: "verbeterd",
  regressed: "verslechterd",
  neutral: "gelijk",
  too_early: "te vroeg",
  no_data: "geen data",
};

const EFFECT_BADGE: Record<RefreshEffectVerdict, string> = {
  improved: "b-green",
  regressed: "b-red",
  neutral: "b-gray",
  too_early: "b-yellow",
  no_data: "b-gray",
};

export default async function RefreshesPage() {
  const site = await requireSite();
  const [
    { opportunities, hasSnapshot, snapshotDate, recentRefreshes },
    history,
    pending,
    topics,
    published,
  ] = await Promise.all([
    listRefreshOpportunitiesForSite({ site }),
    listRefreshesForSite(site.id),
    listDraftsForSite(site.id, "pending_review"),
    listTopicsForSite(site.id),
    listPublishedPostsForSite(site.id),
  ]);

  // Load the latest snapshot once and index posts by URL — used to compute
  // the "Effect" column without a per-row GSC call.
  const snapshotDataDir = path.resolve(process.cwd(), "../../data");
  const latestSnapshot = await loadLatestSnapshot(site.slug, snapshotDataDir).catch(() => null);
  const snapshotByUrl = new Map<string, PostPerformance>();
  if (latestSnapshot) {
    for (const p of latestSnapshot.posts) {
      snapshotByUrl.set(p.url.replace(/\/$/, ""), p);
    }
  }
  const postById = new Map(published.map((p) => [p.id, p]));

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={topics.filter((t) => t.status === "queued").length}
      crumbs={[{ label: "Refreshes" }]}
    >
      <div className="page-head">
        <div className="ph-text">
          <h1>Refreshes</h1>
          <div className="ph-sub">
            Gepubliceerde posts die baat hebben bij een rewriter-pass — gerangschikt op hefboom.
            {hasSnapshot ? (
              <> GSC-snapshot: {snapshotDate}.</>
            ) : (
              <> Geen GSC-snapshot — alleen freshness-kandidaten zichtbaar. Verbind GSC voor decay/striking-signalen.</>
            )}
          </div>
        </div>
      </div>

      {opportunities.length === 0 ? (
        <div className="empty">
          <h2>Geen refresh-kandidaten op dit moment</h2>
          <p>
            Posts verschijnen hier zodra ze ≥180 dagen oud zijn, of zodra een GSC-snapshot
            decay/striking-distance signalen oppikt. Posts binnen 60 dagen na een vorige refresh
            worden uitgesloten.
          </p>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {opportunities.map((opp) => {
            const last = recentRefreshes[opp.publishedPostId];
            return (
              <div key={opp.publishedPostId} className="draft-card" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                    <span className={`badge ${CATEGORY_BADGE[opp.category]}`}>
                      {CATEGORY_LABEL[opp.category]}
                    </span>
                    <span className="muted tnum" style={{ fontSize: 12 }}>
                      score {(opp.score * 100).toFixed(0)}
                    </span>
                  </div>
                  <h3 style={{ marginBottom: 4 }}>{opp.title ?? opp.url}</h3>
                  <p className="tldr" style={{ marginBottom: 8 }}>
                    {opp.rationale}
                  </p>
                  <div className="dc-meta" style={{ fontSize: 12 }}>
                    {opp.signals.avg_position != null && (
                      <span className="muted">
                        pos {opp.signals.avg_position.toFixed(1)}
                        {opp.signals.avg_position_all_time != null && (
                          <> (was {opp.signals.avg_position_all_time.toFixed(1)})</>
                        )}
                      </span>
                    )}
                    {opp.signals.impressions_30d != null && (
                      <span className="muted">{opp.signals.impressions_30d} impr/30d</span>
                    )}
                    {opp.signals.clicks_30d != null && (
                      <span className="muted">{opp.signals.clicks_30d} clicks/30d</span>
                    )}
                    <span className="muted">{opp.signals.days_since_publish}d sinds publish</span>
                    {last && (
                      <span className="muted">
                        laatste refresh: {formatRelative(last.triggeredAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ marginLeft: 16, flexShrink: 0 }}>
                  <RefreshButton publishedPostId={opp.publishedPostId} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Geschiedenis</h2>
          <div className="card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Wanneer</th>
                  <th>Post</th>
                  <th>Categorie</th>
                  <th>Status</th>
                  <th>Effect</th>
                  <th>Draft</th>
                  <th>Kosten</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 25).map((h) => {
                  const post = postById.get(h.publishedPostId);
                  const postUrl = post
                    ? post.externalUrl ?? `https://${site.domain}/${post.slug}`
                    : null;
                  const snap = postUrl
                    ? snapshotByUrl.get(postUrl.replace(/\/$/, ""))
                    : undefined;
                  const effect = computeRefreshEffect({
                    before: h.beforeSnapshot,
                    current: snap
                      ? {
                          clicks_30d: snap.last_30d.clicks,
                          impressions_30d: snap.last_30d.impressions,
                          avg_position: snap.last_30d.avg_position,
                        }
                      : null,
                    triggeredAt: h.triggeredAt,
                  });

                  return (
                    <tr key={h.id}>
                      <td>{formatRelative(h.triggeredAt)}</td>
                      <td style={{ fontSize: 13, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {post ? (
                          <a href={`/published/${post.id}`} className="lnk">
                            {post.title}
                          </a>
                        ) : (
                          <span className="muted">verwijderd</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${CATEGORY_BADGE[h.category]}`}>
                          {CATEGORY_LABEL[h.category]}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            h.status === "drafted"
                              ? "b-green"
                              : h.status === "failed"
                              ? "b-red"
                              : "b-gray"
                          }`}
                        >
                          {h.status}
                        </span>
                      </td>
                      <td>
                        <EffectCell effect={effect} />
                      </td>
                      <td>
                        {h.draftId ? (
                          <a href={`/drafts/${h.draftId}`} className="lnk">
                            openen
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="tnum muted">
                        {h.costUsd != null ? `$${h.costUsd.toFixed(3)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function EffectCell({
  effect,
}: {
  effect: ReturnType<typeof computeRefreshEffect>;
}) {
  const verdict = effect.verdict;
  const label = EFFECT_LABEL[verdict];
  const badge = EFFECT_BADGE[verdict];

  if (verdict === "no_data") {
    return (
      <span className={`badge ${badge}`}>
        {label}
      </span>
    );
  }

  const Icon =
    verdict === "improved"
      ? TrendingUp
      : verdict === "regressed"
      ? TrendingDown
      : verdict === "too_early"
      ? Clock
      : Minus;

  const showDeltas = effect.positionDelta != null || effect.clicksDelta != null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className={`badge ${badge}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, width: "fit-content" }}>
        <Icon size={11} />
        {label}
        {verdict === "too_early" && ` (${effect.daysSinceRefresh}d)`}
      </span>
      {showDeltas && (
        <span className="muted tnum" style={{ fontSize: 11 }}>
          {effect.positionDelta != null && (
            <>pos {effect.positionDelta > 0 ? "+" : ""}{effect.positionDelta.toFixed(1)}</>
          )}
          {effect.clicksDelta != null && (
            <>{effect.positionDelta != null ? " · " : ""}clicks {effect.clicksDelta > 0 ? "+" : ""}{effect.clicksDelta}</>
          )}
        </span>
      )}
    </div>
  );
}
