import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listTopicsForSite } from "~/lib/topics";
import { listDraftsForSite } from "~/lib/drafts";
import { AuditForm } from "./audit-form";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const site = await requireSite();
  const pendingDrafts = await listDraftsForSite(site.id, "pending_review");
  const topics = await listTopicsForSite(site.id);
  const queued = topics.filter((t) => t.status === "queued").length;

  return (
    <AdminShell
      site={site}
      pendingDrafts={pendingDrafts.length}
      queuedTopics={queued}
      crumbs={[{ label: "Blog-audit" }]}
    >
      <AuditForm
        brandVoice={site.brandVoice}
        banList={site.banList}
      />
    </AdminShell>
  );
}
