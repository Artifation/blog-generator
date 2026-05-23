import Link from "next/link";
import { LogoMark } from "~/components/brand/logo-mark";
import { AccountMenu } from "./account-menu";
import { SidebarNav } from "./sidebar-nav";
import { TopbarSearch } from "./topbar-search";
import type { Site } from "~/lib/db/schema";
import { Bell, ExternalLink } from "lucide-react";

interface AdminShellProps {
  site: Site;
  pendingDrafts: number;
  queuedTopics: number;
  /** Optioneel — als gezet en >0, toont sidebar een rode badge bij "Errors". */
  unresolvedErrors?: number;
  crumbs: Array<{ label: string; href?: string }>;
  topActions?: React.ReactNode;
  children: React.ReactNode;
}

export function AdminShell({
  site,
  pendingDrafts,
  queuedTopics,
  unresolvedErrors,
  crumbs,
  topActions,
  children,
}: AdminShellProps) {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo-mark">
            <LogoMark size={26} />
          </div>
          <div className="brand-name">
            Artifation{" "}
            <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.5)" }}>Blog</span>
          </div>
        </div>

        <Link href={`/blog/${site.slug}`} target="_blank" className="sidebar-site">
          <div className="site-avatar">{site.name[0]}</div>
          <div className="site-meta">
            <div className="site-name">{site.name}</div>
            <div className="site-domain">{site.domain}</div>
          </div>
          <ExternalLink size={12} style={{ opacity: 0.5 }} />
        </Link>

        <SidebarNav
          pendingDrafts={pendingDrafts}
          queuedTopics={queuedTopics}
          siteSlug={site.slug}
          unresolvedErrors={unresolvedErrors ?? 0}
        />

        <AccountMenu
          name={(site.author as { name?: string })?.name ?? "Account"}
          email={`${(site.author as { name?: string })?.name?.split(" ")[0]?.toLowerCase() ?? "user"}@${site.domain}`}
        />
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumb">
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <span className="sep">›</span>}
                {c.href && i < crumbs.length - 1 ? (
                  <Link href={c.href} style={{ cursor: "pointer" }}>{c.label}</Link>
                ) : (
                  <span className={i === crumbs.length - 1 ? "current" : ""}>{c.label}</span>
                )}
              </span>
            ))}
          </div>
          <div className="topbar-actions">
            {topActions}
            <TopbarSearch />
            <button className="icon-btn" aria-label="Notificaties">
              <Bell size={16} />
            </button>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
