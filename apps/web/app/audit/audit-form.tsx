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
  TrendingUp,
  BarChart3,
  Eye,
  Hash,
  Heading1,
  Heading2,
  Heading3,
  Quote,
} from "lucide-react";
import { auditBlogAction, generateRewriteAction, type AuditResultView } from "~/lib/actions/audit";
import { RequiredBadge, FieldHelp } from "~/components/ui/form-help";
import {
  scoreColor as sharedScoreColor,
  scoreColorSoft as sharedScoreColorSoft,
  verdictLabel as sharedVerdictLabel,
  clampScore as sharedClampScore,
} from "@/agents/scoring";

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
  const [elapsedS, setElapsedS] = React.useState(0);
  const [result, setResult] = React.useState<AuditResultView | null>(null);

  React.useEffect(() => {
    if (!running) return;
    setElapsedS(0);
    const start = Date.now();
    const id = setInterval(() => setElapsedS(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  async function audit() {
    if (!content.trim() || !keyword.trim()) {
      toast.error("Plak je blog en geef een target keyword op.");
      return;
    }
    setRunning(true);
    const tid = toast.loading("AI leest je blog en geeft feedback…");
    try {
      const res = await auditBlogAction({ html: content, targetKeyword: keyword });
      if (!res.ok) {
        toast.error(res.error, { duration: 8000 });
        return;
      }
      setResult(res.result);
      toast.success("Audit klaar");
    } catch (err) {
      toast.error(
        `Audit kon niet voltooien: ${(err as Error).message ?? "onbekende fout"}. Probeer opnieuw of check je internet/API-keys.`,
        { duration: 10000 }
      );
    } finally {
      toast.dismiss(tid);
      setRunning(false);
    }
  }

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
                    <RefreshCw size={13} className="spin" /> AI leest… {elapsedS}s
                    {elapsedS > 45 && <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>(duurt soms tot 2 min)</span>}
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
            keyword={keyword}
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
// Score helpers
// ---------------------------------------------------------------------------

// Score-utilities komen uit src/agents/scoring.ts (gedeeld met agents +
// andere UI's). Alleen aliasen zodat de rest van dit bestand z'n bekende
// naamruimte houdt zonder een grote rename-diff.
const scoreColor = sharedScoreColor;
const scoreColorSoft = sharedScoreColorSoft;
const verdictLabel = sharedVerdictLabel;
const clampScore = sharedClampScore;

/** Sum estimated_score_lift of fix-first / top-priority issues to project the
 * ceiling if the user actually fixes everything the auditor flagged. */
function projectPotential(result: AuditResultView): number {
  const lift = result.issues.reduce((sum, i) => sum + (i.estimated_score_lift ?? 0), 0);
  return clampScore(result.weightedTotal + lift);
}

// ---------------------------------------------------------------------------
// Result panel — tabbed layout
// ---------------------------------------------------------------------------

type Tab = "overview" | "issues" | "insights" | "rewrite";

function AuditResultPanel({
  result,
  content,
  keyword,
  banList,
  brandVoice: _brandVoice,
  onApplyRewrite,
}: {
  result: AuditResultView;
  content: string;
  keyword: string;
  banList: string[];
  brandVoice: string;
  onApplyRewrite: (quote: string, rewrite: string) => void;
}) {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [rewrite, setRewrite] = React.useState<{ improvedHtml: string; changeLog: string[] } | null>(
    result.improvedVersion ? { improvedHtml: result.improvedVersion, changeLog: [] } : null
  );
  const [rewriteLoading, setRewriteLoading] = React.useState(false);

  React.useEffect(() => {
    // Reset rewrite-state als de audit-result wisselt (nieuwe audit gedraaid).
    setRewrite(result.improvedVersion ? { improvedHtml: result.improvedVersion, changeLog: [] } : null);
    setRewriteLoading(false);
  }, [result]);

  async function generateRewrite() {
    if (!content.trim() || !keyword.trim() || result.issues.length === 0) {
      toast.error("Audit eerst — er zijn nog geen issues om te adresseren.");
      return;
    }
    setRewriteLoading(true);
    const tid = toast.loading("AI herschrijft je blog op basis van de issues…");
    try {
      const res = await generateRewriteAction({
        html: content,
        targetKeyword: keyword,
        issues: result.issues,
        fixFirst: result.fixFirst,
      });
      if (!res.ok) {
        toast.error(res.error, { duration: 8000 });
        return;
      }
      setRewrite({ improvedHtml: res.result.improvedHtml, changeLog: res.result.changeLog });
      toast.success("Verbeterde versie klaar");
    } catch (err) {
      toast.error(`Herschrijven mislukte: ${(err as Error).message ?? "onbekend"}`, { duration: 10000 });
    } finally {
      toast.dismiss(tid);
      setRewriteLoading(false);
    }
  }

  return (
    <>
      <ScoreHero result={result} />

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
            position: "sticky",
            top: 0,
            zIndex: 5,
          }}
        >
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={<Target size={14} />} label="Overzicht" />
          <TabButton active={tab === "issues"} onClick={() => setTab("issues")} icon={<ListChecks size={14} />} label={`Issues (${result.issues.length})`} />
          <TabButton active={tab === "insights"} onClick={() => setTab("insights")} icon={<BarChart3 size={14} />} label="Inzichten" />
          <TabButton
            active={tab === "rewrite"}
            onClick={() => setTab("rewrite")}
            icon={<FileText size={14} />}
            label="Verbeterde versie"
          />
        </div>
        <div className="card-body">
          {tab === "overview" && (
            <OverviewTab result={result} content={content} banList={banList} />
          )}
          {tab === "issues" && <IssuesTab result={result} onApplyRewrite={onApplyRewrite} />}
          {tab === "insights" && <InsightsTab result={result} />}
          {tab === "rewrite" && (
            <RewriteTab
              rewrite={rewrite}
              loading={rewriteLoading}
              onGenerate={generateRewrite}
              issuesCount={result.issues.length}
            />
          )}
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
// Score hero — current score, potential ceiling, radar of categories
// ---------------------------------------------------------------------------

function ScoreHero({ result }: { result: AuditResultView }) {
  const total = result.weightedTotal;
  const potential = projectPotential(result);
  const delta = potential - total;
  const totalColor = scoreColor(total);
  const potentialColor = scoreColor(potential);
  const counts = React.useMemo(() => {
    const c = { error: 0, warning: 0, suggestion: 0 };
    for (const i of result.issues) c[i.severity]++;
    return c;
  }, [result.issues]);

  return (
    <div className="card">
      <div
        className="card-body"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 280px) minmax(220px, 260px) 1fr",
          gap: 20,
          alignItems: "center",
        }}
      >
        {/* Current → potential gauge */}
        <div style={{ textAlign: "center" }}>
          <DualGauge current={total} potential={potential} size={150} />
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            Huidig totaal · gewogen
          </div>
          <div style={{ fontSize: 14, marginTop: 4, color: totalColor, fontWeight: 600 }}>
            {verdictLabel(total)}
          </div>
          {delta > 0.1 && (
            <div
              style={{
                fontSize: 12,
                marginTop: 8,
                padding: "4px 8px",
                background: "rgba(16,185,129,0.10)",
                color: "var(--success, #047857)",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontWeight: 500,
              }}
            >
              <TrendingUp size={12} />
              Tot {potential.toFixed(1)} mogelijk (+{delta.toFixed(1)}) na fixes
            </div>
          )}
        </div>

        {/* Radar of all 6 categories */}
        <div style={{ textAlign: "center" }}>
          <CategoryRadar scores={result.scores} size={220} />
          <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>
            Profiel per categorie
          </div>
        </div>

        {/* Summary + issue counts + score breakdown bars */}
        <div className="col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <SeverityPill count={counts.error} severity="error" />
            <SeverityPill count={counts.warning} severity="warning" />
            <SeverityPill count={counts.suggestion} severity="suggestion" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <ScoreBar label="Leesbaarheid" value={result.scores.readability} />
            <ScoreBar label="Originaliteit" value={result.scores.originality} />
            <ScoreBar label="Brand voice" value={result.scores.brand_voice} />
            <ScoreBar label="SEO" value={result.scores.seo} />
            <ScoreBar label="Structuur" value={result.scores.structure} />
            <ScoreBar label="Feiten-helderheid" value={result.scores.factual_clarity} />
          </div>

          {result.summary && (
            <div
              style={{
                fontSize: 12.5,
                padding: 10,
                background: "var(--surface-2)",
                borderLeft: `3px solid ${potentialColor}`,
                borderRadius: 4,
                lineHeight: 1.5,
              }}
            >
              {result.summary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SeverityPill({ count, severity }: { count: number; severity: Severity }) {
  const styles: Record<Severity, { bg: string; fg: string; label: string }> = {
    error: { bg: "rgba(185,28,28,0.10)", fg: "#b91c1c", label: "errors" },
    warning: { bg: "rgba(180,83,9,0.10)", fg: "#b45309", label: "warnings" },
    suggestion: { bg: "rgba(37,99,235,0.10)", fg: "#2563eb", label: "suggesties" },
  };
  const s = styles[severity];
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {count} {s.label}
    </span>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value * 10));
  const color = scoreColor(value);
  return (
    <div
      style={{
        padding: "6px 8px",
        background: "var(--surface-2)",
        borderRadius: 4,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 4,
        alignItems: "center",
      }}
    >
      <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 12, fontWeight: 700, color }}>
        {value.toFixed(1)}
      </div>
      <div
        style={{
          gridColumn: "1 / span 2",
          height: 5,
          borderRadius: 3,
          background: "rgba(0,0,0,0.06)",
          overflow: "hidden",
          marginTop: 2,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            transition: "width 600ms ease-out",
          }}
        />
      </div>
    </div>
  );
}

/** Dual-arc gauge: outer ring = potential ceiling (lighter), inner ring = current value. */
function DualGauge({ current, potential, size = 140 }: { current: number; potential: number; size?: number }) {
  const pctCurrent = Math.max(0, Math.min(1, current / 10));
  const pctPotential = Math.max(0, Math.min(1, potential / 10));
  const radius = (size - 16) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offsetCurrent = circumference * (1 - pctCurrent);
  const offsetPotential = circumference * (1 - pctPotential);
  const currentColor = scoreColor(current);
  const potentialColor = scoreColor(potential);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Ghost potential arc — only visible if there's headroom */}
      {potential > current + 0.1 && (
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={potentialColor}
          strokeWidth={10}
          opacity={0.22}
          strokeDasharray={circumference}
          strokeDashoffset={offsetPotential}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
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
        stroke={currentColor}
        strokeWidth={10}
        strokeDasharray={circumference}
        strokeDashoffset={offsetCurrent}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 600ms ease-out" }}
      />
      <text
        x={cx}
        y={cy + 6}
        textAnchor="middle"
        fontSize={size * 0.32}
        fontWeight={700}
        fill={currentColor}
      >
        {current.toFixed(1)}
      </text>
      <text
        x={cx}
        y={cy + size * 0.22}
        textAnchor="middle"
        fontSize={size * 0.09}
        fill="var(--muted)"
      >
        / 10
      </text>
    </svg>
  );
}

function CategoryRadar({ scores, size = 200 }: { scores: AuditResultView["scores"]; size?: number }) {
  const labels = ["Lees", "Origineel", "Voice", "SEO", "Structuur", "Feiten"];
  const values = [
    scores.readability,
    scores.originality,
    scores.brand_voice,
    scores.seo,
    scores.structure,
    scores.factual_clarity,
  ];
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 24;
  const N = values.length;

  const point = (val: number, i: number, padding = 0) => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    const distance = (Math.max(0, Math.min(10, val)) / 10) * (r - padding);
    return [cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance];
  };

  const polygon = values.map((v, i) => point(v, i).join(",")).join(" ");
  const rings = [2.5, 5, 7.5, 10];

  // Color the polygon by the weakest score so the radar visually shouts when
  // one axis is dragging the rest down.
  const minScore = Math.min(...values);
  const fillColor = scoreColor(minScore);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Concentric reference rings */}
      {rings.map((ring, idx) => (
        <polygon
          key={idx}
          points={Array.from({ length: N }, (_, i) => point(ring, i).join(",")).join(" ")}
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth={1}
        />
      ))}
      {/* Spokes */}
      {labels.map((_, i) => {
        const [x, y] = point(10, i);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="rgba(0,0,0,0.06)"
            strokeWidth={1}
          />
        );
      })}
      {/* Data polygon */}
      <polygon
        points={polygon}
        fill={fillColor}
        fillOpacity={0.18}
        stroke={fillColor}
        strokeWidth={2}
      />
      {/* Data dots */}
      {values.map((v, i) => {
        const [x, y] = point(v, i);
        return <circle key={i} cx={x} cy={y} r={2.5} fill={scoreColor(v)} />;
      })}
      {/* Labels */}
      {labels.map((lab, i) => {
        const [lx, ly] = point(11.4, i);
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9.5}
            fill="var(--muted)"
            fontWeight={500}
          >
            {lab}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Overview tab — Quick wins, Outline, Health snapshot, SERP, preview
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
      <QuickWinsPanel result={result} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <OutlinePanel outline={result.deterministic.headings.outline} headingIssues={result.deterministic.headings.issues} />
        <HealthSnapshotPanel result={result} />
      </div>

      <IssueHeatmap issues={result.issues} />

      {(result.serpGaps.length > 0 || result.serpPositioning || result.serpResults.length > 0) && (
        <SerpPanel
          gaps={result.serpGaps}
          positioning={result.serpPositioning}
          results={result.serpResults}
        />
      )}

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

function QuickWinsPanel({ result }: { result: AuditResultView }) {
  // Highest projected score-lift first; fall back to priority when ties.
  const ranked = [...result.issues]
    .map((i) => ({ ...i, lift: i.estimated_score_lift ?? 0 }))
    .sort((a, b) => (b.lift - a.lift) || (a.priority - b.priority))
    .slice(0, 5);
  const maxLift = ranked[0]?.lift ?? 1;

  if (result.fixFirst.length === 0 && ranked.length === 0) return null;

  return (
    <div
      style={{
        padding: 14,
        background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(99,102,241,0.06))",
        border: "1px solid rgba(59,130,246,0.25)",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Target size={16} style={{ color: "var(--secondary, #3b82f6)" }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Quick wins</span>
        <span className="muted" style={{ fontSize: 11 }}>
          Hoogste verwachte score-impact eerst
        </span>
      </div>

      {result.fixFirst.length > 0 && (
        <ol style={{ paddingLeft: 20, margin: "0 0 10px 0", fontSize: 13, lineHeight: 1.6 }}>
          {result.fixFirst.map((item, i) => (
            <li key={i} style={{ marginBottom: 2 }}>{item}</li>
          ))}
        </ol>
      )}

      {ranked.length > 0 && ranked.some((r) => r.lift > 0) && (
        <div className="col" style={{ gap: 6, marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Geschatte score-stijging per issue
          </div>
          {ranked.filter((r) => r.lift > 0).map((r, i) => {
            const widthPct = Math.max(8, (r.lift / maxLift) * 100);
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 50px",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span
                    className="badge"
                    style={{
                      fontSize: 9,
                      background: "var(--surface)",
                      color: "var(--muted)",
                      padding: "1px 5px",
                      borderRadius: 3,
                      marginRight: 6,
                      textTransform: "uppercase",
                    }}
                  >
                    {r.category}
                  </span>
                  {r.message}
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: "rgba(0,0,0,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${widthPct}%`,
                      height: "100%",
                      background: "var(--success, #047857)",
                    }}
                  />
                </div>
                <span className="mono" style={{ fontSize: 11, color: "var(--success, #047857)", fontWeight: 600 }}>
                  +{r.lift.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OutlinePanel({
  outline,
  headingIssues,
}: {
  outline: { level: number; text: string }[];
  headingIssues: string[];
}) {
  const minLevel = outline.length === 0 ? 1 : Math.min(...outline.map((h) => h.level));

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
        minHeight: 180,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Heading1 size={14} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Structuur-outline</span>
        <span className="muted" style={{ fontSize: 11 }}>({outline.length} headings)</span>
      </div>
      {outline.length === 0 ? (
        <div className="muted" style={{ fontSize: 12, fontStyle: "italic" }}>
          Geen headings gedetecteerd — voeg een H1 en H2's toe voor scanbaarheid.
        </div>
      ) : (
        <div className="col" style={{ gap: 3, fontSize: 12.5, maxHeight: 220, overflowY: "auto" }}>
          {outline.map((h, i) => {
            const Icon = h.level === 1 ? Heading1 : h.level === 2 ? Heading2 : Heading3;
            const indent = (h.level - minLevel) * 16;
            const color =
              h.level === 1 ? "var(--text)" : h.level === 2 ? "var(--text)" : "var(--muted)";
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 6,
                  alignItems: "center",
                  paddingLeft: indent,
                  color,
                  fontWeight: h.level <= 2 ? 500 : 400,
                }}
              >
                <Icon size={11} style={{ opacity: 0.6 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.text || <span className="muted">(leeg)</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {headingIssues.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: 6,
            background: "rgba(180,83,9,0.08)",
            borderLeft: "3px solid var(--warning, #b45309)",
            borderRadius: 3,
            fontSize: 11.5,
            color: "var(--warning, #b45309)",
          }}
        >
          {headingIssues.map((i, idx) => (
            <div key={idx}>• {i}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function HealthSnapshotPanel({ result }: { result: AuditResultView }) {
  const d = result.deterministic;
  const intro = d.intro;
  const kw = d.keywordDistribution;

  type Row = { label: string; value: React.ReactNode; tone: "ok" | "warn" | "bad" | undefined; hint?: string };
  const rows: Row[] = [
    {
      label: "Lengte",
      value: `${d.wordCount} woorden · ${d.readingTimeMinutes} min`,
      tone: d.wordCount >= 800 && d.wordCount <= 2500 ? "ok" : d.wordCount < 400 ? "bad" : "warn",
      hint:
        d.wordCount < 400
          ? "te kort voor SEO-volume"
          : d.wordCount > 3000
          ? "lang — controleer scanbaarheid"
          : undefined,
    },
    {
      label: "Leesgemak (Flesch)",
      value: d.fleschNlScore.toFixed(0),
      tone: d.fleschNlScore >= 55 && d.fleschNlScore <= 75 ? "ok" : "warn",
      hint:
        d.fleschNlScore < 55
          ? "te complex"
          : d.fleschNlScore > 75
          ? "te simpel"
          : "goed (60-70 = ideaal)",
    },
    {
      label: "Zinslengte",
      value: `${d.sentences.avgWords.toFixed(1)}w gem.`,
      tone: d.sentences.avgWords <= 15 ? "ok" : d.sentences.avgWords <= 20 ? "warn" : "bad",
      hint: `max ${d.sentences.maxWords}w · ${d.sentences.percentOver25Words.toFixed(0)}% > 25w`,
    },
    {
      label: "Keyword density",
      value: `${d.keywordDensityPct.toFixed(1)}%`,
      tone: d.keywordDensityPct >= 0.5 && d.keywordDensityPct <= 3 ? "ok" : "warn",
      hint:
        d.keywordDensityPct < 0.5
          ? "te weinig"
          : d.keywordDensityPct > 3
          ? "keyword-stuffing"
          : "binnen range",
    },
    {
      label: "Keyword in",
      value: (
        <span style={{ display: "inline-flex", gap: 4 }}>
          <KwPip on={kw.inTitle} label="Titel" />
          <KwPip on={kw.inIntro} label="Intro" />
          <KwPip on={kw.inSubheading} label="H2/H3" />
          <KwPip on={kw.inConclusion} label="Slot" />
        </span>
      ),
      tone:
        kw.inTitle && kw.inIntro && kw.inSubheading
          ? "ok"
          : kw.inTitle || kw.inIntro
          ? "warn"
          : "bad",
    },
    {
      label: "Intro-hook",
      value: `${intro.hookScore}/3`,
      tone: intro.hookScore >= 2 ? "ok" : intro.hookScore === 1 ? "warn" : "bad",
      hint: [
        intro.hasKeyword ? "✓ keyword" : "✗ keyword",
        intro.hasQuestion || intro.hasNumberHook ? "✓ hook" : "✗ hook",
        intro.addressesReader ? "✓ jij/u" : "✗ jij/u",
      ].join(" · "),
    },
    {
      label: "Ban-list / cliché",
      value: `${d.banlistHits} / ${result.deterministic.aiClicheDetails.length}`,
      tone:
        d.banlistHits === 0 && result.deterministic.aiClicheDetails.length === 0
          ? "ok"
          : d.banlistHits === 0
          ? "warn"
          : "bad",
      hint: d.banlistHitsPer1000Words > 0 ? `${d.banlistHitsPer1000Words.toFixed(1)} per 1k woorden` : undefined,
    },
    {
      label: "Trust-elementen",
      value: (
        <span style={{ display: "inline-flex", gap: 4 }}>
          <KwPip on={d.hasTldrBlock} label="TL;DR" />
          <KwPip on={d.hasCta} label="CTA" />
          <KwPip on={d.internalLinkCount > 0} label={`Int (${d.internalLinkCount})`} />
          <KwPip on={d.externalLinkCount > 0} label={`Ext (${d.externalLinkCount})`} />
        </span>
      ),
      tone: d.hasTldrBlock && d.hasCta && d.internalLinkCount > 0 ? "ok" : "warn",
    },
  ];

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Eye size={14} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Health-snapshot</span>
      </div>
      <div className="col" style={{ gap: 4, fontSize: 12.5 }}>
        {rows.map((r, i) => (
          <HealthRow key={i} {...r} />
        ))}
      </div>
    </div>
  );
}

function HealthRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "warn" | "bad";
  hint?: string;
}) {
  const color =
    tone === "ok"
      ? "var(--success, #047857)"
      : tone === "warn"
      ? "var(--warning, #b45309)"
      : tone === "bad"
      ? "var(--danger, #b91c1c)"
      : "var(--text)";
  const dot =
    tone === "ok" ? "●" : tone === "warn" ? "●" : tone === "bad" ? "●" : "○";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 8,
        alignItems: "center",
        padding: "5px 6px",
        borderRadius: 4,
        background: tone ? scoreColorSoft(tone === "ok" ? 8 : tone === "warn" ? 6 : 4) : "var(--surface-2)",
      }}
    >
      <span style={{ color, fontSize: 10 }}>{dot}</span>
      <div>
        <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
        {hint && <div className="muted" style={{ fontSize: 10.5 }}>{hint}</div>}
      </div>
      <div style={{ fontWeight: 600, color, textAlign: "right", fontSize: 12.5 }}>{value}</div>
    </div>
  );
}

function KwPip({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      title={label}
      style={{
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 10,
        background: on ? "rgba(4,120,87,0.14)" : "rgba(185,28,28,0.10)",
        color: on ? "var(--success, #047857)" : "var(--danger, #b91c1c)",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {on ? "✓" : "✗"} {label}
    </span>
  );
}

function IssueHeatmap({ issues }: { issues: AuditResultView["issues"] }) {
  const categories: Category[] = ["readability", "brand_voice", "seo", "structure", "originality", "factual"];
  const severities: Severity[] = ["error", "warning", "suggestion"];

  const matrix: Record<Category, Record<Severity, number>> = {} as never;
  for (const c of categories) {
    matrix[c] = { error: 0, warning: 0, suggestion: 0 };
  }
  for (const i of issues) {
    matrix[i.category][i.severity]++;
  }
  const max = Math.max(1, ...categories.flatMap((c) => severities.map((s) => matrix[c][s])));

  return (
    <div>
      <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 6 }}>
        <BarChart3 size={14} />
        <h4 style={{ margin: 0, fontSize: 14 }}>Issue-heatmap</h4>
        <span className="muted" style={{ fontSize: 11 }}>
          Waar zitten de problemen?
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px repeat(3, 1fr)",
          gap: 4,
          fontSize: 11,
        }}
      >
        <div />
        <div style={{ textAlign: "center", color: "#b91c1c", fontWeight: 600 }}>Errors</div>
        <div style={{ textAlign: "center", color: "#b45309", fontWeight: 600 }}>Warnings</div>
        <div style={{ textAlign: "center", color: "#2563eb", fontWeight: 600 }}>Suggesties</div>
        {categories.map((c) => (
          <React.Fragment key={c}>
            <div
              className="muted"
              style={{ textTransform: "capitalize", padding: "4px 6px", fontSize: 11.5 }}
            >
              {c.replace("_", " ")}
            </div>
            {severities.map((s) => {
              const n = matrix[c][s];
              const intensity = n / max;
              const colorMap: Record<Severity, string> = {
                error: "185,28,28",
                warning: "180,83,9",
                suggestion: "37,99,235",
              };
              return (
                <div
                  key={s}
                  style={{
                    textAlign: "center",
                    padding: "6px 4px",
                    borderRadius: 4,
                    background: n === 0 ? "var(--surface-2)" : `rgba(${colorMap[s]}, ${0.10 + intensity * 0.30})`,
                    color: n === 0 ? "var(--muted)" : `rgb(${colorMap[s]})`,
                    fontWeight: n > 0 ? 700 : 400,
                    fontSize: 12,
                  }}
                >
                  {n}
                </div>
              );
            })}
          </React.Fragment>
        ))}
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

// ---------------------------------------------------------------------------
// Insights tab — deeper deterministic analytics
// ---------------------------------------------------------------------------

function InsightsTab({ result }: { result: AuditResultView }) {
  const d = result.deterministic;
  return (
    <div className="col" style={{ gap: 16 }}>
      <IntroDeepDive intro={d.intro} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <SentenceRhythmPanel sentences={d.sentences} />
        <ParagraphDistributionPanel paragraphs={d.paragraphs} />
      </div>

      <KeywordSpreadPanel kw={d.keywordDistribution} density={d.keywordDensityPct} />

      {d.banlistDetails.length > 0 && (
        <PhraseHitsPanel
          title="Ban-list treffers (met context)"
          color="#b91c1c"
          icon={<AlertCircle size={14} />}
          hits={d.banlistDetails}
          emptyText=""
        />
      )}

      {d.aiClicheDetails.length > 0 && (
        <PhraseHitsPanel
          title="AI-clichés (met context)"
          color="#b45309"
          icon={<AlertTriangle size={14} />}
          hits={d.aiClicheDetails}
          emptyText=""
        />
      )}

      {d.sentences.longSentences.length > 0 && (
        <div>
          <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Quote size={14} style={{ color: "var(--warning, #b45309)" }} />
            <h4 style={{ margin: 0, fontSize: 14 }}>
              Lange zinnen ({d.sentences.longSentences.length})
            </h4>
            <span className="muted" style={{ fontSize: 11 }}>&gt; 25 woorden — kandidaten om te splitsen</span>
          </div>
          <div className="col" style={{ gap: 4 }}>
            {d.sentences.longSentences.map((s, idx) => (
              <div
                key={idx}
                style={{
                  padding: 8,
                  background: "var(--surface-2)",
                  borderLeft: "3px solid var(--warning, #b45309)",
                  borderRadius: 4,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                <span
                  className="badge"
                  style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    background: "rgba(180,83,9,0.16)",
                    color: "var(--warning, #b45309)",
                    borderRadius: 3,
                    marginRight: 6,
                  }}
                >
                  {s.wordCount}w
                </span>
                {s.sentence}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IntroDeepDive({ intro }: { intro: AuditResultView["deterministic"]["intro"] }) {
  const hookColor =
    intro.hookScore >= 2 ? "var(--success, #047857)" : intro.hookScore === 1 ? "var(--warning, #b45309)" : "var(--danger, #b91c1c)";
  return (
    <div
      style={{
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
      }}
    >
      <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Sparkles size={14} />
        <h4 style={{ margin: 0, fontSize: 14 }}>Intro-analyse</h4>
        <span className="muted" style={{ fontSize: 11 }}>
          De eerste alinea bepaalt 80% van scroll-doorgang
        </span>
        <span
          style={{
            marginLeft: "auto",
            padding: "2px 8px",
            borderRadius: 999,
            background: scoreColorSoft(intro.hookScore >= 2 ? 8 : intro.hookScore === 1 ? 6 : 4),
            color: hookColor,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Hook-score {intro.hookScore}/3
        </span>
      </div>
      <div
        style={{
          fontSize: 12.5,
          fontStyle: "italic",
          padding: 10,
          background: "var(--surface-2)",
          borderLeft: `3px solid ${hookColor}`,
          borderRadius: 4,
          lineHeight: 1.5,
          marginBottom: 8,
        }}
      >
        "{intro.text || "(geen intro gedetecteerd)"}"
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <KwPip on={intro.hasKeyword} label="keyword aanwezig" />
        <KwPip on={intro.hasQuestion} label="vraag-hook" />
        <KwPip on={intro.hasNumberHook} label="cijfer-hook" />
        <KwPip on={intro.addressesReader} label="spreekt lezer aan" />
        <span
          className="badge b-gray"
          style={{ padding: "1px 8px", borderRadius: 999, fontSize: 11 }}
        >
          {intro.wordCount} woorden
        </span>
      </div>
    </div>
  );
}

function SentenceRhythmPanel({ sentences }: { sentences: AuditResultView["deterministic"]["sentences"] }) {
  // Build a small bar chart of sentence-length buckets.
  const buckets = [
    { label: "≤ 8w", min: 0, max: 8, color: "#10b981" },
    { label: "9-15w", min: 9, max: 15, color: "#3b82f6" },
    { label: "16-25w", min: 16, max: 25, color: "#b45309" },
    { label: "> 25w", min: 26, max: Infinity, color: "#b91c1c" },
  ];
  // We don't have raw per-sentence counts, but we can approximate distribution
  // from longSentences + summary stats. For now: just show the key stats nicely.
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
      }}
    >
      <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Hash size={14} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Zinsritme</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
        <MicroStat label="Aantal" value={sentences.count.toString()} />
        <MicroStat label="Gemiddeld" value={`${sentences.avgWords.toFixed(1)}w`} />
        <MicroStat label="Mediaan" value={`${sentences.medianWords}w`} />
        <MicroStat label="Langste" value={`${sentences.maxWords}w`} />
        <MicroStat
          label="% > 25w"
          value={`${sentences.percentOver25Words.toFixed(0)}%`}
          tone={sentences.percentOver25Words > 15 ? "warn" : "ok"}
        />
        <MicroStat
          label="Variatie"
          value={sentences.maxWords - sentences.medianWords >= 8 ? "goed" : "vlak"}
          tone={sentences.maxWords - sentences.medianWords >= 8 ? "ok" : "warn"}
        />
      </div>
      <div className="muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
        Doel: gemiddeld ≤ 15w, &lt; 15% boven 25w, variatie ≥ 8w (korte +
        lange zinnen wisselen elkaar af voor ritme).
      </div>
      <div style={{ display: "none" }}>
        {/* buckets reserved for future per-sentence histogram */}
        {buckets.map((b) => b.label).join("")}
      </div>
    </div>
  );
}

function ParagraphDistributionPanel({ paragraphs }: { paragraphs: AuditResultView["deterministic"]["paragraphs"] }) {
  const total = paragraphs.count;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  // Sparkline of paragraph lengths (capped at 100w for visual scale).
  const max = Math.max(20, ...paragraphs.lengths);
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
      }}
    >
      <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
        <FileText size={14} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Paragraaf-balans</span>
        <span className="muted" style={{ fontSize: 11 }}>({total} alinea's)</span>
      </div>
      {total === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>Geen &lt;p&gt; tags gedetecteerd.</div>
      ) : (
        <>
          {/* Stacked bar */}
          <div
            style={{
              display: "flex",
              height: 14,
              borderRadius: 7,
              overflow: "hidden",
              border: "1px solid var(--border)",
              marginBottom: 8,
            }}
            title={`Kort < 30w · Mid 30-80w · Lang > 80w`}
          >
            {paragraphs.short > 0 && (
              <div
                style={{ width: `${pct(paragraphs.short)}%`, background: "#10b981" }}
                title={`${paragraphs.short} korte alinea's (${pct(paragraphs.short)}%)`}
              />
            )}
            {paragraphs.medium > 0 && (
              <div
                style={{ width: `${pct(paragraphs.medium)}%`, background: "#3b82f6" }}
                title={`${paragraphs.medium} medium alinea's (${pct(paragraphs.medium)}%)`}
              />
            )}
            {paragraphs.long > 0 && (
              <div
                style={{ width: `${pct(paragraphs.long)}%`, background: "#b45309" }}
                title={`${paragraphs.long} lange alinea's (${pct(paragraphs.long)}%)`}
              />
            )}
          </div>
          <div className="row" style={{ gap: 6, fontSize: 11, flexWrap: "wrap" }}>
            <LegendDot color="#10b981" label={`${paragraphs.short} kort`} />
            <LegendDot color="#3b82f6" label={`${paragraphs.medium} mid`} />
            <LegendDot color="#b45309" label={`${paragraphs.long} lang`} />
            <span className="muted" style={{ marginLeft: "auto" }}>
              gem. {paragraphs.avgWords}w
            </span>
          </div>

          {/* Lengths sparkline */}
          {paragraphs.lengths.length > 0 && (
            <svg
              width="100%"
              height={36}
              viewBox={`0 0 ${Math.max(40, paragraphs.lengths.length * 6)} 36`}
              preserveAspectRatio="none"
              style={{ marginTop: 8 }}
            >
              {paragraphs.lengths.map((len, i) => {
                const h = Math.max(2, Math.min(34, (len / max) * 34));
                const color = len < 30 ? "#10b981" : len <= 80 ? "#3b82f6" : "#b45309";
                return (
                  <rect
                    key={i}
                    x={i * 6}
                    y={36 - h}
                    width={4}
                    height={h}
                    fill={color}
                    opacity={0.8}
                  >
                    <title>Alinea {i + 1}: {len}w</title>
                  </rect>
                );
              })}
            </svg>
          )}

          {paragraphs.long >= 3 && (
            <div
              style={{
                marginTop: 8,
                padding: 6,
                background: "rgba(180,83,9,0.10)",
                borderRadius: 4,
                fontSize: 11.5,
                color: "var(--warning, #b45309)",
              }}
            >
              {paragraphs.long} alinea's &gt; 80 woorden — overweeg te splitsen voor scanbaarheid.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KeywordSpreadPanel({
  kw,
  density,
}: {
  kw: AuditResultView["deterministic"]["keywordDistribution"];
  density: number;
}) {
  const slots: { label: string; on: boolean; key: string }[] = [
    { key: "title", label: "Titel / H1", on: kw.inTitle },
    { key: "intro", label: "Intro (eerste 200w)", on: kw.inIntro },
    { key: "h2h3", label: "Subheadings", on: kw.inSubheading },
    { key: "conclusion", label: "Slot (laatste 200w)", on: kw.inConclusion },
  ];
  const onCount = slots.filter((s) => s.on).length;
  const tone: "ok" | "warn" | "bad" = onCount >= 3 ? "ok" : onCount >= 2 ? "warn" : "bad";
  const toneColor =
    tone === "ok" ? "var(--success, #047857)" : tone === "warn" ? "var(--warning, #b45309)" : "var(--danger, #b91c1c)";

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
      }}
    >
      <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Target size={14} style={{ color: toneColor }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Keyword-spreiding</span>
        <span className="muted" style={{ fontSize: 11 }}>
          {kw.total}× in tekst · {density.toFixed(1)}% density
        </span>
        <span
          style={{
            marginLeft: "auto",
            padding: "2px 8px",
            borderRadius: 999,
            background: scoreColorSoft(tone === "ok" ? 8 : tone === "warn" ? 6 : 4),
            color: toneColor,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {onCount}/4 plekken
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {slots.map((s) => (
          <div
            key={s.key}
            style={{
              padding: 8,
              borderRadius: 6,
              border: `1px solid ${s.on ? "rgba(4,120,87,0.30)" : "rgba(185,28,28,0.20)"}`,
              background: s.on ? "rgba(4,120,87,0.06)" : "rgba(185,28,28,0.04)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: s.on ? "var(--success, #047857)" : "var(--danger, #b91c1c)",
              }}
            >
              {s.on ? "✓" : "✗"}
            </div>
            <div className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
      {kw.headingsWithKeyword.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11.5 }}>
          <span className="muted">Headings met keyword: </span>
          {kw.headingsWithKeyword.map((h, i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                padding: "1px 6px",
                marginRight: 4,
                marginTop: 2,
                background: "rgba(4,120,87,0.10)",
                color: "var(--success, #047857)",
                borderRadius: 999,
                fontSize: 11,
              }}
            >
              {h}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PhraseHitsPanel({
  title,
  color,
  icon,
  hits,
  emptyText,
}: {
  title: string;
  color: string;
  icon: React.ReactNode;
  hits: AuditResultView["deterministic"]["banlistDetails"];
  emptyText: string;
}) {
  if (hits.length === 0 && !emptyText) return null;
  return (
    <div>
      <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ color }}>{icon}</span>
        <h4 style={{ margin: 0, fontSize: 14 }}>{title}</h4>
        <span className="muted" style={{ fontSize: 11 }}>{hits.length} treffer(s)</span>
      </div>
      {hits.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>{emptyText}</div>
      ) : (
        <div className="col" style={{ gap: 4 }}>
          {hits.map((h, i) => (
            <div
              key={i}
              style={{
                padding: 8,
                background: "var(--surface)",
                border: `1px solid ${color}33`,
                borderRadius: 4,
                fontSize: 12.5,
                lineHeight: 1.5,
              }}
            >
              <span
                className="badge mono"
                style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  background: `${color}1a`,
                  color,
                  borderRadius: 3,
                  marginRight: 6,
                  fontWeight: 600,
                }}
              >
                {h.term}
              </span>
              <span style={{ color: "var(--muted)" }}>{h.context}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MicroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "warn" | "bad";
}) {
  const color =
    tone === "ok"
      ? "var(--success, #047857)"
      : tone === "warn"
      ? "var(--warning, #b45309)"
      : tone === "bad"
      ? "var(--danger, #b91c1c)"
      : "var(--text)";
  return (
    <div
      style={{
        padding: "6px 8px",
        background: "var(--surface-2)",
        borderRadius: 4,
      }}
    >
      <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Issues tab — filter chips + impact bars
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
  const [categoryFilter, setCategoryFilter] = React.useState<Set<Category> | null>(null);
  const [sortBy, setSortBy] = React.useState<"priority" | "impact">("priority");

  const visible = React.useMemo(() => {
    const list = result.issues
      .filter((i) => severityFilter.has(i.severity))
      .filter((i) => categoryFilter === null || categoryFilter.has(i.category));
    return list.sort((a, b) =>
      sortBy === "priority"
        ? a.priority - b.priority
        : (b.estimated_score_lift ?? 0) - (a.estimated_score_lift ?? 0)
    );
  }, [result.issues, severityFilter, categoryFilter, sortBy]);

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

  const maxLift = React.useMemo(
    () => Math.max(0.1, ...result.issues.map((i) => i.estimated_score_lift ?? 0)),
    [result.issues]
  );

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
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 11 }}>Sort:</span>
            <FilterChip
              active={sortBy === "priority"}
              onClick={() => setSortBy("priority")}
              label="Prioriteit"
            />
            <FilterChip
              active={sortBy === "impact"}
              onClick={() => setSortBy("impact")}
              label="Impact"
            />
          </div>
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
          <IssueRow key={i} issue={issue} maxLift={maxLift} onApplyRewrite={onApplyRewrite} />
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
  maxLift,
  onApplyRewrite,
}: {
  issue: AuditResultView["issues"][0];
  maxLift: number;
  onApplyRewrite: (quote: string, rewrite: string) => void;
}) {
  const sev = issue.severity;
  const Icon = sev === "error" ? AlertCircle : sev === "warning" ? AlertTriangle : Lightbulb;
  const color = sev === "error" ? "var(--danger, #b91c1c)" : sev === "warning" ? "var(--warning, #b45309)" : "var(--info, #2563eb)";
  const canApply = !!issue.quote && !!issue.suggested_rewrite;
  const lift = issue.estimated_score_lift ?? 0;
  const liftPct = Math.max(0, Math.min(100, (lift / maxLift) * 100));

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
          {lift > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                color: "var(--success, #047857)",
              }}
              title="Geschatte stijging van de gewogen score wanneer dit issue fixed wordt"
            >
              <span style={{ fontWeight: 700 }}>+{lift.toFixed(1)}</span>
              <span
                style={{
                  width: 40,
                  height: 5,
                  borderRadius: 3,
                  background: "rgba(0,0,0,0.06)",
                  overflow: "hidden",
                  display: "inline-block",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: `${liftPct}%`,
                    height: "100%",
                    background: "var(--success, #047857)",
                  }}
                />
              </span>
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
// Rewrite tab
// ---------------------------------------------------------------------------

function RewriteTab({
  rewrite,
  loading,
  onGenerate,
  issuesCount,
}: {
  rewrite: { improvedHtml: string; changeLog: string[] } | null;
  loading: boolean;
  onGenerate: () => void;
  issuesCount: number;
}) {
  if (!rewrite) {
    return (
      <div
        style={{
          padding: 28,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Wand2 size={28} style={{ color: "var(--secondary, #3b82f6)", opacity: 0.7 }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          Genereer een volledig herschreven versie
        </div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 520 }}>
          De auditor heeft {issuesCount} {issuesCount === 1 ? "issue" : "issues"} gevonden. Klik
          hieronder om een aparte rewriter-agent de blog te laten herschrijven op basis van die
          kritiek + je brand voice + ban list. Dit kost extra LLM-credits (~€0,02) en duurt
          15-30 seconden.
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onGenerate}
          disabled={loading || issuesCount === 0}
        >
          {loading ? (
            <>
              <RefreshCw size={14} className="spin" /> AI herschrijft…
            </>
          ) : (
            <>
              <Wand2 size={14} /> Genereer verbeterde versie
            </>
          )}
        </button>
      </div>
    );
  }
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Volledige herschreven versie die alle errors + meeste warnings adresseert. Plak terug
          in je editor of WP.
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onGenerate}
            disabled={loading}
            title="Opnieuw genereren (overschrijft huidige versie)"
          >
            {loading ? (
              <>
                <RefreshCw size={13} className="spin" /> Bezig…
              </>
            ) : (
              <>
                <RefreshCw size={13} /> Opnieuw
              </>
            )}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => copyToClipboard(rewrite.improvedHtml, "Verbeterde versie")}
          >
            <CheckCircle2 size={14} /> Kopieer
          </button>
        </div>
      </div>
      {rewrite.changeLog.length > 0 && (
        <div
          style={{
            padding: 10,
            background: "linear-gradient(135deg, rgba(59,130,246,0.06), rgba(99,102,241,0.05))",
            border: "1px solid rgba(59,130,246,0.20)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Wat is er aangepast</div>
          <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.55 }}>
            {rewrite.changeLog.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
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
        {rewrite.improvedHtml}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlighted preview (used by Overview)
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

// Unused-but-exported keeps `Clock`/`TypeIcon` imports referenced for future
// stat additions without dead-import noise — strip if not needed.
const _keepImports = { Clock, TypeIcon };
void _keepImports;
