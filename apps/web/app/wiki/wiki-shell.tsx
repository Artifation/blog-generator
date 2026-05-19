"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ARTICLES,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  articlesByCategory,
  type WikiArticle,
} from "~/lib/wiki/articles";

export function WikiShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const byCat = React.useMemo(() => articlesByCategory(), []);
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo<WikiArticle[] | null>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        gap: 24,
        alignItems: "start",
      }}
    >
      <aside
        style={{
          position: "sticky",
          top: 16,
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
          padding: 12,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
        }}
      >
        <input
          className="input"
          placeholder="Zoeken in wiki…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 12, fontSize: 13 }}
        />
        {filtered ? (
          <div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
              {filtered.length} resultaten
            </div>
            {filtered.map((a) => (
              <SidebarLink key={a.slug} article={a} active={pathname === `/wiki/${a.slug}`} />
            ))}
          </div>
        ) : (
          CATEGORY_ORDER.map((cat) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  color: "var(--muted, #6b7280)",
                  marginBottom: 4,
                }}
              >
                {CATEGORY_LABEL[cat]}
              </div>
              {byCat[cat].map((a) => (
                <SidebarLink key={a.slug} article={a} active={pathname === `/wiki/${a.slug}`} />
              ))}
            </div>
          ))
        )}
      </aside>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function SidebarLink({ article, active }: { article: WikiArticle; active: boolean }) {
  return (
    <Link
      href={`/wiki/${article.slug}`}
      style={{
        display: "block",
        padding: "5px 8px",
        margin: "1px 0",
        borderRadius: 4,
        fontSize: 12,
        textDecoration: "none",
        color: active ? "var(--secondary, #3b82f6)" : "var(--text)",
        background: active ? "rgba(59,130,246,0.08)" : "transparent",
        fontWeight: active ? 600 : 400,
        lineHeight: 1.4,
      }}
    >
      {article.title}
    </Link>
  );
}
