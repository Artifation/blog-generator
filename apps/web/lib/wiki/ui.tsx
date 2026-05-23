/**
 * Shared building blocks for wiki articles. Keep them visually consistent
 * so users can predict where to find what across all articles:
 *
 *  - <Callout>      info / tip / warning / success boxes
 *  - <Definition>   inline term-defs in the running text
 *  - <Steps>+<Step> "do this then this" walkthroughs
 *  - <Codeblock>    monospace examples
 *  - <Bullet>       clean bullet lists with extra spacing
 *  - <Glossary>+<GlossaryEntry> the term-reference page
 *
 *  Extended (factual / visual):
 *  - <SpecTable>    rigid "label / value / why" spec tables
 *  - <StatGrid>+<Stat>   big-number cards at the top of an article
 *  - <Checklist>+<Check> checkbox lists with optional sub-text
 *  - <Compare>+<Pane>    side-by-side good vs bad
 *  - <KeyValue>          one-line "label : value" rows
 *  - <Pill>              small coloured badge
 *  - <Quote>             pull-quote / rule emphasis
 *  - <Toc>               anchor-based table of contents
 *  - <HeroNumber>        single big number with subtitle
 */
import * as React from "react";

export function Callout({
  type = "info",
  title,
  children,
}: {
  type?: "info" | "tip" | "warning" | "success";
  title?: string;
  children: React.ReactNode;
}) {
  const palette: Record<typeof type, { bg: string; border: string; icon: string }> = {
    info: { bg: "rgba(59,130,246,0.06)", border: "rgba(59,130,246,0.3)", icon: "ℹ️" },
    tip: { bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.3)", icon: "💡" },
    warning: { bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.35)", icon: "⚠" },
    success: { bg: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.3)", icon: "✓" },
  };
  const p = palette[type];
  return (
    <div
      style={{
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 8,
        padding: 12,
        margin: "12px 0",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: title ? 4 : 0 }}>
        {p.icon} {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function Definition({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <span>
      <strong>{term}</strong>{" "}
      <span style={{ color: "var(--muted, #6b7280)" }}>—</span> {children}
    </span>
  );
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol style={{ paddingLeft: 0, listStyle: "none", margin: "10px 0" }}>{children}</ol>;
}

export function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          display: "grid",
          placeItems: "center",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--secondary, #3b82f6)",
        }}
      >
        {n}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted, #6b7280)" }}>
          {children}
        </div>
      </div>
    </li>
  );
}

export function Codeblock({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: 12,
        fontSize: 11,
        fontFamily: "monospace",
        lineHeight: 1.5,
        overflowX: "auto",
        margin: "10px 0",
      }}
    >
      <code>{children}</code>
    </pre>
  );
}

export function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ paddingLeft: 20, margin: "8px 0", lineHeight: 1.7, fontSize: 14 }}>
      {children}
    </ul>
  );
}

export function Glossary({ children }: { children: React.ReactNode }) {
  return <dl style={{ margin: "10px 0" }}>{children}</dl>;
}

