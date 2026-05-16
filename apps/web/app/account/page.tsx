import Link from "next/link";
import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { listRunsForSite } from "~/lib/runs";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const site = await requireSite();
  const pending = await listDraftsForSite(site.id, "pending_review");
  const topics = await listTopicsForSite(site.id);
  const runs = await listRunsForSite(site.id, 100);
  const totalCost = runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const thisMonth = runs
    .filter((r) => new Date(r.startedAt).getMonth() === new Date().getMonth())
    .reduce((s, r) => s + (r.costUsd ?? 0), 0);

  const author = (site.author ?? {}) as { name?: string };
  const initials = (author.name ?? "")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={topics.filter((t) => t.status === "queued").length}
      crumbs={[{ label: "Account" }]}
    >
      <div className="page-head">
        <div className="ph-text">
          <h1>Mijn account</h1>
          <div className="ph-sub">Profiel, abonnement en AI-kosten.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3>Profiel</h3>
          </div>
          <div className="card-body row" style={{ gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: "var(--secondary)",
                color: "white",
                display: "grid",
                placeItems: "center",
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              {initials || "?"}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{author.name ?? "Onbekend"}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {author.name?.split(" ")[0]?.toLowerCase() ?? "user"}@{site.domain}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {site.name}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Abonnement</h3>
          </div>
          <div className="card-body">
            <div className="row between">
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--primary)" }}>Pro</div>
                <div className="muted" style={{ fontSize: 12 }}>€129 / maand</div>
              </div>
              <span className="badge b-green">Actief</span>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <div className="muted" style={{ fontSize: 12 }}>Volgende factuur</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {new Date(Date.now() + 14 * 86400000).toLocaleDateString("nl-NL", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>AI-kosten deze maand</h3>
            <Link href="/costs" className="card-action btn btn-ghost btn-sm">
              Details →
            </Link>
          </div>
          <div className="card-body">
            <div className="qc-total">
              <span className="qc-num">${thisMonth.toFixed(2)}</span>
              <span className="qc-max">/ maand</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: -4 }}>
              Op basis van {runs.length} runs · cumulatief ${totalCost.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Facturen</h3>
          </div>
          <div className="card-body">
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Geen facturen om te tonen (demo). In productie zou je hier per maand een PDF
              kunnen downloaden.
            </p>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
