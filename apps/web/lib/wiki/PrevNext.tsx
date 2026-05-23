/**
 * Onderaan een artikel: vorige / volgende kaart op basis van flatArticleOrder.
 * Server-component (pure links).
 */
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CATEGORY_LABEL, type WikiArticleMeta } from "./articles";

export function PrevNext({
  prev,
  next,
}: {
  prev: WikiArticleMeta | null;
  next: WikiArticleMeta | null;
}) {
  if (!prev && !next) return null;
  return (
    <nav
      aria-label="Vorige en volgende artikel"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        marginTop: 32,
        paddingTop: 18,
        borderTop: "1px solid var(--border)",
      }}
    >
      {prev ? (
        <PrevNextCard dir="prev" article={prev} />
      ) : (
        <div />
      )}
      {next ? (
        <PrevNextCard dir="next" article={next} />
      ) : (
        <div />
      )}
    </nav>
  );
}

function PrevNextCard({
  dir,
  article,
}: {
  dir: "prev" | "next";
  article: WikiArticleMeta;
}) {
  const align = dir === "next" ? "right" : "left";
  return (
    <Link
      href={`/wiki/${article.slug}`}
      style={{
        display: "block",
        padding: "12px 14px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        textDecoration: "none",
        color: "var(--text)",
        textAlign: align as React.CSSProperties["textAlign"],
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          justifyContent: dir === "next" ? "flex-end" : "flex-start",
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "var(--muted, #6b7280)",
          marginBottom: 4,
        }}
      >
        {dir === "prev" && <ArrowLeft size={11} />}
        {dir === "prev" ? "Vorige" : "Volgende"}
        {dir === "next" && <ArrowRight size={11} />}
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>
        {article.title}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--muted, #9ca3af)",
          marginTop: 2,
        }}
      >
        {CATEGORY_LABEL[article.category]}
      </div>
    </Link>
  );
}
