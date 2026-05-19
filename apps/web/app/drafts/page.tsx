import Link from "next/link";
import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { formatRelative } from "~/lib/utils";
import { Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const site = await requireSite();
  const pending = await listDraftsForSite(site.id, "pending_review");
  const all = await listDraftsForSite(site.id);
  const recent = all.filter((d) => d.status !== "pending_review").slice(0, 20);
  const topics = await listTopicsForSite(site.id);
  const queuedTopics = topics.filter((t) => t.status === "queued").length;

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={queuedTopics}
      crumbs={[{ label: "Drafts" }]}
    >
      <div className="page-head">
        <div className="ph-text">
          <h1>Drafts</h1>
          <div className="ph-sub">Review, edit, keur goed of wijs af.</div>
        </div>
      </div>

      <h3 style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
        Pending review <span className="kc-count" style={{ marginLeft: 6 }}>{pending.length}</span>
      </h3>

      {pending.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <Inbox size={24} />
          </div>
          <h2>Geen drafts wachtend</h2>
          <p>Genereer er een vanuit een topic.</p>
          <Link href="/topics" className="btn btn-primary">Naar topics</Link>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {pending.map((d) => (
            <DraftCard key={d.id} draft={d} qualityThreshold={site.qualityThreshold} />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <h3 style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "32px 0 12px" }}>
            Recent
          </h3>
          <div className="col" style={{ gap: 10 }}>
            {recent.map((d) => (
              <DraftCard key={d.id} draft={d} qualityThreshold={site.qualityThreshold} />
            ))}
          </div>
        </>
      )}
    </AdminShell>
  );
}

function DraftCard({
  draft,
  qualityThreshold,
}: {
  draft: {
    id: string;
    title: string;
    slug: string;
    tldr: string;
    status: string;
    weightedTotal: number | null;
    hardFails: string[] | null;
    createdAt: string;
  };
  qualityThreshold: number;
}) {
  const scoreClass =
    draft.weightedTotal == null
      ? ""
      : draft.weightedTotal >= qualityThreshold
      ? ""
      : draft.weightedTotal >= qualityThreshold - 1
      ? "low"
      : "fail";

  return (
    <Link href={`/drafts/${draft.id}`} className="draft-card">
      <div>
        <h3>{draft.title}</h3>
        <div className="dc-meta">
          <span className={`badge ${draft.status === "published" ? "b-green" : draft.status === "rejected" ? "b-red" : "b-blue"}`}>
            {draft.status.replace("_", " ")}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            {formatRelative(draft.createdAt)} · /{draft.slug}
          </span>
        </div>
        <p className="tldr">{draft.tldr}</p>
        {draft.hardFails && draft.hardFails.length > 0 && (
          <div className="dc-meta" style={{ marginTop: 6 }}>
            {draft.hardFails.map((f, idx) => (
              // Index-based key: duplicates in the array (e.g. two identically-worded
              // fabricated claims from one rejection) are allowed and would crash
              // React's reconciliation if we used `f` as the key.
              <span key={`${idx}-${f}`} className="badge b-red">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
      {draft.weightedTotal != null && (
        <div className={`score-pill ${scoreClass}`}>
          {draft.weightedTotal.toFixed(1)} / 10
        </div>
      )}
    </Link>
  );
}
