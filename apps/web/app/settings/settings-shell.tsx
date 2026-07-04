"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TabKey } from "./tab-types";

const TABS: Array<{ key: TabKey; label: string; danger?: boolean }> = [
  { key: "brand", label: "Brand" },
  { key: "publish", label: "Publiceren" },
  { key: "integrations", label: "Integraties" },
  { key: "team", label: "Team" },
  { key: "danger", label: "Gevaar", danger: true },
];

export function SettingsShell({
  activeTab,
  children,
}: {
  activeTab: TabKey;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <>
      <div className="page-head">
        <div className="ph-text">
          <h1>Instellingen</h1>
          <div className="ph-sub">
            Brand, pillars, integraties en team. Wijzigingen worden automatisch opgeslagen.
          </div>
        </div>
      </div>
      <div
        style={{
          position: "sticky",
          top: 64,
          zIndex: 3,
          background: "var(--surface, #fff)",
          borderBottom: "1px solid var(--border)",
          marginBottom: 14,
        }}
      >
        <div className="topics-filters" role="tablist" aria-label="Settings tabs">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`${pathname}?tab=${t.key}`}
              role="tab"
              aria-selected={activeTab === t.key}
              className={`tfilter${activeTab === t.key ? " active" : ""}`}
              style={t.danger ? { color: "#b91c1c" } : undefined}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      <div>{children}</div>
    </>
  );
}
