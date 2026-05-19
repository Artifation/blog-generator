/**
 * Shared building blocks for wiki articles. Keep them visually consistent
 * so users can predict where to find what across all articles:
 *
 *  - <Callout> for info / tip / warning boxes
 *  - <Definition> for inline term-defs in the running text
 *  - <Steps> + <Step> for "do this then this" walkthroughs
 *  - <Codeblock> for monospace examples
 *  - <Bullet> for clean bullet lists with extra spacing
 *  - <Glossary> + <GlossaryEntry> for the term-reference page
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
