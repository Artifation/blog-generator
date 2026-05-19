"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Sparkles,
  AlertTriangle,
  AlertCircle,
  Lightbulb,
  RefreshCw,
  Copy,
  Wand2,
  CheckCircle2,
  Target,
  Clock,
  Type as TypeIcon,
  ListChecks,
  FileText,
  Globe,
  ExternalLink,
} from "lucide-react";
import { auditBlogAction, type AuditResultView } from "~/lib/actions/audit";
import { RequiredBadge, FieldHelp } from "~/components/ui/form-help";

type Severity = "error" | "warning" | "suggestion";
type Category = AuditResultView["issues"][0]["category"];

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

  /**
   * Replace the first occurrence of `quote` in the content with `rewrite`.
   * Tries an exact match first; falls back to a whitespace-tolerant match so
   * the apply still works if the AI's quote has slightly different spacing.
   */
  function applyRewrite(quote: string, rewrite: string) {
    if (!quote || !rewrite) return;
    if (content.includes(quote)) {
      setContent(content.replace(quote, rewrite));
      toast.success("Herschrijving toegepast in de tekst");
      return;
    }
    const norm = (s: string) => s.replace(/\s+/g, " ");
    const target = norm(quote);
    const haystack = norm(content);
    const idx = haystack.indexOf(target);
    if (idx === -1) {
      toast.error("Quote niet meer letterlijk gevonden — tekst handmatig aanpassen.");
      return;
    }
    let normCursor = 0;
    let origStart = -1;
    let origEnd = -1;
    for (let i = 0; i < content.length; i++) {
      const c = content[i]!;
      if (origStart === -1 && normCursor === idx) origStart = i;
      const isWs = /\s/.test(c);
      const prev = content[i - 1];
      if (!isWs || (prev && !/\s/.test(prev))) normCursor++;
      if (origStart !== -1 && normCursor === idx + target.length) {
        origEnd = i;
        break;
      }
    }
    if (origStart === -1 || origEnd === -1) {
      toast.error("Kon de positie van de quote niet bepalen.");
      return;
    }
    setContent(content.slice(0, origStart) + rewrite + content.slice(origEnd));
    toast.success("Herschrijving toegepast (whitespace-tolerant)");
  }

  return (
    <>
      <div className="page-head">
        <div className="ph-text">
          <h1>Blog-audit</h1>
          <div className="ph-sub">
            Plak je eigen blog. De AI leest tegen je brand voice + ban list en geeft scores,
            een fix-first lijst, gerichte issues met quotes, een volledig herschreven versie,
            en visuele highlights waar het mis is.
          </div>
        </div>
      </div>

      <div className="col gap-lg" style={{ paddingBottom: 60 }}>
        <div className="card">
          <div className="card-body col" style={{ gap: 12 }}>
            <div className="field">
              <label>
                <span>Target keyword</span>
                <RequiredBadge />
              </label>
              <input
                className="input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="bijv. 'ai voor mkb'"
                disabled={running}
              />
              <FieldHelp>
                Het focus-keyword waarop deze blog moet ranken. De auditor checkt
                of het keyword voorkomt in titel, intro en headings. Bij
                DataForSEO-integratie haalt het ook de top-10 SERP op voor dit keyword.
              </FieldHelp>
            </div>
            <div className="field">
              <label>
                <span>Blog content (HTML of platte tekst)</span>
                <RequiredBadge />
              </label>
              <textarea
                className="textarea mono"
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Plak hier je volledige blogpost..."
                disabled={running}
                style={{ fontSize: 12 }}
              />
              <FieldHelp>
                {content.length > 0 && (
                  <>~{wordCount(content)} woorden · </>
                )}
                Plak je volledige blog. HTML mag — headings, paragraphs, links —
                maar platte tekst werkt ook; we wrappen het automatisch. Hoe meer
                structuur (H1/H2's), hoe scherper de feedback op heading-hiërarchie.
              </FieldHelp>
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
            onApplyRewrite={applyRewrite}
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
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} gekopieerd`);
  } catch {
    toast.error("Kopiëren mislukt");
  }
}

// ---------------------------------------------------------------------------
// Result panel — tabbed layout
// ---------------------------------------------------------------------------

type Tab = "overview" | "issues" | "rewrite";

function AuditResultPanel({
  result,
  content,
  banList,
  brandVoice: _brandVoice,
  onApplyRewrite,
}: {
  result: AuditResultView;
  content: string;
  banList: string[];
  brandVoice: string;
  onApplyRewrite: (quote: string, rewrite: string) => void;
}) {
  const [tab, setTab] = React.useState<Tab>("overview");

  return (
    <>
      <ScoreHeader result={result} />

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={<Target size={14} />} label="Overzicht" />
          <TabButton active={tab === "issues"} onClick={() => setTab("issues")} icon={<ListChecks size={14} />} label={`Issues (${result.issues.length})`} />
          <TabButton
            active={tab === "rewrite"}
            onClick={() => setTab("rewrite")}
            icon={<FileText size={14} />}
            label="Verbeterde versie"
            disabled={!result.improvedVersion}
          />
        </div>
        <div className="card-body">
          {tab === "overview" && (
            <OverviewTab result={result} content={content} banList={banList} />
          )}
          {tab === "issues" && <IssuesTab result={result} onApplyRewrite={onApplyRewrite} />}
          {tab === "rewrite" && <RewriteTab improved={result.improvedVersion} />}
        </div>
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: "0 0 auto",
        padding: "12px 18px",
        background: active ? "var(--surface)" : "transparent",
        border: "none",
        borderBottom: active ? "2px solid var(--secondary, #3b82f6)" : "2px solid transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "flex",
        gap: 6,
        alignItems: "center",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? "var(--primary)" : "var(--muted)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Score header — gauges row at the top
// ---------------------------------------------------------------------------

function ScoreHeader({ result }: { result: AuditResultView }) {
  const scores = result.scores;
  const total = result.weightedTotal;
  const totalColor = scoreColor(total);

  return (
    <div className="card">
      <div className="card-body">
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <Gauge value={total} size={140} />
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Gewogen totaal
            </div>
            <div style={{ fontSize: 14, marginTop: 6, color: totalColor, fontWeight: 600 }}>
              {verdictLabel(total)}
            </div>
          </div>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <ScoreCard label="Leesbaarheid" value={scores.readability} />
              <ScoreCard label="Originaliteit" value={scores.originality} />
              <ScoreCard label="Brand voice" value={scores.brand_voice} />
              <ScoreCard label="SEO" value={scores.seo} />
              <ScoreCard label="Structuur" value={scores.structure} />
              <ScoreCard label="Feiten-helderheid" value={scores.factual_clarity} />
            </div>
            {result.summary && (
              <div
                className="muted"
                style={{
                  fontSize: 13,
                  marginTop: 14,
                  padding: 12,
                  background: "var(--surface-2)",
                  borderRadius: 6,
                  lineHeight: 1.5,
                }}
              >
                {result.summary}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function scoreColor(value: number): string {
  if (value >= 8) return "#047857";
  if (value >= 6) return "#b45309";
  return "#b91c1c";
}

function verdictLabel(total: number): string {
  if (total >= 8.5) return "Klaar om te publiceren";
  if (total >= 7) return "Bijna goed — kleine fixes";
  if (total >= 5) return "Substantiële revisie nodig";
  return "Herschrijven aanbevolen";
}

function Gauge({ value, size = 120 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(1, value / 10));
  const radius = (size - 12) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const color = scoreColor(value);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="rgba(0,0,0,0.08)"
        strokeWidth={10}
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 600ms ease-out" }}
      />
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        fontSize={size * 0.32}
        fontWeight={700}
        fill={color}
      >
        {value.toFixed(1)}
      </text>
    </svg>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value);
  return (
    <div
      style={{
        padding: 10,
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "var(--surface)",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 10,
        alignItems: "center",
      }}
    >
      <Gauge value={value} size={48} />
      <div>
        <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        <div className="mono" style={{ fontSize: 18, fontWeight: 600, color, lineHeight: 1.1 }}>
          {value.toFixed(1)}
          <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>/10</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab — fix-first + deterministic signals + highlighted preview
// ---------------------------------------------------------------------------

function OverviewTab({
  result,
  content,
  banList,
}: {
  result: AuditResultView;
  content: string;
  banList: string[];
}) {
  return (
    <div className="col" style={{ gap: 16 }}>
      {result.fixFirst.length > 0 && (
        <div
          style={{
            padding: 14,
            background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(99,102,241,0.06))",
            border: "1px solid rgba(59,130,246,0.25)",
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Target size={16} style={{ color: "var(--secondary, #3b82f6)" }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Fix-first list</span>
          </div>
          <ol style={{ paddingLeft: 20, margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            {result.fixFirst.map((item, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{item}</li>
            ))}
          </ol>
        </div>
      )}

      {(result.serpGaps.length > 0 || result.serpPositioning || result.serpResults.length > 0) && (
        <SerpPanel
          gaps={result.serpGaps}
          positioning={result.serpPositioning}
          results={result.serpResults}
        />
      )}

      <SignalsPanel result={result} />

      <div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h4 style={{ margin: 0 }}>Gemarkeerde preview</h4>
          <div className="muted" style={{ fontSize: 11 }}>
            <Mark color="rgba(220, 38, 38, 0.28)">rood</Mark> ban-list ·{" "}
            <Mark color="rgba(245, 158, 11, 0.28)">oranje</Mark> AI-cliché ·{" "}
            <Mark color="rgba(59, 130, 246, 0.2)">blauw</Mark> AI-quote
          </div>
        </div>
        <HighlightedContent content={content} banList={banList} issues={result.issues} />
      </div>
    </div>
  );
}

function SerpPanel({
  gaps,
  positioning,
  results,
}: {
  gaps: AuditResultView["serpGaps"];
  positioning: string | null;
  results: AuditResultView["serpResults"];
}) {
  return (
    <div
      style={{
        padding: 14,
        background: "linear-gradient(135deg, rgba(16,185,129,0.06), rgba(59,130,246,0.05))",
        border: "1px solid rgba(16,185,129,0.22)",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Globe size={16} style={{ color: "var(--success, #047857)" }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>SERP-analyse</span>
        <span className="muted" style={{ fontSize: 11 }}>
          Top-10 Google-resultaten via DataForSEO
        </span>
      </div>

      {positioning && (
        <div
          style={{
            fontSize: 13,
            padding: 10,
            marginBottom: 10,
            background: "rgba(16,185,129,0.08)",
            borderLeft: "3px solid var(--success, #047857)",
            borderRadius: 4,
            lineHeight: 1.5,
          }}
        >
          <strong>Positionering:</strong> {positioning}
        </div>
      )}

      {gaps.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Content-gaps ({gaps.length}) — onderwerpen die de top-10 dekt, jouw post niet
          </div>
          <div className="col" style={{ gap: 6 }}>
            {gaps.map((g, i) => (
              <div
                key={i}
                style={{
                  padding: 8,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>🎯 {g.topic}</div>
                <div className="muted" style={{ marginBottom: 4 }}>{g.rationale}</div>
                <div style={{ fontSize: 10 }}>
                  <span className="muted">Gedekt door: </span>
                  {g.covered_by.map((d, j) => (
                    <span
                      key={j}
                      style={{
                        display: "inline-block",
                        padding: "1px 6px",
                        marginRight: 4,
                        marginTop: 2,
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: 999,
                        fontFamily: "monospace",
                      }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            Toon top-10 SERP-resultaten ({results.length})
          </summary>
          <ol style={{ paddingLeft: 20, margin: "6px 0 0 0", fontSize: 12, lineHeight: 1.5 }}>
            {results.map((r, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--secondary, #3b82f6)", textDecoration: "none" }}
                >
                  {r.title} <ExternalLink size={10} style={{ verticalAlign: "middle" }} />
                </a>
                <div className="muted mono" style={{ fontSize: 10 }}>{r.domain}</div>
                {r.description && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{r.description}</div>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function SignalsPanel({ result }: { result: AuditResultView }) {
  const d = result.deterministic;
  return (
    <div>
      <h4 style={{ margin: "0 0 8px 0" }}>Deterministische signalen</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
        <Stat icon={<TypeIcon size={12} />} label="Woorden" value={d.wordCount.toString()} />
        <Stat
          icon={<Clock size={12} />}
          label="Leestijd"
          value={`${d.readingTimeMinutes} min`}
        />
        <Stat
          label="Flesch NL"
          value={d.fleschNlScore.toFixed(0)}
          tone={d.fleschNlScore >= 55 && d.fleschNlScore <= 75 ? "ok" : "warn"}
          hint={d.fleschNlScore < 55 ? "te complex" : d.fleschNlScore > 75 ? "iets te simpel" : "goed"}
        />
        <Stat
          label="KW density"
          value={`${d.keywordDensityPct.toFixed(1)}%`}
          tone={d.keywordDensityPct >= 0.5 && d.keywordDensityPct <= 3 ? "ok" : "warn"}
          hint={d.keywordDensityPct < 0.5 ? "weinig" : d.keywordDensityPct > 3 ? "te veel" : "ok"}
        />
        <Stat
          label="Banlist"
          value={d.banlistHits.toString()}
          tone={d.banlistHitsPer1000Words <= 1 ? "ok" : "bad"}
        />
        <Stat label="Em-dashes" value={d.emdashCount.toString()} />

        <Stat
          label="Zinslengte"
          value={`${d.sentences.avgWords.toFixed(1)}w gem.`}
          hint={`max ${d.sentences.maxWords}w · ${d.sentences.percentOver25Words.toFixed(0)}% > 25w`}
          tone={d.sentences.avgWords <= 15 ? "ok" : d.sentences.avgWords <= 20 ? "warn" : "bad"}
        />
        <Stat
          label="Passieve zinnen"
          value={d.passiveVoiceCount.toString()}
          tone={d.passiveVoiceCount <= 3 ? "ok" : d.passiveVoiceCount <= 8 ? "warn" : "bad"}
        />
        <Stat label="Vragen" value={d.questionCount.toString()} />
        <Stat
          label="Headings (H1/H2/H3)"
          value={`${d.headings.counts.h1}/${d.headings.counts.h2}/${d.headings.counts.h3}`}
          tone={d.headings.issues.length === 0 ? "ok" : "warn"}
        />
        <Stat
          label="TL;DR / CTA"
          value={`${d.hasTldrBlock ? "✓" : "✗"} / ${d.hasCta ? "✓" : "✗"}`}
        />
        <Stat label="Links (int/ext)" value={`${d.internalLinkCount}/${d.externalLinkCount}`} />
      </div>

      {d.headings.issues.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          <strong>Heading-issues:</strong>
          <ul style={{ margin: "4px 0 0 0", paddingLeft: 18, color: "var(--warning, #b45309)" }}>
            {d.headings.issues.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      {d.sentences.longSentences.length > 0 && (
        <details style={{ marginTop: 10, fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: "var(--warning, #b45309)" }}>
            <strong>{d.sentences.longSentences.length} lange zinnen (&gt; 25 woorden)</strong>
          </summary>
          <ol style={{ margin: "6px 0 0 0", paddingLeft: 20, lineHeight: 1.5 }}>
            {d.sentences.longSentences.map((s, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>
                <span className="muted">[{s.wordCount}w]</span> {s.sentence}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "warn" | "bad";
  hint?: string;
}) {
  const toneColor =
    tone === "ok" ? "var(--success, #047857)" : tone === "bad" ? "var(--danger, #b91c1c)" : tone === "warn" ? "var(--warning, #b45309)" : "var(--text)";
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 6,
        background: "var(--surface-2)",
        border: tone ? `1px solid ${toneColor}33` : "1px solid var(--border)",
      }}
    >
      <div
        className="muted"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          display: "flex",
          gap: 4,
          alignItems: "center",
        }}
      >
        {icon}
        {label}
      </div>
      <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: tone ? toneColor : undefined }}>
        {value}
      </div>
      {hint && (
        <div className="muted" style={{ fontSize: 10 }}>{hint}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issues tab — filter chips + sortable list
// ---------------------------------------------------------------------------

function IssuesTab({
  result,
  onApplyRewrite,
}: {
  result: AuditResultView;
  onApplyRewrite: (quote: string, rewrite: string) => void;
}) {
  const [severityFilter, setSeverityFilter] = React.useState<Set<Severity>>(
    new Set(["error", "warning", "suggestion"])
  );
  const [categoryFilter, setCategoryFilter] = React.useState<Set<Category> | null>(null); // null = all

  const visible = React.useMemo(() => {
    return result.issues
      .filter((i) => severityFilter.has(i.severity))
      .filter((i) => categoryFilter === null || categoryFilter.has(i.category))
      .sort((a, b) => a.priority - b.priority);
  }, [result.issues, severityFilter, categoryFilter]);

  const counts = React.useMemo(() => {
    const c = { error: 0, warning: 0, suggestion: 0 };
    for (const i of result.issues) c[i.severity]++;
    return c;
  }, [result.issues]);

  const categories = React.useMemo(() => {
    const set = new Set<Category>();
    for (const i of result.issues) set.add(i.category);
    return [...set];
  }, [result.issues]);

  function toggleSeverity(s: Severity) {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleCategory(c: Category) {
    setCategoryFilter((prev) => {
      if (prev === null) return new Set([c]);
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next.size === 0 ? null : next;
    });
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <div>
        <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
          <FilterChip
            active={severityFilter.has("error")}
            onClick={() => toggleSeverity("error")}
            color="#b91c1c"
            label={`🔴 Errors (${counts.error})`}
          />
          <FilterChip
            active={severityFilter.has("warning")}
            onClick={() => toggleSeverity("warning")}
            color="#b45309"
            label={`🟡 Warnings (${counts.warning})`}
          />
          <FilterChip
            active={severityFilter.has("suggestion")}
            onClick={() => toggleSeverity("suggestion")}
            color="#2563eb"
            label={`💡 Suggesties (${counts.suggestion})`}
          />
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <FilterChip
            active={categoryFilter === null}
            onClick={() => setCategoryFilter(null)}
            label="Alle categorieën"
          />
          {categories.map((c) => (
            <FilterChip
              key={c}
              active={categoryFilter !== null && categoryFilter.has(c)}
              onClick={() => toggleCategory(c)}
              label={c}
            />
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: 20, textAlign: "center" }}>
          Geen issues in dit filter.
        </div>
      ) : (
        visible.map((issue, i) => (
          <IssueRow key={i} issue={issue} onApplyRewrite={onApplyRewrite} />
        ))
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        border: active ? `1px solid ${color ?? "var(--secondary, #3b82f6)"}` : "1px solid var(--border)",
        background: active ? `${color ?? "var(--secondary, #3b82f6)"}1a` : "var(--surface)",
        color: active ? color ?? "var(--secondary, #3b82f6)" : "var(--muted)",
        cursor: "pointer",
        fontWeight: active ? 500 : 400,
      }}
    >
      {label}
    </button>
  );
}

function IssueRow({
  issue,
  onApplyRewrite,
}: {
  issue: AuditResultView["issues"][0];
  onApplyRewrite: (quote: string, rewrite: string) => void;
}) {
  const sev = issue.severity;
  const Icon = sev === "error" ? AlertCircle : sev === "warning" ? AlertTriangle : Lightbulb;
  const color = sev === "error" ? "var(--danger, #b91c1c)" : sev === "warning" ? "var(--warning, #b45309)" : "var(--info, #2563eb)";
  const canApply = !!issue.quote && !!issue.suggested_rewrite;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 10,
        padding: 12,
        borderRadius: 8,
        border: `1px solid ${color}33`,
        background: "var(--surface)",
      }}
    >
      <Icon size={16} style={{ color, marginTop: 2 }} />
      <div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
          <span className="badge b-gray" style={{ textTransform: "uppercase", fontSize: 10 }}>{issue.category}</span>
          <span
            className="badge"
            style={{
              fontSize: 10,
              background: `${color}1a`,
              color,
              padding: "2px 6px",
              borderRadius: 4,
            }}
            title={`Priority ${issue.priority} (1 = fix first)`}
          >
            P{issue.priority}
          </span>
          {typeof issue.estimated_score_lift === "number" && issue.estimated_score_lift > 0 && (
            <span
              className="badge"
              style={{
                fontSize: 10,
                background: "rgba(16,185,129,0.12)",
                color: "var(--success, #047857)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
              title="Geschatte stijging van de gewogen score wanneer dit issue fixed wordt"
            >
              +{issue.estimated_score_lift.toFixed(1)}
            </span>
          )}
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
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
              <div className="muted" style={{ fontSize: 11 }}>Voorgestelde herschrijving:</div>
              <div className="row" style={{ gap: 4 }}>
                {canApply && (
                  <button
                    type="button"
                    onClick={() => onApplyRewrite(issue.quote!, issue.suggested_rewrite!)}
                    title="Vervang de quote in je tekst-input door deze herschrijving"
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      border: "1px solid var(--secondary, #3b82f6)",
                      borderRadius: 4,
                      background: "rgba(59, 130, 246, 0.08)",
                      color: "var(--secondary, #3b82f6)",
                      cursor: "pointer",
                      display: "flex",
                      gap: 4,
                      alignItems: "center",
                      fontWeight: 500,
                    }}
                  >
                    <Wand2 size={11} /> Toepassen
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyToClipboard(issue.suggested_rewrite!, "Herschrijving")}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    background: "var(--surface)",
                    cursor: "pointer",
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  <Copy size={11} /> Kopieer
                </button>
              </div>
            </div>
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

// ---------------------------------------------------------------------------
// Rewrite tab — the full improved version with copy button
// ---------------------------------------------------------------------------

function RewriteTab({ improved }: { improved: string | null }) {
  if (!improved) {
    return (
      <div className="muted" style={{ fontSize: 13, padding: 20, textAlign: "center" }}>
        De AI vond de bron al sterk genoeg dat een volledige herschrijving niet nodig was. Bekijk de issues-tab voor lokale fixes.
      </div>
    );
  }
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Volledige herschreven versie die alle errors + meeste warnings adresseert. Plak terug in je editor of WP.
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => copyToClipboard(improved, "Verbeterde versie")}
        >
          <CheckCircle2 size={14} /> Kopieer verbeterde versie
        </button>
      </div>
      <div
        style={{
          whiteSpace: "pre-wrap",
          fontSize: 14,
          lineHeight: 1.6,
          padding: 16,
          background: "var(--surface-2)",
          borderRadius: 6,
          maxHeight: 600,
          overflowY: "auto",
        }}
      >
        {improved}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline highlight helper
// ---------------------------------------------------------------------------

function Mark({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ background: color, padding: "1px 4px", borderRadius: 3 }}>{children}</span>;
}

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
  const plain = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

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
