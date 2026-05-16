import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listTopicsForSite } from "~/lib/topics";
import { listDraftsForSite } from "~/lib/drafts";
import { TopicsKanban } from "./topics-kanban";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const site = await requireSite();
  const topics = await listTopicsForSite(site.id);
  const pendingDrafts = await listDraftsForSite(site.id, "pending_review");
  const queued = topics.filter((t) => t.status === "queued").length;

  return (
    <AdminShell
      site={site}
      pendingDrafts={pendingDrafts.length}
      queuedTopics={queued}
      crumbs={[{ label: "Topics" }]}
    >
      <TopicsKanban
        siteSlug={site.slug}
        pillars={site.pillars.map((p) => ({ slug: p.slug, name: p.name }))}
        topics={topics.map((t) => ({
          id: t.id,
          title: t.title,
          targetKeyword: t.targetKeyword,
          pillarSlug: t.pillarSlug,
          intent: t.intent,
          status: t.status,
          intendedWordCount: t.intendedWordCount,
          priority: t.priority,
          rejectReason: t.rejectReason,
          publishedUrl: t.publishedUrl,
        }))}
      />
    </AdminShell>
  );
}
