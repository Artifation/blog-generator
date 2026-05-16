import Link from "next/link";
import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite, listPublishedPostsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { formatRelative } from "~/lib/utils";
import { InternalLinkerButton } from "./internal-linker-button";

export const dynamic = "force-dynamic";

export default async function PublishedPage() {
  const site = await requireSite();
  const posts = await listPublishedPostsForSite(site.id);
  const pending = await listDraftsForSite(site.id, "pending_review");
  const topics = await listTopicsForSite(site.id);
  const builtInPosts = posts.filter((p) => !p.externalUrl);

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={topics.filter((t) => t.status === "queued").length}
      crumbs={[{ label: "Gepubliceerd" }]}
    >
      <div className="page-head">
        <div className="ph-text">
          <h1>Gepubliceerd</h1>
          <div className="ph-sub">Alles wat live staat, ongeacht destination.</div>
        </div>
        {builtInPosts.length >= 2 && (
          <div className="ph-actions">
            <InternalLinkerButton />
          </div>
        )}
      </div>

      {posts.length === 0 ? (
        <div className="empty">
          <h2>Nog niets gepubliceerd</h2>
          <p>Approveer drafts om ze hier te zien.</p>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {posts.map((p) => {
            const liveUrl = p.externalUrl ?? `/blog/${site.slug}/${p.slug}`;
            return (
              <Link
                key={p.id}
                href={p.externalUrl ? liveUrl : `/published/${p.id}`}
                target={p.externalUrl ? "_blank" : undefined}
                className="draft-card"
              >
                <div>
                  <h3>{p.title}</h3>
                  <p className="tldr">{p.tldr}</p>
                  <div className="dc-meta">
                    {p.pillarSlug && <span className="badge b-navy">{p.pillarSlug}</span>}
                    <span className="muted" style={{ fontSize: 12 }}>
                      Gepubliceerd {formatRelative(p.publishedAt)}
                    </span>
                    {p.externalUrl && <span className="badge b-blue">extern</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
