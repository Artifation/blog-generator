import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { WikiShell } from "../wiki-shell";
import { ARTICLE_BY_SLUG, CATEGORY_LABEL } from "~/lib/wiki/articles";

export const dynamic = "force-dynamic";

export default async function WikiArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = ARTICLE_BY_SLUG[slug];
  if (!article) notFound();

  const site = await requireSite();
  const pendingDrafts = await listDraftsForSite(site.id, "pending_review");
  const topics = await listTopicsForSite(site.id);
  const queued = topics.filter((t) => t.status === "queued").length;

  return (
    <AdminShell
      site={site}
      pendingDrafts={pendingDrafts.length}
      queuedTopics={queued}
      crumbs={[
        { label: "Wiki", href: "/wiki" },
        { label: article.title },
      ]}
    >
      <WikiShell>
        <div>
          <div
            className="muted"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 8,
            }}
          >
            <Link
              href="/wiki"
              style={{
                color: "inherit",
                textDecoration: "none",
                display: "inline-flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              <ArrowLeft size={11} /> {CATEGORY_LABEL[article.category]}
            </Link>
            {" · "}
            {article.readMinutes} min lezen
          </div>
          {article.body}
        </div>
      </WikiShell>
    </AdminShell>
  );
}
