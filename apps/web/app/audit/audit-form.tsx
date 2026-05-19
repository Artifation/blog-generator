"use client";

import * as React from "react";
import { toast } from "sonner";
import { Sparkles, AlertTriangle, AlertCircle, Lightbulb, RefreshCw } from "lucide-react";
import { auditBlogAction, type AuditResultView } from "~/lib/actions/audit";

interface AuditFormProps {
  brandVoice: string;
  banList: string[];
}

export function AuditForm({ brandVoice, banList }: AuditFormProps) {
  const [content, setContent] = React.useState("");
  const [keyword, setKeyword] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<AuditResultView | null>(null);

  async function audit() {
    if (!content.trim() || !keyword.trim()) {
      toast.error("Plak je blog en geef een target keyword op.");
      return;
    }
    setRunning(true);
    const tid = toast.loading("AI leest je blog en geeft feedback…");
    const res = await auditBlogAction({ html: content, targetKeyword: keyword });
    toast.dismiss(tid);
    setRunning(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResult(res.result);
  }

  return (
    <>
      <div className="page-head">
        <div className="ph-text">
          <h1>Blog-audit</h1>
          <div className="ph-sub">
            Plak je eigen blog. De AI leest 'm tegen je brand voice + ban list en geeft
            scores per dimensie, gerichte issues met quotes, en herschrijf-suggesties.
            Wat er rood/oranje gemarkeerd staat is een directe hit op je ban list of
            een AI-cliché.
          </div>
        </div>
      </div>

      <div className="col gap-lg" style={{ paddingBottom: 60 }}>
        <div className="card">
          <div className="card-body col" style={{ gap: 12 }}>
            <div className="field">
              <label>Target keyword</label>
              <input
                className="input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="bijv. 'ai voor mkb'"
                disabled={running}
              />
            </div>
            <div className="field">
              <label>Blog content (HTML of platte tekst)</label>
              <textarea
                className="textarea mono"
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Plak hier je volledige blogpost..."
                disabled={running}
                style={{ fontSize: 12 }}
              />
              <div className="hint" style={{ fontSize: 11 }}>
                {content.length > 0 && (
                  <>~{wordCount(content)} woorden · </>
                )}
                HTML mag, maar platte tekst kan ook — we wrappen het automatisch.
              </div>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={audit}
                disabled={running || !content.trim() || !keyword.trim()}
              >
                {running ? (
                  <>
                    <RefreshCw size={13} className="spin" /> AI leest…
                  </>
                ) : (
                  <>
                    <Sparkles size={13} /> Audit blog
                  </>
                )}
              </button>
              {result && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setResult(null)}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {result && (
          <AuditResultPanel
            result={result}
            content={content}
            banList={banList}
            brandVoice={brandVoice}
          />
        )}
      </div>
    </>
  );
}

function wordCount(s: string): number {
  return stripHtml(s).split(/\s+/).filter(Boolean).length;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function AuditResultPanel({
  result,
  content,
  banList,
  brandVoice: _brandVoice,
}: {
  result: AuditResultView;
  content: string;
  banList: string[];
  brandVoice: string;
}) {
  const scores = result.scores;
  const totalColor = result.weightedTotal >= 8 ? "var(--success, #047857)" : result.weightedTotal >= 6 ? "var(--warning, #b45309)" : "var(--danger, #b91c1c)";

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Audit-resultaat</h3>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{result.summary}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: totalColor }}>
              {result.weightedTotal.toFixed(1)}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>/10 gewogen</div>
          </div>
        </div>
        <div className="card-body" style={{ gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <ScoreBox label="Leesbaarheid" value={scores.readability} />
            <ScoreBox label="Originaliteit" value={scores.originality} />
            <ScoreBox label="Brand voice" value={scores.brand_voice} />
            <ScoreBox label="SEO" value={scores.seo} />
            <ScoreBox label="Structuur" value={scores.structure} />
            <ScoreBox label="Feiten-helderheid" value={scores.factual_clarity} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Deterministische signalen</h3>
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, fontSize: 12 }}>
            <Signal label="Woorden" value={result.deterministic.wordCount} />
            <Signal
              label="Flesch NL"
              value={result.deterministic.fleschNlScore.toFixed(1)}
              hint={result.deterministic.fleschNlScore < 55 ? "te complex" : result.deterministic.fleschNlScore > 75 ? "iets te simpel" : "ok"}
            />
            <Signal
              label="Keyword density"
              value={`${result.deterministic.keywordDensityPct.toFixed(1)}%`}
              hint={result.deterministic.keywordDensityPct < 0.5 ? "weinig" : result.deterministic.keywordDensityPct > 3 ? "te veel" : "ok"}
            />
            <Signal
              label="Banlist hits"
              value={result.deterministic.banlistHits}
              hint={result.deterministic.banlistHitsPer1000Words > 3 ? "te veel" : "ok"}
            />
            <Signal label="Em-dashes" value={result.deterministic.emdashCount} />
            <Signal label="Intern" value={result.deterministic.internalLinkCount} />
            <Signal label="Extern" value={result.deterministic.externalLinkCount} />
            <Signal
              label="TL;DR / CTA"
              value={`${result.deterministic.hasTldrBlock ? "✓" : "✗"} / ${result.deterministic.hasCta ? "✓" : "✗"}`}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Issues ({result.issues.length})</h3>
        </div>
        <div className="card-body col" style={{ gap: 10 }}>
          {result.issues.length === 0 && (
            <div className="muted" style={{ fontSize: 13 }}>
              Geen specifieke issues gevonden — sterk werk.
            </div>
          )}
          {result.issues.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Gemarkeerde preview</h3>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              <Mark color="rgba(220, 38, 38, 0.25)">rood</Mark> = ban-list hit ·{" "}
              <Mark color="rgba(245, 158, 11, 0.25)">oranje</Mark> = AI-cliché ·{" "}
              <Mark color="rgba(59, 130, 246, 0.2)">blauw</Mark> = AI-quote uit issue
            </div>
          </div>
        </div>
        <div className="card-body">
          <HighlightedContent
            content={content}
            banList={banList}
            issues={result.issues}
          />
        </div>
      </div>
    </>
  );
}

