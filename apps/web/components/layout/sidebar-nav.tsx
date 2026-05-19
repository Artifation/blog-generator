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
} from "lucide-react";

interface SidebarNavProps {
  pendingDrafts: number;
  queuedTopics: number;
  siteSlug: string;
}

export function SidebarNav({ pendingDrafts, queuedTopics, siteSlug }: SidebarNavProps) {
  const pathname = usePathname() ?? "";
  const items = [
    { href: "/dashboard", icon: Home, label: "Overzicht" },
    { href: "/topics", icon: Layers, label: "Topics", badge: queuedTopics > 0 ? queuedTopics : null },
    { href: "/drafts", icon: Inbox, label: "Drafts", badge: pendingDrafts > 0 ? pendingDrafts : null },
    { href: "/published", icon: Send, label: "Gepubliceerd" },
    { href: "/audit", icon: ScanSearch, label: "Blog-audit" },
    { href: "/runs", icon: Activity, label: "Runs" },
    { href: "/costs", icon: Wallet, label: "Kosten" },
    { href: "/settings", icon: Settings, label: "Instellingen" },
  ];

  return (
    <nav className="sidebar-nav">
      {items.map(({ href, icon: Icon, label, badge }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`}>
            <Icon size={16} className="nav-icon" />
            <span className="nav-label">{label}</span>
            {badge != null && <span className="nav-badge">{badge}</span>}
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
