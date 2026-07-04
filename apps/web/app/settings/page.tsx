import { requireSite, getCurrentUser } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { listUsersForSite } from "~/lib/users";
import { SettingsShell } from "./settings-shell";
import { parseTab, type TabKey } from "./tab-types";
import { BrandTab } from "./tabs/brand-tab";
import { PublishTab } from "./tabs/publish-tab";
import { IntegrationsTab } from "./tabs/integrations-tab";
import { TeamTab } from "./tabs/team-tab";
import { DangerTab } from "./tabs/danger-tab";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const site = await requireSite();
  const me = await getCurrentUser();
  const sp = await searchParams;
  const tab: TabKey = parseTab(sp.tab);

  const [pending, topics, users] = await Promise.all([
    listDraftsForSite(site.id, "pending_review"),
    listTopicsForSite(site.id, "queued"),
    listUsersForSite(site.id),
  ]);
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
      queuedTopics={topics.length}
      crumbs={[{ label: "Instellingen" }]}
    >
      <SettingsShell activeTab={tab}>
        {tab === "brand" && <BrandTab site={site} />}
        {tab === "publish" && <PublishTab site={site} />}
        {tab === "integrations" && <IntegrationsTab site={site} />}
        {tab === "team" && <TeamTab members={members} />}
        {tab === "danger" && <DangerTab site={site} />}
      </SettingsShell>
    </AdminShell>
  );
}
