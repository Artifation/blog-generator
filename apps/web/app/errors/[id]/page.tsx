import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { getError, countErrors } from "~/lib/errors/store";
import { formatRelative } from "~/lib/utils";
import { resolveErrorAction, reopenErrorAction } from "../actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ErrorDetailPage({ params }: PageProps) {
  const site = await requireSite();
  const { id } = await params;

  const event = await getError(id);
  // Site-scope: only this site's rows or global/scheduler rows (site_id NULL).
  // Anything else is another tenant's error — treat as not found.
  if (!event || (event.siteId && event.siteId !== site.id)) {
    notFound();
  }

  const [pending, topics, counts] = await Promise.all([
    listDraftsForSite(site.id, "pending_review"),
    listTopicsForSite(site.id),
    countErrors({ siteId: site.id, includeGlobal: true }),
  ]);
  const queuedTopics = topics.filter((t) => t.status === "queued").length;

  const contextPretty = event.context
    ? JSON.stringify(event.context, null, 2)
    : null;

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={queuedTopics}
      unresolvedErrors={counts.unresolved}
      crumbs={[{ label: "Errors", href: "/errors" }, { label: "Detail" }]}
    >
      <div className="page-head">
        <div className="ph-text">
          <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {event.severity === "fatal" && <AlertTriangle size={20} color="#b91c1c" />}
            {event.source} · {event.severity}
          </h1>
          <div className="ph-sub">
            {formatRelative(event.ts)} ·{" "}
            {event.resolvedAt ? (
              <span className="badge b-green">opgelost</span>
            ) : (
              <span className="badge b-gray">open</span>
            )}
          </div>
        </div>
        <Link href="/errors" className="btn btn-outline btn-sm">
          ← terug
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Message</h3>
        <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{event.message}</p>

        {event.stack && (
          <>
            <h3>Stacktrace</h3>
            <pre
              style={{
                overflow: "auto",
                fontSize: 12,
                background: "var(--surface-2, #f6f6f6)",
                padding: 12,
                borderRadius: 6,
              }}
            >
              {event.stack}
            </pre>
          </>
        )}

        {contextPretty && (
          <>
            <h3>Context</h3>
            <pre
              style={{
                overflow: "auto",
                fontSize: 12,
                background: "var(--surface-2, #f6f6f6)",
                padding: 12,
                borderRadius: 6,
              }}
            >
              {contextPretty}
            </pre>
          </>
        )}
      </div>

      <div className="card">
        {event.resolvedAt ? (
          <>
            <h3 style={{ marginTop: 0 }}>Opgelost</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              door {event.resolvedBy ?? "onbekend"} · {formatRelative(event.resolvedAt)}
              {event.resolvedNote ? ` — ${event.resolvedNote}` : ""}
            </p>
            <form action={reopenErrorAction}>
              <input type="hidden" name="id" value={event.id} />
              <button type="submit" className="btn btn-outline btn-sm">
                Heropenen
              </button>
            </form>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>Markeer als opgelost</h3>
            <form action={resolveErrorAction} style={{ display: "grid", gap: 8, maxWidth: 480 }}>
              <input type="hidden" name="id" value={event.id} />
              <textarea
                name="note"
                placeholder="Optionele notitie (wat was de oorzaak / fix?)"
                rows={3}
                className="input"
                style={{ resize: "vertical" }}
              />
              <div>
                <button type="submit" className="btn btn-primary btn-sm">
                  Oplossen
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </AdminShell>
  );
}
