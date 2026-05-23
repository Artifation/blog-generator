"use client";

/**
 * AutoToc — leest na mount alle h2/h3 binnen de meegegeven container
 * (`.wiki-body`), zorgt voor stabiele id's, en rendert een scroll-spy
 * inhoudsopgave. Werkt zonder dat de artikelen zelf iets hoeven aan te leveren.
 *
 * - Op brede schermen (≥ 1400px) toont de wrapper-layout dit component als
 *   sticky kolom rechts naast het artikel.
 * - Op kleinere schermen rendert hetzelfde component als collapsible
 *   <details> boven het artikel.
 *
 * Bonus: kopiëren van section-link bij klik op een heading (met visuele
 * indicatie). Slugify behoudt bestaande id's (zoals in de blueprint) en
 * genereert er een voor de rest.
 */
import * as React from "react";

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function AutoToc({
  containerSelector = ".wiki-body",
  /** "side" = sticky kolom; "inline" = collapsible bovenaan. */
  variant = "side",
}: {
  containerSelector?: string;
  variant?: "side" | "inline";
}) {
  const [items, setItems] = React.useState<TocItem[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Walk headings on mount: stable IDs + collect TOC + bind click-to-copy.
  // Multiple AutoToc instances (inline + side variant) point to the same
  // container. The first to mount becomes "primary": it assigns IDs, adds
  // the click-to-copy listener, and sets a data-marker. Secondary instances
  // just read the already-assigned IDs.
  React.useEffect(() => {
    const root = document.querySelector(containerSelector);
    if (!root) return;
    const isPrimary = !root.hasAttribute("data-wiki-toc-active");
    if (isPrimary) root.setAttribute("data-wiki-toc-active", "1");

    const heads = Array.from(root.querySelectorAll<HTMLElement>("h2, h3"));
    if (isPrimary) {
      const seen = new Set<string>();
      for (const h of heads) {
        const text = (h.textContent || "").trim();
        if (!text) continue;
        let id = h.id || slugify(text);
        let n = 2;
        while (seen.has(id)) id = `${slugify(text)}-${n++}`;
        seen.add(id);
        if (!h.id) h.id = id;
        h.classList.add("wiki-heading-link");
        h.setAttribute("data-anchor", id);
      }
    }
    const collected: TocItem[] = heads
      .map((h) => {
        const id = h.id || h.getAttribute("data-anchor");
        const text = (h.textContent || "").trim();
        if (!id || !text) return null;
        return { id, text, level: (h.tagName === "H2" ? 2 : 3) as 2 | 3 };
      })
      .filter((x): x is TocItem => Boolean(x));
    setItems(collected);

    if (!isPrimary) return;

    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      const h = t.closest<HTMLElement>("h2[data-anchor], h3[data-anchor]");
      if (!h) return;
      const id = h.getAttribute("data-anchor");
      if (!id) return;
      const url = `${location.origin}${location.pathname}#${id}`;
      history.replaceState(null, "", `#${id}`);
      navigator.clipboard?.writeText(url).catch(() => {});
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1200);
    }
    root.addEventListener("click", onClick as EventListener);
    return () => {
      root.removeEventListener("click", onClick as EventListener);
      root.removeAttribute("data-wiki-toc-active");
    };
  }, [containerSelector]);

  // Scroll-spy: track the heading currently nearest the top viewport line.
  React.useEffect(() => {
    if (!items.length) return;
    const els = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!els.length) return;

    function compute() {
      const offset = 120; // sticky header etc.
      let current: string | null = els[0]?.id ?? null;
      for (const el of els) {
        const top = el.getBoundingClientRect().top;
        if (top - offset <= 0) current = el.id;
        else break;
      }
      setActiveId(current);
    }
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [items]);

  // Copy-confirmation flash (sync with which heading was clicked).
  React.useEffect(() => {
    if (!copiedId) return;
    const el = document.getElementById(copiedId);
    if (!el) return;
    el.setAttribute("data-copied", "1");
    const t = setTimeout(() => el.removeAttribute("data-copied"), 1200);
    return () => clearTimeout(t);
  }, [copiedId]);

  if (items.length < 2) return null;

  if (variant === "inline") {
    return (
      <details
        className="wiki-toc-inline"
        style={{
          margin: "0 0 18px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 12px",
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            color: "var(--muted, #6b7280)",
            padding: "4px 0",
          }}
        >
          Inhoudsopgave ({items.length})
        </summary>
        <ol style={tocList}>
          {items.map((it) => (
            <li key={it.id} style={{ paddingLeft: it.level === 3 ? 14 : 0 }}>
              <a
                href={`#${it.id}`}
                style={{
                  ...tocLinkStyle,
                  color:
                    activeId === it.id
                      ? "var(--secondary, #3b82f6)"
                      : "var(--text)",
                  fontWeight: activeId === it.id ? 600 : 400,
                }}
              >
                {it.text}
              </a>
            </li>
          ))}
        </ol>
      </details>
    );
  }

  // variant === "side"
  return (
    <aside
      className="wiki-toc-side"
      aria-label="Op deze pagina"
      style={{
        position: "sticky",
        top: 16,
        maxHeight: "calc(100vh - 80px)",
        overflowY: "auto",
        padding: "12px 14px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "var(--muted, #6b7280)",
          marginBottom: 8,
        }}
      >
        Op deze pagina
      </div>
      <ol style={{ ...tocList, margin: 0 }}>
        {items.map((it) => (
          <li
            key={it.id}
            style={{
              paddingLeft: it.level === 3 ? 12 : 0,
              borderLeft:
                activeId === it.id
                  ? "2px solid var(--secondary, #3b82f6)"
                  : "2px solid transparent",
              marginLeft: -8,
            }}
          >
            <a
              href={`#${it.id}`}
              style={{
                ...tocLinkStyle,
                paddingLeft: 8,
                color:
                  activeId === it.id
                    ? "var(--secondary, #3b82f6)"
                    : "var(--text)",
                fontWeight: activeId === it.id ? 600 : 400,
              }}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ol>
    </aside>
  );
}

const tocList: React.CSSProperties = {
  listStyle: "none",
  margin: "6px 0 0",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  lineHeight: 1.4,
};

const tocLinkStyle: React.CSSProperties = {
  display: "block",
  padding: "3px 4px",
  borderRadius: 4,
  textDecoration: "none",
  transition: "color .12s",
};
