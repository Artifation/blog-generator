import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, CalendarDays } from "lucide-react";
import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { WikiShell } from "../wiki-shell";
import {
  ARTICLE_BY_SLUG,
  CATEGORY_LABEL,
  WIKI_DEFAULT_UPDATED,
} from "~/lib/wiki/articles";
import { AutoToc } from "~/lib/wiki/AutoToc";
import { ReadingProgress } from "~/lib/wiki/ReadingProgress";
import { PrevNext } from "~/lib/wiki/PrevNext";
import { Related } from "~/lib/wiki/Related";
import { getPrevNext, getRelated } from "~/lib/wiki/nav";
import { getWikiSearchIndex } from "~/lib/wiki/search-index";

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

  const { prev, next } = getPrevNext(slug);
  const related = getRelated(slug, 3);
  const searchIndex = getWikiSearchIndex().map((e) => ({
    slug: e.slug,
    text: e.text,
  }));

  return (
    <AdminShell
      site={site}
      pendingDrafts={pendingDrafts.length}
      queuedTopics={queued}
      crumbs={[
        { label: "Wiki", href: "/wiki" },
        { label: CATEGORY_LABEL[article.category], href: "/wiki" },
        { label: article.title },
      ]}
    >
      <ReadingProgress />
      <WikiShell searchIndex={searchIndex}>
        <div className="wiki-article-layout">
          <div style={{ minWidth: 0 }}>
            <div
              className="muted"
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 8,
                flexWrap: "wrap",
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
              <span
                aria-hidden
                style={{ opacity: 0.5 }}
              >
                ·
              </span>
              <span
                style={{
                  display: "inline-flex",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                <Clock size={11} /> {article.readMinutes} min lezen
              </span>
              <span aria-hidden style={{ opacity: 0.5 }}>
                ·
              </span>
              <span
                style={{
                  display: "inline-flex",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                <CalendarDays size={11} />
                Bijgewerkt {article.updated ?? WIKI_DEFAULT_UPDATED}
              </span>
            </div>
            <AutoToc variant="inline" />
            {article.body}
            <PrevNext prev={prev} next={next} />
            <Related items={related} />
          </div>
          <AutoToc variant="side" />
        </div>
      </WikiShell>
    </AdminShell>
  );
}
