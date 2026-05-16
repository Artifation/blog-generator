import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { getDb, ensureSchema } from "~/lib/db/client";
import { publishedPosts } from "~/lib/db/schema";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { formatRelative } from "~/lib/utils";
import { RepurposePanel } from "./repurpose-panel";

export const dynamic = "force-dynamic";

export default async function PublishedPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const site = await requireSite();
  await ensureSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(publishedPosts)
    .where(and(eq(publishedPosts.id, postId), eq(publishedPosts.siteId, site.id)))
    .limit(1);
  const post = rows[0];
  if (!post) notFound();

  const pending = await listDraftsForSite(site.id, "pending_review");
  const topics = await listTopicsForSite(site.id);

  const viewUrl = post.externalUrl ?? `/blog/${site.slug}/${post.slug}`;

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={topics.filter((t) => t.status === "queued").length}
      crumbs={[
        { label: "Gepubliceerd", href: "/published" },
        { label: post.title },
      ]}
    >
      <div className="page-head">
        <div className="ph-text">
          <h1>{post.title}</h1>
          <div className="ph-sub">
            Gepubliceerd {formatRelative(post.publishedAt)} · /{post.slug}
          </div>
        </div>
        <div className="ph-actions">
          <Link
            href={viewUrl}
            target="_blank"
            className="btn btn-outline"
          >
            Bekijk live ↗
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
        <div className="card">
          <div className="card-header">
            <h3>Inhoud</h3>
          </div>
          <div className="card-body">
            <article className="prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
          </div>
        </div>

        <RepurposePanel
          postId={post.id}
          repurposed={post.repurposed ?? null}
        />
      </div>
    </AdminShell>
  );
}
