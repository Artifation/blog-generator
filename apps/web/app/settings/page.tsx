import { requireSite, getCurrentUser } from "~/lib/auth";
import { maskSiteForClient } from "~/lib/sites/mask";
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

  // Never hand decrypted secrets to client components — blank them and pass a
  // "present" map so the UI can show "•••• ingesteld" without the value.
  const { site: clientSite, secretsPresent } = maskSiteForClient(site);

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
        {tab === "brand" && <BrandTab site={clientSite} />}
        {tab === "publish" && <PublishTab site={clientSite} wpAppPasswordSet={secretsPresent.wpAppPassword} />}
        {tab === "integrations" && <IntegrationsTab site={clientSite} secretsPresent={secretsPresent} />}
        {tab === "team" && <TeamTab members={members} canManage={me?.role === "owner"} />}
        {tab === "danger" && <DangerTab site={clientSite} />}
      </SettingsShell>
    </AdminShell>
  );
}
