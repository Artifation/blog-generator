import Link from "next/link";
import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listTopicsForSite } from "~/lib/topics";
import { listDraftsForSite, listPublishedPostsForSite } from "~/lib/drafts";
import { listRunsForSite } from "~/lib/runs";
import { formatRelative } from "~/lib/utils";
import { ArrowRight, FileText, Globe, ListChecks, Activity } from "lucide-react";
import { RunNowButton } from "./run-now-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const site = await requireSite();
  const topics = await listTopicsForSite(site.id);
  const queued = topics.filter((t) => t.status === "queued");
  const pendingDrafts = await listDraftsForSite(site.id, "pending_review");
  const published = await listPublishedPostsForSite(site.id);
  const runs = await listRunsForSite(site.id, 5);

  return (
    <AdminShell
      site={site}
      pendingDrafts={pendingDrafts.length}
      queuedTopics={queued.length}
      crumbs={[{ label: "Overzicht" }]}
    >
      <div className="page-head">
        <div className="ph-text">
          <h1>Overzicht</h1>
          <div className="ph-sub">Wat staat er klaar voor {site.name}?</div>
        </div>
        <div className="ph-actions">
          <RunNowButton disabled={queued.length === 0} />
          <Link href="/topics" className="btn btn-primary">
            Nieuw topic
          </Link>
        </div>
      </div>

      <div className="stats-grid">
        <Link href="/topics" className="stat-card">
          <div className="stat-label">
            <ListChecks size={11} /> Queued topics
          </div>
          <div className="stat-value">{queued.length}</div>
          <div className="stat-sub">in de wachtrij</div>
        </Link>
        <Link
          href="/drafts"
          className={`stat-card ${pendingDrafts.length > 0 ? "alert" : ""}`}
        >
          <div className="stat-label">
            <FileText size={11} /> Drafts wachtend op review
          </div>
          <div className="stat-value">{pendingDrafts.length}</div>
          <div className="stat-sub">
            {pendingDrafts.length > 0 ? "review om te publiceren" : "alles up-to-date"}
          </div>
        </Link>
        <Link href="/published" className="stat-card">
          <div className="stat-label">
            <Globe size={11} /> Gepubliceerd
          </div>
          <div className="stat-value">{published.length}</div>
          <div className="stat-sub">posts live</div>
        </Link>
        <Link href="/runs" className="stat-card">
          <div className="stat-label">
            <Activity size={11} /> Recente runs
          </div>
          <div className="stat-value">{runs.length}</div>
          <div className="stat-sub">laatste 5 events</div>
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
        <div className="card">
          <div className="card-header">
            <h3>Volgende stap</h3>
          </div>
          <div className="card-body col" style={{ gap: 8 }}>
            {pendingDrafts.length > 0 ? (
              <Suggestion
                label={`Review ${pendingDrafts.length} draft${pendingDrafts.length === 1 ? "" : "s"}`}
                href="/drafts"
              />
            ) : queued.length === 0 ? (
              <Suggestion label="Voeg je eerste topic toe" href="/topics" />
            ) : (
              <Suggestion label={`Genereer een post uit "${queued[0]!.title}"`} href="/topics" />
            )}
            <Suggestion label="Pas brand voice of ban list aan" href="/settings" />
            <Suggestion label="Bekijk publieke blog" href={`/blog/${site.slug}`} external />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Laatste runs</h3>
          </div>
          <div className="card-body">
            {runs.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Nog geen runs — start vanuit een topic om hier resultaten te zien.
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {runs.map((r) => (
                  <li
                    key={r.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13, textTransform: "capitalize" }}>
                        {r.verdict}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {formatRelative(r.startedAt)}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      {r.weightedTotal !== null && r.weightedTotal !== undefined && (
                        <span
                          className={`badge ${
                            r.weightedTotal >= site.qualityThreshold ? "b-green" : "b-yellow"
                          }`}
                        >
                          {r.weightedTotal.toFixed(1)}
                        </span>
                      )}
                      {r.costUsd !== null && r.costUsd !== undefined && (
                        <span className="muted tnum" style={{ fontSize: 12 }}>
                          ${r.costUsd.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Suggestion({ label, href, external }: { label: string; href: string; external?: boolean }) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 13,
        color: "var(--text)",
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      <span>{label}</span>
      <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
    </Link>
  );
}
