import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listRunsForSite } from "~/lib/runs";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { formatRelative } from "~/lib/utils";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const site = await requireSite();
  const runs = await listRunsForSite(site.id, 100);
  const pending = await listDraftsForSite(site.id, "pending_review");
  const topics = await listTopicsForSite(site.id);

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={topics.filter((t) => t.status === "queued").length}
      crumbs={[{ label: "Runs" }]}
    >
      <div className="page-head">
        <div className="ph-text">
          <h1>Pipeline runs</h1>
          <div className="ph-sub">Iedere pipeline-execution met verdict, score en kosten.</div>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="empty">
          <h2>Nog geen runs</h2>
          <p>Genereer een draft uit een topic.</p>
        </div>
      ) : (
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>Gestart</th>
                <th>Verdict</th>
                <th>Score</th>
                <th>Kosten</th>
                <th>Stages</th>
                <th>Reden</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{formatRelative(r.startedAt)}</td>
                  <td>
                    <span
                      className={`badge ${
                        r.verdict === "published"
                          ? "b-green"
                          : r.verdict === "rejected"
                          ? "b-yellow"
                          : r.verdict === "error"
                          ? "b-red"
                          : "b-gray"
                      }`}
                    >
                      {r.verdict}
                    </span>
                  </td>
                  <td className="tnum">
                    {r.weightedTotal != null ? r.weightedTotal.toFixed(1) : "—"}
                  </td>
                  <td className="tnum muted">
                    {r.costUsd != null ? `$${r.costUsd.toFixed(3)}` : "—"}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {(r.stages ?? []).length ? `${(r.stages ?? []).length} stages` : "—"}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {r.reason ?? r.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
