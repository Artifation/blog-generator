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

/**
 * Body-text per slug. Wordt vanuit de server-page meegegeven aan WikiShell,
 * zodat de client-side fuzzy-search ook hit op de tekst-inhoud.
 */
export interface WikiShellSearchEntry {
  slug: string;
  text: string;
}

interface FilteredResult {
  article: WikiArticle;
  snippet?: string;
}

export function WikiShell({
  children,
  searchIndex,
}: {
  children: React.ReactNode;
  searchIndex?: WikiShellSearchEntry[];
}) {
  const pathname = usePathname() ?? "";
  const byCat = React.useMemo(() => articlesByCategory(), []);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Build a slug -> text map once for snippet lookup.
  const textBySlug = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const e of searchIndex ?? []) m.set(e.slug, e.text);
    return m;
  }, [searchIndex]);

  const filtered = React.useMemo<FilteredResult[] | null>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out: FilteredResult[] = [];
    for (const a of ARTICLES) {
      const titleHit = a.title.toLowerCase().includes(q);
      const summaryHit = a.summary.toLowerCase().includes(q);
      const text = textBySlug.get(a.slug);
      const bodyIdx = text ? text.indexOf(q) : -1;
      if (titleHit || summaryHit || bodyIdx >= 0) {
        out.push({
          article: a,
          snippet:
            !titleHit && !summaryHit && bodyIdx >= 0 && text
              ? buildSnippet(text, bodyIdx, q.length)
              : undefined,
        });
      }
    }
    return out;
  }, [query, textBySlug]);

  // Cmd/Ctrl+K focuses the search input.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="wiki-shell"
      style={{
        display: "grid",
        gridTemplateColumns: "260px minmax(0,1fr)",
        gap: 24,
        alignItems: "start",
      }}
    >
      <aside
        className="wiki-shell-sidebar"
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
        <div style={{ position: "relative", marginBottom: 12 }}>
          <input
            ref={inputRef}
            className="input"
            placeholder="Zoeken in wiki…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ fontSize: 13, paddingRight: 36 }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 10,
              color: "var(--muted, #9ca3af)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "1px 5px",
              fontFamily: "monospace",
              background: "var(--surface-2)",
              pointerEvents: "none",
            }}
          >
            ⌘K
          </span>
        </div>
        {filtered ? (
          <div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
              {filtered.length} resultaten
            </div>
            {filtered.map((r) => (
              <SidebarLink
                key={r.article.slug}
                article={r.article}
                active={pathname === `/wiki/${r.article.slug}`}
                snippet={r.snippet}
                query={query.trim()}
              />
            ))}
            {filtered.length === 0 && (
              <div
                className="muted"
                style={{ fontSize: 12, padding: "8px 4px" }}
              >
                Geen resultaten.
              </div>
            )}
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
                <SidebarLink
                  key={a.slug}
                  article={a}
                  active={pathname === `/wiki/${a.slug}`}
                />
              ))}
            </div>
          ))
        )}
      </aside>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function buildSnippet(text: string, idx: number, qLen: number): string {
  const radius = 40;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + qLen + radius);
  let s = text.slice(start, end);
  if (start > 0) s = "…" + s;
  if (end < text.length) s = s + "…";
  return s;
}

function SidebarLink({
  article,
  active,
  snippet,
  query,
}: {
  article: WikiArticle;
  active: boolean;
  snippet?: string;
  query?: string;
}) {
  return (
    <Link
      href={`/wiki/${article.slug}`}
      style={{
        display: "block",
        padding: snippet ? "6px 8px" : "5px 8px",
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
      <div>{article.title}</div>
      {snippet && (
        <div
          style={{
            fontSize: 10,
            color: "var(--muted, #6b7280)",
            marginTop: 2,
            lineHeight: 1.4,
            fontWeight: 400,
          }}
        >
          {highlightMatch(snippet, query ?? "")}
        </div>
      )}
    </Link>
  );
}

function highlightMatch(snippet: string, query: string): React.ReactNode {
  if (!query) return snippet;
  const lower = snippet.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return snippet;
  return (
    <>
      {snippet.slice(0, idx)}
      <mark
        style={{
          background: "rgba(59,130,246,0.18)",
          color: "inherit",
          padding: "0 2px",
          borderRadius: 2,
        }}
      >
        {snippet.slice(idx, idx + q.length)}
      </mark>
      {snippet.slice(idx + q.length)}
    </>
  );
}