export function GlossaryEntry({
  term,
  short,
  children,
}: {
  term: string;
  short?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "12px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <dt
        style={{
          fontWeight: 700,
          fontSize: 15,
          marginBottom: 2,
          color: "var(--primary)",
        }}
        id={`term-${term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      >
        {term}
        {short && (
          <span
            style={{
              marginLeft: 8,
              fontWeight: 400,
              fontSize: 11,
              color: "var(--muted, #6b7280)",
              fontStyle: "italic",
            }}
          >
            ({short})
          </span>
        )}
      </dt>
      <dd
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--muted, #4b5563)",
        }}
      >
        {children}
      </dd>
    </div>
  );
}

/** Standardised article wrapper: title + intro + content. */
export function Article({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <article style={{ maxWidth: 760 }}>
      <h1 style={{ marginBottom: 6, fontSize: 28 }}>{title}</h1>
      {intro && (
        <p
          className="muted"
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            marginTop: 0,
            marginBottom: 24,
            color: "var(--muted, #6b7280)",
          }}
        >
          {intro}
        </p>
      )}
      <div className="wiki-body" style={{ fontSize: 14, lineHeight: 1.7 }}>
        {children}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Factual / numeric building blocks
// ---------------------------------------------------------------------------

/**
 * Rigid spec table: 3 columns — label / value / why.
 * Used for "exact numbers" pages where each row is a non-negotiable target.
 */
export function SpecTable({
  rows,
  caption,
}: {
  rows: Array<{ label: React.ReactNode; value: React.ReactNode; why?: React.ReactNode }>;
  caption?: string;
}) {
  return (
    <div style={{ margin: "14px 0" }}>
      {caption && (
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            color: "var(--muted, #6b7280)",
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          {caption}
        </div>
      )}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--surface)",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  color: "var(--muted, #6b7280)",
                  width: "32%",
                }}
              >
                Onderdeel
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  color: "var(--muted, #6b7280)",
                  width: "28%",
                }}
              >
                Target
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  color: "var(--muted, #6b7280)",
                }}
              >
                Waarom
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                style={{
                  borderTop: "1px solid var(--border)",
                }}
              >
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>{row.label}</td>
                <td
                  style={{
                    padding: "10px 12px",
                    fontFamily: "monospace",
                    fontSize: 12,
                    color: "var(--secondary, #3b82f6)",
                    fontWeight: 600,
                  }}
                >
                  {row.value}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    color: "var(--muted, #6b7280)",
                    fontSize: 12,
                  }}
                >
                  {row.why}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Grid of stat cards — useful at the top of factual articles. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: 8,
        margin: "12px 0 18px",
      }}
    >
      {children}
    </div>
  );
}

export function Stat({
  value,
  label,
  hint,
  tone = "primary",
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "muted";
}) {
  const tones: Record<typeof tone, string> = {
    primary: "var(--secondary, #3b82f6)",
    success: "var(--success, #10b981)",
    warning: "var(--warning, #f59e0b)",
    muted: "var(--muted, #6b7280)",
  };
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: tones[tone],
          lineHeight: 1.1,
          fontFamily: "monospace",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--text)",
          marginTop: 6,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: "var(--muted, #6b7280)",
            marginTop: 3,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

/** Single hero-number block, e.g. "1500-2500 woorden". */
export function HeroNumber({
  value,
  label,
  sub,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(99,102,241,0.05))",
        border: "1px solid rgba(59,130,246,0.25)",
        borderRadius: 12,
        padding: 18,
        margin: "12px 0",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: "var(--secondary, #3b82f6)",
          fontFamily: "monospace",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          marginTop: 6,
          color: "var(--text)",
        }}
      >
        {label}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 12,
            color: "var(--muted, #6b7280)",
            marginTop: 4,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/** Checkbox-style list. Each <Check> is a row with an inline check icon. */
export function Checklist({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: "10px 0",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export function Check({
  title,
  children,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "24px 1fr",
        gap: 10,
        padding: "10px 14px",
        borderTop: "1px solid var(--border)",
        fontSize: 13,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: "1.5px solid var(--secondary, #3b82f6)",
          marginTop: 2,
          display: "grid",
          placeItems: "center",
          color: "var(--secondary, #3b82f6)",
          fontSize: 11,
          fontWeight: 700,
        }}
        aria-hidden
      >
        ✓
      </div>
      <div>
        <div style={{ fontWeight: 600, lineHeight: 1.4 }}>{title}</div>
        {children && (
          <div
            style={{
              fontSize: 12,
              color: "var(--muted, #6b7280)",
              marginTop: 3,
              lineHeight: 1.5,
            }}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/** Side-by-side comparison: good vs bad / before vs after / option A vs B. */
export function Compare({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        margin: "12px 0",
      }}
    >
      {children}
    </div>
  );
}

export function ComparePane({
  tone = "neutral",
  label,
  children,
}: {
  tone?: "good" | "bad" | "neutral";
  label?: React.ReactNode;
  children: React.ReactNode;
}) {
  const palette: Record<typeof tone, { bg: string; border: string; tag: string; tagBg: string }> = {
    good: {
      bg: "rgba(16,185,129,0.05)",
      border: "rgba(16,185,129,0.25)",
      tag: "var(--success, #10b981)",
      tagBg: "rgba(16,185,129,0.12)",
    },
    bad: {
      bg: "rgba(239,68,68,0.05)",
      border: "rgba(239,68,68,0.25)",
      tag: "var(--danger, #ef4444)",
      tagBg: "rgba(239,68,68,0.12)",
    },
    neutral: {
      bg: "var(--surface-2)",
      border: "var(--border)",
      tag: "var(--muted, #6b7280)",
      tagBg: "var(--surface-3, #f3f4f6)",
    },
  };
  const p = palette[tone];
  return (
    <div
      style={{
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 8,
        padding: 12,
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      {label && (
        <div
          style={{
            display: "inline-block",
            background: p.tagBg,
            color: p.tag,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            padding: "2px 6px",
            borderRadius: 4,
            marginBottom: 8,
          }}
        >
          {label}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

/** One-line "label : value" rows — useful for compact specs. */
export function KeyValue({
  rows,
}: {
  rows: Array<{ k: React.ReactNode; v: React.ReactNode }>;
}) {
  return (
    <div
      style={{
        margin: "10px 0",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 12,
            padding: "8px 14px",
            borderTop: i === 0 ? "none" : "1px solid var(--border)",
            fontSize: 13,
          }}
        >
          <div style={{ color: "var(--muted, #6b7280)", fontWeight: 500 }}>{r.k}</div>
          <div style={{ fontWeight: 600 }}>{r.v}</div>
        </div>
      ))}
    </div>
  );
}

export function Pill({
  children,
  tone = "primary",
}: {
  children: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "danger" | "muted";
}) {
  const palette: Record<typeof tone, { bg: string; fg: string }> = {
    primary: { bg: "rgba(59,130,246,0.12)", fg: "var(--secondary, #3b82f6)" },
    success: { bg: "rgba(16,185,129,0.12)", fg: "var(--success, #10b981)" },
    warning: { bg: "rgba(245,158,11,0.14)", fg: "var(--warning, #d97706)" },
    danger: { bg: "rgba(239,68,68,0.12)", fg: "var(--danger, #ef4444)" },
    muted: { bg: "var(--surface-3, #f3f4f6)", fg: "var(--muted, #6b7280)" },
  };
  const p = palette[tone];
  return (
    <span
      style={{
        display: "inline-block",
        background: p.bg,
        color: p.fg,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        padding: "2px 8px",
        borderRadius: 999,
        verticalAlign: "middle",
      }}
    >
      {children}
    </span>
  );
}

export function Quote({
  by,
  children,
}: {
  by?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <blockquote
      style={{
        borderLeft: "3px solid var(--secondary, #3b82f6)",
        margin: "12px 0",
        padding: "4px 0 4px 14px",
        fontStyle: "italic",
        color: "var(--text)",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      {children}
      {by && (
        <div
          style={{
            fontStyle: "normal",
            fontSize: 12,
            color: "var(--muted, #6b7280)",
            marginTop: 6,
          }}
        >
          — {by}
        </div>
      )}
    </blockquote>
  );
}

/** Anchor table of contents at the top of long articles. */
export function Toc({
  items,
}: {
  items: Array<{ href: string; label: React.ReactNode }>;
}) {
  return (
    <nav
      style={{
        margin: "10px 0 18px",
        padding: "10px 14px",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
      aria-label="Inhoudsopgave"
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "var(--muted, #6b7280)",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        Inhoud
      </div>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
        {items.map((it, i) => (
          <li key={i}>
            <a
              href={it.href}
              style={{ color: "var(--secondary, #3b82f6)", textDecoration: "none" }}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
