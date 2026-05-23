import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Sparkline } from "~/components/ranking/sparkline";
import type { PostRankingResult, PostRankingSkip } from "~/lib/ranking";

export function RankingPanel({ result }: { result: PostRankingResult | PostRankingSkip }) {
  if (!result.ok) {
    return (
      <div className="card">
        <div className="card-header">
          <h3>Ranking</h3>
        </div>
        <div className="card-body">
          <p className="muted" style={{ fontSize: 13 }}>
            {result.reason === "missing_gsc_credentials"
              ? "Verbind Google Search Console om ranking-data te zien."
              : result.message}
          </p>
        </div>
      </div>
    );
  }

  const { history, summary, refreshMarkers } = result;
  const positionPoints = history.days
    .filter((d) => d.impressions > 0)
    .map((d) => ({ date: d.date, value: d.position }));
  const clicksPoints = history.days.map((d) => ({ date: d.date, value: d.clicks }));

  return (
    <div className="card">
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between" }}>
        <h3>Ranking</h3>
        <span className="muted" style={{ fontSize: 11 }}>
          Laatst opgehaald {new Date(history.pulled_at_iso).toLocaleString("nl-NL")}
        </span>
      </div>
      <div className="card-body">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <Metric
            label="Positie (7d)"
            value={summary.last7d.avgPosition > 0 ? summary.last7d.avgPosition.toFixed(1) : "—"}
            delta={summary.deltaVsPrior?.positionDelta}
            deltaInverted
          />
          <Metric
            label="Clicks (7d)"
            value={summary.last7d.clicks.toString()}
            delta={summary.deltaVsPrior?.clicksDelta}
          />
          <Metric
            label="Impressies (7d)"
            value={summary.last7d.impressions.toString()}
            delta={summary.deltaVsPrior?.impressionsDelta}
          />
          <Metric
            label="CTR (7d)"
            value={summary.last7d.impressions > 0 ? `${(summary.last7d.avgCtr * 100).toFixed(1)}%` : "—"}
            delta={summary.deltaVsPrior ? summary.deltaVsPrior.ctrDelta * 100 : undefined}
            unit="%"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Positie-verloop (90d) — lager = beter
          </div>
          <Sparkline
            points={positionPoints}
            yMode="position"
            stroke="#4f46e5"
            fill="rgba(79, 70, 229, 0.08)"
            markers={refreshMarkers.map((r) => ({ date: r.date, label: `Refresh: ${r.category}` }))}
            showAverage
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Clicks (90d)
          </div>
          <Sparkline
            points={clicksPoints}
            stroke="#10b981"
            fill="rgba(16, 185, 129, 0.08)"
            markers={refreshMarkers.map((r) => ({ date: r.date, label: `Refresh: ${r.category}` }))}
          />
        </div>

        {history.topQueries.length > 0 && (
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Top queries (90d)
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Query</th>
                  <th style={{ textAlign: "right" }}>Positie</th>
                  <th style={{ textAlign: "right" }}>Impr</th>
                  <th style={{ textAlign: "right" }}>Clicks</th>
                </tr>
              </thead>
              <tbody>
                {history.topQueries.map((q) => (
                  <tr key={q.query}>
                    <td style={{ fontSize: 13 }}>{q.query}</td>
                    <td className="tnum" style={{ textAlign: "right" }}>
                      {q.position.toFixed(1)}
                    </td>
                    <td className="tnum" style={{ textAlign: "right" }}>
                      {q.impressions}
                    </td>
                    <td className="tnum" style={{ textAlign: "right" }}>
                      {q.clicks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {refreshMarkers.length > 0 && (
          <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
            <span style={{ color: "#f59e0b" }}>●</span> Gele markers = refresh-trigger op deze post.
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  delta,
  deltaInverted = false,
  unit = "",
}: {
  label: string;
  value: string;
  delta?: number;
  /** When true, a negative delta is "good" (position: lower = better rank). */
  deltaInverted?: boolean;
  unit?: string;
}) {
  const showDelta = delta !== undefined && Math.abs(delta) > 0.05;
  const good = showDelta
    ? deltaInverted
      ? delta! < 0
      : delta! > 0
    : null;
  const Icon =
    !showDelta ? Minus : good ? TrendingUp : TrendingDown;
  const color = !showDelta
    ? "var(--muted, #9ca3af)"
    : good
    ? "#10b981"
    : "#ef4444";

  return (
    <div
      style={{
        background: "var(--surface-2, #fafafa)",
        borderRadius: 6,
        padding: "8px 10px",
        border: "1px solid var(--border, #e5e7eb)",
      }}
    >
      <div className="muted" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div className="tnum" style={{ fontSize: 18, fontWeight: 600 }}>
        {value}
      </div>
      {showDelta && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, color, fontSize: 11 }}>
          <Icon size={11} />
          <span className="tnum">
            {delta! > 0 ? "+" : ""}
            {delta!.toFixed(unit === "%" ? 2 : Math.abs(delta!) >= 10 ? 0 : 1)}
            {unit}
          </span>
        </div>
      )}
    </div>
  );
}
