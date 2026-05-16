import { requireSite, getCurrentUser } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { listUsersForSite } from "~/lib/users";
import { SettingsForm } from "./settings-form";
import { TeamSection } from "./team-section";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const site = await requireSite();
  const me = await getCurrentUser();
  const pending = await listDraftsForSite(site.id, "pending_review");
  const topics = await listTopicsForSite(site.id);
  const users = await listUsersForSite(site.id);
  const members = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    invitedAt: u.invitedAt,
    lastLoginAt: u.lastLoginAt,
    isMe: me?.id === u.id,
  }));

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={topics.filter((t) => t.status === "queued").length}
      crumbs={[{ label: "Instellingen" }]}
    >
      <SettingsForm
        site={{
          id: site.id,
          slug: site.slug,
          name: site.name,
          domain: site.domain,
          language: site.language,
          brandVoice: site.brandVoice,
          banList: site.banList,
          signaturePhrases: site.signaturePhrases,
          qualityThreshold: site.qualityThreshold,
          maxPostsPerWeek: site.maxPostsPerWeek,
          scheduleCron: site.scheduleCron,
          publishDestination: site.publishDestination,
          wordpressConfig: site.wordpressConfig,
          author: site.author,
          apiKeys: site.apiKeys,
          pillars: site.pillars.map((p) => ({ slug: p.slug, name: p.name, weight: p.weight })),
        }}
        teamSection={<TeamSection members={members} />}
      />
    </AdminShell>
  );
}
