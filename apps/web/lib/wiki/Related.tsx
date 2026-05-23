/**
 * "Gerelateerde artikelen"-blok onderaan een artikel.
 * Server-component; data komt uit getRelated() in nav.ts.
 */
import Link from "next/link";
import { CATEGORY_LABEL, type WikiArticleMeta } from "./articles";

export function Related({ items }: { items: WikiArticleMeta[] }) {
  if (!items.length) return null;
  return (
    <section
      aria-label="Gerelateerde artikelen"
      style={{ marginTop: 28 }}
    >
      <h2
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "var(--muted, #6b7280)",
          margin: "0 0 10px",
          fontWeight: 700,
        }}
      >
        Lees ook
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 8,
        }}
      >
        {items.map((a) => (
          <Link
            key={a.slug}
            href={`/wiki/${a.slug}`}
            style={{
              display: "block",
              padding: 12,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              textDecoration: "none",
              color: "var(--text)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                color: "var(--secondary, #3b82f6)",
                marginBottom: 4,
              }}
            >
              {CATEGORY_LABEL[a.category]}
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35 }}>
              {a.title}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted, #6b7280)",
                marginTop: 4,
                lineHeight: 1.45,
              }}
            >
              {a.summary}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--muted, #9ca3af)",
                marginTop: 6,
                fontFamily: "monospace",
              }}
            >
              {a.readMinutes} min
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
