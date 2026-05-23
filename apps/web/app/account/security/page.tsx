import { requireSite, requireUser } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { hasCredential } from "~/lib/auth/credentials";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const site = await requireSite();
  const me = await requireUser();
  const pending = await listDraftsForSite(site.id, "pending_review");
  const topics = await listTopicsForSite(site.id);
  const hasPassword = await hasCredential(me.id);

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={topics.filter((t) => t.status === "queued").length}
      crumbs={[{ label: "Account", href: "/account" }, { label: "Beveiliging" }]}
    >
      <div className="page-head">
        <div className="ph-text">
          <h1>Beveiliging</h1>
          <div className="ph-sub">
            {hasPassword
              ? "Wijzig je wachtwoord. Invitecodes werken niet meer om in te loggen."
              : "Stel een wachtwoord in om je account te beschermen. Daarna kun je niet meer met een invitecode inloggen."}
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="card-header">
          <h3>{hasPassword ? "Wachtwoord wijzigen" : "Wachtwoord instellen"}</h3>
        </div>
        <div className="card-body">
          <PasswordForm hasPassword={hasPassword} />
        </div>
      </div>
    </AdminShell>
  );
}
