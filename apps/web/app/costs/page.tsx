import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listRunsForSite } from "~/lib/runs";
import { listDraftsForSite, listPublishedPostsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { formatRelative } from "~/lib/utils";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const site = await requireSite();
  const runs = await listRunsForSite(site.id, 500);
  const pending = await listDraftsForSite(site.id, "pending_review");
  const topics = await listTopicsForSite(site.id);
  const published = await listPublishedPostsForSite(site.id);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  const thisMonthRuns = runs.filter((r) => r.startedAt >= startOfMonth);
  const last30Runs = runs.filter((r) => r.startedAt >= thirtyDaysAgo);

  const sum = (xs: Array<{ costUsd: number | null }>) =>
    xs.reduce((s, r) => s + (r.costUsd ?? 0), 0);

  const monthCost = sum(thisMonthRuns);
  const last30Cost = sum(last30Runs);
  const allTimeCost = sum(runs);

  const byVerdict = {
    published: runs.filter((r) => r.verdict === "published"),
    rejected: runs.filter((r) => r.verdict === "rejected"),
    error: runs.filter((r) => r.verdict === "error"),
    other: runs.filter(
      (r) => r.verdict !== "published" && r.verdict !== "rejected" && r.verdict !== "error"
    ),
  };

  const avgPerPublished = byVerdict.published.length
    ? sum(byVerdict.published) / byVerdict.published.length
    : 0;
  const wastedOnRejected = sum(byVerdict.rejected);

  // Last 30 days sparkline data — sum cost per day bucket
  const dayBuckets: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    dayBuckets[key] = 0;
  }
  for (const r of last30Runs) {
    const key = r.startedAt.slice(0, 10);
    if (key in dayBuckets) dayBuckets[key] += r.costUsd ?? 0;
  }
  const maxDay = Math.max(...Object.values(dayBuckets), 0.001);

  // Estimate monthly run-rate
  const daysIntoMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = daysIntoMonth > 0 ? (monthCost / daysIntoMonth) * daysInMonth : 0;

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={topics.filter((t) => t.status === "queued").length}
      crumbs={[{ label: "Kosten" }]}
    >
      <div className="page-head">
        <div className="ph-text">
          <h1>Kosten</h1>
          <div className="ph-sub">
            Wat de pipeline je kost — per maand, per post, en waar het naartoe ging.
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Deze maand</div>
          <div className="stat-value">${monthCost.toFixed(2)}</div>
          <div className="stat-sub">
            {thisMonthRuns.length} runs · prognose ${projected.toFixed(2)} eind maand
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Laatste 30 dagen</div>
          <div className="stat-value">${last30Cost.toFixed(2)}</div>
          <div className="stat-sub">{last30Runs.length} runs</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gem. per gepubliceerde post</div>
          <div className="stat-value">${avgPerPublished.toFixed(2)}</div>
          <div className="stat-sub">{byVerdict.published.length} posts gepubliceerd</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">All-time</div>
          <div className="stat-value">${allTimeCost.toFixed(2)}</div>
          <div className="stat-sub">sinds start van deze site</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
        <div className="card">
          <div className="card-header">
            <h3>Laatste 30 dagen</h3>
          </div>
          <div className="card-body">
            <Sparkline buckets={dayBuckets} max={maxDay} />
            <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              Piek dag: ${maxDay.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Verdeling per verdict</h3>
          </div>
          <div className="card-body col" style={{ gap: 12 }}>
            <CostRow
              label="Gepubliceerd"
              value={sum(byVerdict.published)}
              count={byVerdict.published.length}
              tone="b-green"
              total={allTimeCost}
            />
            <CostRow
              label="Afgewezen"
              value={wastedOnRejected}
              count={byVerdict.rejected.length}
              tone="b-yellow"
              total={allTimeCost}
            />
            <CostRow
              label="Errors"
              value={sum(byVerdict.error)}
              count={byVerdict.error.length}
              tone="b-red"
              total={allTimeCost}
            />
            {byVerdict.other.length > 0 && (
              <CostRow
                label="Overig"
                value={sum(byVerdict.other)}
                count={byVerdict.other.length}
                tone="b-gray"
                total={allTimeCost}
              />
            )}
            {wastedOnRejected > 0 && (
              <div
                style={{
                  fontSize: 12,
                  padding: 10,
                  background: "var(--warning-bg)",
                  borderRadius: 6,
                  color: "#b45309",
                  border: "1px solid #fde68a",
                  marginTop: 4,
                }}
              >
                Je betaalt ook voor drafts die de kwaliteitsdrempel niet halen.
                {wastedOnRejected > monthCost * 0.3 && published.length > 0 && (
                  <> Overweeg de threshold ({site.qualityThreshold.toFixed(1)}) te verlagen.</>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3>Laatste runs (kosten per stuk)</h3>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Gestart</th>
              <th>Verdict</th>
              <th>Score</th>
              <th style={{ textAlign: "right" }}>Kosten</th>
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 25).map((r) => (
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
                <td className="tnum" style={{ textAlign: "right" }}>
                  {r.costUsd != null ? `$${r.costUsd.toFixed(3)}` : "—"}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Nog geen runs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

function CostRow({
  label,
  value,
  count,
  tone,
  total,
}: {
  label: string;
  value: number;
  count: number;
  tone: string;
  total: number;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className={`badge ${tone}`}>{label}</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {count} runs
          </span>
        </div>
        <div className="tnum" style={{ fontWeight: 600 }}>
          ${value.toFixed(2)}
        </div>
      </div>
      <div className="qc-bar">
        <div
          className={`qc-bar-fill ${tone === "b-yellow" ? "warn" : ""}`}
          style={{ width: `${pct}%`, background: tone === "b-red" ? "var(--danger)" : tone === "b-yellow" ? "var(--warning)" : tone === "b-green" ? "var(--success)" : "var(--gray-2)" }}
        />
      </div>
    </div>
  );
}

function Sparkline({ buckets, max }: { buckets: Record<string, number>; max: number }) {
  const entries = Object.entries(buckets);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${entries.length}, 1fr)`,
        gap: 2,
        alignItems: "end",
        height: 110,
      }}
    >
      {entries.map(([day, v]) => {
        const h = max > 0 ? Math.max((v / max) * 100, v > 0 ? 4 : 1) : 1;
        const isToday = day === new Date().toISOString().slice(0, 10);
        return (
          <div key={day} style={{ display: "flex", flexDirection: "column", alignItems: "stretch", height: "100%" }}>
            <div style={{ flex: 1 }} />
            <div
              title={`${day}: $${v.toFixed(3)}`}
              style={{
                height: `${h}%`,
                background: isToday ? "var(--secondary)" : v > 0 ? "rgba(59,130,246,0.5)" : "var(--surface-3)",
                borderRadius: 2,
                transition: "background 0.2s",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