function ScoreBox({ label, value }: { label: string; value: number }) {
  const color = value >= 8 ? "var(--success, #047857)" : value >= 6 ? "var(--warning, #b45309)" : "var(--danger, #b91c1c)";
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface-2)",
      }}
    >
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1.1 }}>
        {value.toFixed(1)}
      </div>
    </div>
  );
}

function Signal({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div style={{ padding: 8, borderRadius: 6, background: "var(--surface-2)" }}>
      <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{value}</div>
      {hint && (
        <div
          className="muted"
          style={{
            fontSize: 10,
            color: hint === "ok" ? "var(--success, #047857)" : "var(--danger, #b91c1c)",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: AuditResultView["issues"][0] }) {
  const sev = issue.severity;
  const Icon = sev === "error" ? AlertCircle : sev === "warning" ? AlertTriangle : Lightbulb;
  const color = sev === "error" ? "var(--danger, #b91c1c)" : sev === "warning" ? "var(--warning, #b45309)" : "var(--info, #2563eb)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 10,
        padding: 12,
        borderRadius: 8,
        border: `1px solid ${color}`,
        background: "var(--surface)",
      }}
    >
      <Icon size={16} style={{ color, marginTop: 2 }} />
      <div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
          <span className="badge b-gray" style={{ textTransform: "uppercase", fontSize: 10 }}>{issue.category}</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{issue.message}</span>
        </div>
        {issue.quote && (
          <div
            style={{
              fontSize: 12,
              fontStyle: "italic",
              padding: 8,
              background: "var(--surface-2)",
              borderLeft: `3px solid ${color}`,
              marginTop: 4,
              borderRadius: 4,
            }}
          >
            "{issue.quote}"
          </div>
        )}
        {issue.suggested_rewrite && (
          <div style={{ marginTop: 6 }}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Voorgestelde herschrijving:</div>
            <div
              style={{
                fontSize: 12,
                padding: 8,
                background: "rgba(16, 185, 129, 0.08)",
                borderLeft: "3px solid var(--success, #047857)",
                borderRadius: 4,
              }}
            >
              {issue.suggested_rewrite}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Mark({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ background: color, padding: "1px 4px", borderRadius: 3 }}>{children}</span>;
}

// List of AI-style clichés to highlight automatically. Same set the writer prompt bans.
const AI_CLICHES = [
  "delve",
  "leverage",
  "harness the power of",
  "moreover",
  "furthermore",
  "additionally",
  "notably",
  "it's worth noting",
  "in conclusion",
  "to sum up",
  "tot slot",
  "samenvattend",
  "in een wereld waar",
  "in de steeds veranderende wereld",
];

function HighlightedContent({
  content,
  banList,
  issues,
}: {
  content: string;
  banList: string[];
  issues: AuditResultView["issues"];
}) {
  // Convert to plain text representation: strip HTML tags but keep text.
  const plain = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // Build a list of (start, end, color) ranges to highlight.
  type Range = { start: number; end: number; color: string; title: string };
  const ranges: Range[] = [];

  const lowerPlain = plain.toLowerCase();

  function addAllOccurrences(needle: string, color: string, title: string) {
    if (!needle) return;
    const lowerNeedle = needle.toLowerCase();
    let from = 0;
    while (true) {
      const idx = lowerPlain.indexOf(lowerNeedle, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + needle.length, color, title });
      from = idx + needle.length;
    }
  }

  for (const term of banList) addAllOccurrences(term, "rgba(220, 38, 38, 0.28)", `ban-list: ${term}`);
  for (const cliche of AI_CLICHES) addAllOccurrences(cliche, "rgba(245, 158, 11, 0.28)", `AI-cliché: ${cliche}`);
  for (const issue of issues) {
    if (issue.quote) addAllOccurrences(issue.quote, "rgba(59, 130, 246, 0.18)", `AI: ${issue.message}`);
  }

  ranges.sort((a, b) => a.start - b.start);

  // Merge overlapping ranges, picking the later/longer color
  const merged: Range[] = [];
  for (const r of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && r.start <= prev.end) {
      prev.end = Math.max(prev.end, r.end);
      prev.title = `${prev.title}; ${r.title}`;
    } else {
      merged.push({ ...r });
    }
  }

  const chunks: React.ReactNode[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) chunks.push(plain.slice(cursor, r.start));
    chunks.push(
      <mark
        key={`${r.start}-${r.end}`}
        title={r.title}
        style={{ background: r.color, padding: "1px 2px", borderRadius: 2 }}
      >
        {plain.slice(r.start, r.end)}
      </mark>
    );
    cursor = r.end;
  }
  if (cursor < plain.length) chunks.push(plain.slice(cursor));

  return (
    <div
      style={{
        whiteSpace: "pre-wrap",
        lineHeight: 1.6,
        fontSize: 14,
        padding: 12,
        background: "var(--surface-2)",
        borderRadius: 6,
        maxHeight: 500,
        overflowY: "auto",
      }}
    >
      {chunks}
    </div>
  );
}
