"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Layers,
  Inbox,
  Send,
  Activity,
  Settings,
  Globe,
  ExternalLink,
  Wallet,
  ScanSearch,
  BookOpen,
  Wand2,
  AlertTriangle,
} from "lucide-react";

interface SidebarNavProps {
  pendingDrafts: number;
  queuedTopics: number;
  siteSlug: string;
  /** Aantal unresolved errors. >0 toont een rode badge bij "Errors". */
  unresolvedErrors?: number;
}

type NavItem = {
  href: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  label: string;
  badge?: number | null;
  badgeVariant?: "default" | "danger";
};

export function SidebarNav({
  pendingDrafts,
  queuedTopics,
  siteSlug,
  unresolvedErrors = 0,
}: SidebarNavProps) {
  const pathname = usePathname() ?? "";
  const items: NavItem[] = [
    { href: "/dashboard", icon: Home, label: "Overzicht" },
    { href: "/topics", icon: Layers, label: "Topics", badge: queuedTopics > 0 ? queuedTopics : null },
    { href: "/drafts", icon: Inbox, label: "Drafts", badge: pendingDrafts > 0 ? pendingDrafts : null },
    { href: "/published", icon: Send, label: "Gepubliceerd" },
    { href: "/refreshes", icon: Wand2, label: "Refreshes" },
    { href: "/audit", icon: ScanSearch, label: "Blog-audit" },
    { href: "/runs", icon: Activity, label: "Runs" },
    {
      href: "/errors",
      icon: AlertTriangle,
      label: "Errors",
      badge: unresolvedErrors > 0 ? unresolvedErrors : null,
      badgeVariant: "danger",
    },
    { href: "/costs", icon: Wallet, label: "Kosten" },
    { href: "/wiki", icon: BookOpen, label: "Wiki" },
    { href: "/settings", icon: Settings, label: "Instellingen" },
  ];

  return (
    <nav className="sidebar-nav">
      {items.map(({ href, icon: Icon, label, badge, badgeVariant }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        const badgeClass =
          badgeVariant === "danger" ? "nav-badge nav-badge-danger" : "nav-badge";
        return (
          <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`}>
            <Icon size={16} className="nav-icon" />
            <span className="nav-label">{label}</span>
            {badge != null && <span className={badgeClass}>{badge}</span>}
          </Link>
        );
      })}

      <div className="nav-section-label">Publieke blog</div>
      <Link href={`/blog/${siteSlug}`} target="_blank" className="nav-item">
        <Globe size={16} className="nav-icon" />
        <span className="nav-label">Bekijk live blog</span>
        <ExternalLink size={12} />
      </Link>
    </nav>
  );
}
