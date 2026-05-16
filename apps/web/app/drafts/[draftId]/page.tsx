import { notFound } from "next/navigation";
import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { getDraft, listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { DraftEditor } from "./draft-editor";

export const dynamic = "force-dynamic";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const site = await requireSite();
  const draft = await getDraft(draftId);
  if (!draft || draft.siteId !== site.id) notFound();

  const topics = await listTopicsForSite(site.id);
  const pending = await listDraftsForSite(site.id, "pending_review");

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={topics.filter((t) => t.status === "queued").length}
      crumbs={[
        { label: "Drafts", href: "/drafts" },
        { label: draft.title },
      ]}
    >
      <DraftEditor
        publishDestination={site.publishDestination}
        qualityThreshold={site.qualityThreshold}
        draft={{
          id: draft.id,
          title: draft.title,
          slug: draft.slug,
          contentHtml: draft.contentHtml,
          metaTitle: draft.metaTitle,
          metaDescription: draft.metaDescription,
          tldr: draft.tldr,
          status: draft.status,
          weightedTotal: draft.weightedTotal,
          rubricScores: draft.rubricScores ?? null,
          hardFails: draft.hardFails ?? [],
          imagePath: draft.imagePath,
        }}
      />
    </AdminShell>
  );
}
