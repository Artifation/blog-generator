"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Sparkles, Trash2, X, RefreshCw, ExternalLink, Wand2, Check, Pencil, FileText, AlertTriangle, RotateCcw, Search, ChevronDown, Clock, XCircle, CheckCircle, MoreHorizontal } from "lucide-react";
import { createTopicAction, deleteTopicAction, updateTopicAction } from "~/lib/actions/topics";
import { generateForTopicAction } from "~/lib/actions/generate";
import { suggestTopicsAction, acceptTopicProposalsAction, type TopicProposalView } from "~/lib/actions/suggest-topics";
import { RequiredBadge, OptionalBadge, FieldHelp } from "~/components/ui/form-help";

type Pillar = { slug: string; name: string };

function sourceBadge(source: TopicProposalView["source"]): React.ReactNode {
  switch (source) {
    case "gsc_striking_distance":
      return <span className="badge b-green" title="GSC: positie 8-20, kans op page 1">📈 striking distance</span>;
    case "gsc_unmapped_query":
      return <span className="badge b-green" title="GSC: query waar geen topic over gaat — content gap">🎯 content gap</span>;
    case "gsc_rising_query":
      return <span className="badge b-green" title="GSC: impressies stijgen tussen windows">⬆ stijgende query</span>;
    case "competitor_sitemap":
      return <span className="badge b-gray" title="Nieuw artikel bij concurrent">👀 competitor</span>;
    case "dataforseo_keyword_idea":
      return <span className="badge b-blue" title="DataForSEO: echte maandelijkse search volume + difficulty">💎 DFS keyword</span>;
    case "manual":
    default:
      return null;
  }
}

interface TopicRow {
  id: string;
  title: string;
  targetKeyword: string;
  pillarSlug: string;
  intent: "informational" | "commercial" | "transactional";
  status: string;
  intendedWordCount: number;
  priority: number;
  rejectReason: string | null;
  publishedUrl: string | null;
  customInstructions: string | null;
  updatedAt: string;
  latestDraft: { id: string; status: string; createdAt: string } | null;
}

const STUCK_AFTER_MS = 60 * 60 * 1000; // 1 uur

type EffectiveState =
  | "queued"
  | "running"
  | "awaiting_review"
  | "draft_rejected"
  | "stuck"
  | "published"
  | "rejected";

function deriveState(t: TopicRow, now: number): EffectiveState {
  if (t.status === "rejected") return "rejected";
  if (t.status === "published") return "published";
  if (t.status === "queued") return "queued";
  // status === "in_progress"
  if (t.latestDraft) {
    if (t.latestDraft.status === "published") return "published";
    if (t.latestDraft.status === "pending_review") return "awaiting_review";
    if (t.latestDraft.status === "rejected") return "draft_rejected";
    return "running";
  }
  const age = now - new Date(t.updatedAt).getTime();
  return age > STUCK_AFTER_MS ? "stuck" : "running";
}

type SectionDef = {
  state: EffectiveState;
  label: string;
  sub: string;
  iconBg: string;
  iconColor: string;
  Icon: React.ComponentType<{ size?: number }>;
};

const SECTIONS: SectionDef[] = [
  {
    state: "awaiting_review",
    label: "Draft op review",
    sub: "Pipeline is klaar, wacht op jouw goedkeuring",
    iconBg: "rgba(59,130,246,0.10)",
    iconColor: "var(--secondary)",
    Icon: FileText,
  },
  {
    state: "stuck",
    label: "Vastgelopen",
    sub: "In_progress > 1u zonder draft — pipeline is gecrasht of nooit gestart",
    iconBg: "rgba(220,38,38,0.10)",
    iconColor: "#b91c1c",
    Icon: AlertTriangle,
  },
  {
    state: "draft_rejected",
    label: "Draft afgewezen",
    sub: "Pipeline heeft draft afgewezen — bekijk in /drafts",
    iconBg: "rgba(220,38,38,0.10)",
    iconColor: "#b91c1c",
    Icon: XCircle,
  },
  {
    state: "running",
    label: "Pipeline draait",
    sub: "Generatie loopt op dit moment",
    iconBg: "var(--warning-bg)",
    iconColor: "#b45309",
    Icon: RefreshCw,
  },
  {
    state: "queued",
    label: "Queued",
    sub: "Klaar om door de pipeline gepakt te worden",
    iconBg: "var(--surface-3)",
    iconColor: "var(--text-muted)",
    Icon: Clock,
  },
  {
    state: "rejected",
    label: "Afgewezen",
    sub: "Topic afgewezen — bewerk of genereer opnieuw",
    iconBg: "rgba(220,38,38,0.10)",
    iconColor: "#b91c1c",
    Icon: XCircle,
  },
  {
    state: "published",
    label: "Gepubliceerd",
    sub: "Topic heeft een live post",
    iconBg: "var(--success-bg)",
    iconColor: "var(--success)",
    Icon: CheckCircle,
  },
];

const ROWS_BEFORE_TRUNCATE = 10;

export function TopicsKanban({
  siteSlug,
  pillars,
  topics,
}: {
  siteSlug: string;
  pillars: Pillar[];
  topics: TopicRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<TopicRow | null>(null);
  const [generating, setGenerating] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<TopicProposalView[] | null>(null);
  const [suggesting, setSuggesting] = React.useState(false);
  const [suggestDialogOpen, setSuggestDialogOpen] = React.useState(false);
  // Snapshot once per render — used for stuck detection. Re-renders after any
  // mutation, so age stays current enough for the >1u threshold.
  const now = Date.now();

  const [query, setQuery] = React.useState("");
  // Active filter: empty = show all sections; non-empty = show only listed
  const [activeStates, setActiveStates] = React.useState<Set<EffectiveState>>(new Set());
  const [collapsed, setCollapsed] = React.useState<Set<EffectiveState>>(new Set());
  const [showAllFor, setShowAllFor] = React.useState<Set<EffectiveState>>(new Set());

  function toggleSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function resetToQueued(t: TopicRow) {
    const r = await updateTopicAction(t.id, { status: "queued", rejectReason: null });
    if (r.ok) {
      toast.success("Topic teruggezet op queued");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  async function suggestWithPrompt(customPrompt: string) {
    setSuggestDialogOpen(false);
    setSuggesting(true);
    const tid = toast.loading(
      customPrompt
        ? "AI denkt 5 topics uit op basis van je instructie…"
        : "AI denkt 5 topics uit op basis van je voice + pillars…"
    );
    const res = await suggestTopicsAction(5, customPrompt || undefined);
    toast.dismiss(tid);
    setSuggesting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSuggestions(res.proposals);
  }

  async function generate(t: TopicRow) {
    setGenerating(t.id);
    const tid = toast.loading(`Pipeline draait voor "${t.title}" — duurt 1–3 minuten…`);
    const result = await generateForTopicAction(siteSlug, t.id);
    setGenerating(null);
    toast.dismiss(tid);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.verdict === "published" && result.draftId) {
      toast.success("Draft klaar voor review");
      router.push(`/drafts/${result.draftId}`);
    } else if (result.verdict === "rejected") {
      toast.warning(`Draft afgewezen: ${result.reason ?? "onder drempel"}`);
      router.refresh();
    } else {
      toast.error(`Pipeline-fout: ${result.reason ?? "onbekend"}`);
      router.refresh();
    }
  }

  async function remove(t: TopicRow) {
    if (!confirm("Topic verwijderen?")) return;
    await deleteTopicAction(siteSlug, t.id);
    router.refresh();
  }

  return (
    <div>
      <div className="page-head">
        <div className="ph-text">
          <h1>Topics</h1>
          <div className="ph-sub">
            De pipeline pakt het topic met de hoogste prioriteit. Je kunt ook handmatig een
            topic draaien.
          </div>
        </div>
        <div className="ph-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSuggestDialogOpen(true)}
            disabled={suggesting}
          >
            {suggesting ? (
              <>
                <RefreshCw size={13} className="spin" /> AI denkt…
              </>
            ) : (
              <>
                <Wand2 size={13} /> AI-suggesties
              </>
            )}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={14} /> Nieuw topic
          </button>
        </div>
      </div>

      {(() => {
        const q = query.trim().toLowerCase();
        const matchesSearch = (t: TopicRow): boolean => {
          if (!q) return true;
          return (
            t.title.toLowerCase().includes(q) ||
            t.targetKeyword.toLowerCase().includes(q) ||
            (pillars.find((p) => p.slug === t.pillarSlug)?.name.toLowerCase().includes(q) ?? false)
          );
        };

        // Group all topics by state (for chip counts — independent of search/filter)
        const allByState = new Map<EffectiveState, TopicRow[]>();
        for (const t of topics) {
          const s = deriveState(t, now);
          if (!allByState.has(s)) allByState.set(s, []);
          allByState.get(s)!.push(t);
        }

        // Group filtered (search + state filter) topics
        const filteredByState = new Map<EffectiveState, TopicRow[]>();
        const stateFilterActive = activeStates.size > 0;
        for (const t of topics) {
          if (!matchesSearch(t)) continue;
          const s = deriveState(t, now);
          if (stateFilterActive && !activeStates.has(s)) continue;
          if (!filteredByState.has(s)) filteredByState.set(s, []);
          filteredByState.get(s)!.push(t);
        }

        const totalAll = topics.length;
        const totalShown = Array.from(filteredByState.values()).reduce((a, b) => a + b.length, 0);
        const sectionsToRender = SECTIONS.filter((s) => (filteredByState.get(s.state)?.length ?? 0) > 0);

        return (
          <>
            <div className="topics-toolbar">
              <div className="topics-search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder={`Zoek in ${totalAll} topic${totalAll === 1 ? "" : "s"} — titel, keyword, pillar…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Zoek topics"
                />
                {query && (
                  <button
                    type="button"
                    className="clear-btn"
                    onClick={() => setQuery("")}
                    aria-label="Wis zoekopdracht"
                    title="Wis"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="topics-filters">
                <button
                  type="button"
                  className={`tfilter${activeStates.size === 0 ? " active" : ""}`}
                  onClick={() => setActiveStates(new Set())}
                  title="Toon alle states"
                >
                  Alle
                  <span className="tf-count">{totalAll}</span>
                </button>
                {SECTIONS.map((s) => {
                  const count = allByState.get(s.state)?.length ?? 0;
                  if (count === 0) return null;
                  const active = activeStates.has(s.state);
                  return (
                    <button
                      key={s.state}
                      type="button"
                      className={`tfilter${active ? " active" : ""}`}
                      onClick={() => toggleSet(setActiveStates, s.state)}
                      title={s.sub}
                    >
                      <s.Icon size={12} />
                      {s.label}
                      <span className="tf-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {totalShown === 0 ? (
              <div className="topics-empty">
                <h3>Geen topics gevonden</h3>
                <p>
                  {query
                    ? `Geen match voor "${query}" in de huidige filters.`
                    : "Geen topics in de geselecteerde states."}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setQuery("");
                    setActiveStates(new Set());
                  }}
                >
                  Reset filters
                </button>
              </div>
            ) : (
              sectionsToRender.map((sec) => {
                const rows = filteredByState.get(sec.state)!;
                const isCollapsed = collapsed.has(sec.state);
                const showAll = showAllFor.has(sec.state);
                const visible = showAll ? rows : rows.slice(0, ROWS_BEFORE_TRUNCATE);
                const hidden = rows.length - visible.length;
                return (
                  <section
                    key={sec.state}
                    className={`topic-section${isCollapsed ? " collapsed" : ""}`}
                  >
                    <header
                      className="topic-section-head"
                      onClick={() => toggleSet(setCollapsed, sec.state)}
                      role="button"
                      aria-expanded={!isCollapsed}
                    >
                      <span
                        className="ts-icon"
                        style={{ background: sec.iconBg, color: sec.iconColor }}
                      >
                        <sec.Icon size={14} />
                      </span>
                      <span className="ts-title">{sec.label}</span>
                      <span className="ts-count">{rows.length}</span>
                      <span className="ts-sub">{sec.sub}</span>
                      <ChevronDown size={16} className="ts-chev" />
                    </header>
                    {!isCollapsed && (
                      <div className="topic-section-body">
                        {visible.map((t) => {
                          const pillar = pillars.find((p) => p.slug === t.pillarSlug);
                          const state = sec.state;
                          return (
                            <div key={t.id} className="trow">
                              <div className="trow-main">
                                <div className="trow-title" title={t.title}>
                                  {t.title}
                                </div>
                                <div className="trow-meta">
                                  {pillar && <span className="badge b-navy">{pillar.name}</span>}
                                  <span className="mono">{t.targetKeyword}</span>
                                  <span>·</span>
                                  <span>{t.intendedWordCount}w</span>
                                  <span>·</span>
                                  <span>{t.intent}</span>
                                  {t.priority > 0 && (
                                    <>
                                      <span>·</span>
                                      <span title="Prioriteit">P{t.priority}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="trow-actions">
                                {(state === "awaiting_review" || state === "draft_rejected") &&
                                  t.latestDraft && (
                                    <Link
                                      href={`/drafts/${t.latestDraft.id}`}
                                      className="btn btn-primary btn-sm"
                                    >
                                      <FileText size={11} /> Open draft
                                    </Link>
                                  )}
                                {state === "stuck" && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => resetToQueued(t)}
                                    disabled={generating !== null}
                                    title="Zet topic terug op queued"
                                  >
                                    <RotateCcw size={11} /> Reset
                                  </button>
                                )}
                                {(state === "queued" || state === "rejected") && (
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => generate(t)}
                                    disabled={generating !== null}
                                  >
                                    {generating === t.id ? (
                                      <>
                                        <RefreshCw size={11} className="spin" /> Draait…
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles size={11} /> Genereer
                                      </>
                                    )}
                                  </button>
                                )}
                                {state === "published" && t.publishedUrl && (
                                  <a
                                    href={t.publishedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-secondary btn-sm"
                                  >
                                    Bekijk <ExternalLink size={11} />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  className="icon-btn"
                                  onClick={() => setEditing(t)}
                                  disabled={generating !== null}
                                  aria-label="Bewerk topic"
                                  title="Bewerken"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  onClick={() => remove(t)}
                                  disabled={generating !== null}
                                  aria-label="Verwijder"
                                  title="Verwijderen"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              {state === "rejected" && t.rejectReason && (
                                <div className="trow-reject-reason">
                                  <strong>Reden:</strong> {t.rejectReason}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {hidden > 0 && (
                          <div className="topic-section-more">
                            <button
                              type="button"
                              onClick={() => toggleSet(setShowAllFor, sec.state)}
                            >
                              Toon alle {rows.length}
                            </button>
                          </div>
                        )}
                        {showAll && rows.length > ROWS_BEFORE_TRUNCATE && (
                          <div className="topic-section-more">
                            <button
                              type="button"
                              onClick={() => toggleSet(setShowAllFor, sec.state)}
                            >
                              Toon minder
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })
            )}
          </>
        );
      })()}

      {adding && (
        <AddTopicModal
          siteSlug={siteSlug}
          pillars={pillars}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}

      {editing && (
        <EditTopicModal
          topic={editing}
          pillars={pillars}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {suggestDialogOpen && (
        <SuggestPromptDialog
          onClose={() => setSuggestDialogOpen(false)}
          onSubmit={(prompt) => suggestWithPrompt(prompt)}
        />
      )}

      {suggestions && (
        <SuggestionsModal
          siteSlug={siteSlug}
          pillars={pillars}
          proposals={suggestions}
          onClose={() => setSuggestions(null)}
          onAdded={(count) => {
            setSuggestions(null);
            toast.success(`${count} topic${count === 1 ? "" : "s"} toegevoegd aan de queue`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function SuggestPromptDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = React.useState("");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,27,59,0.4)",
        backdropFilter: "blur(2px)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(92vw, 560px)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="card-header">
          <div>
            <h3>AI-suggesties genereren</h3>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Optioneel: geef een specifieke instructie mee. Leeg laten = brede voorstellen
              op basis van je voice + pillars.
            </div>
          </div>
          <button type="button" className="icon-btn card-action" onClick={onClose} aria-label="Sluit">
            <X size={16} />
          </button>
        </div>
        <div className="card-body col" style={{ gap: 12 }}>
          <div className="field">
            <label>
              <span>Specifieke instructie</span>
              <OptionalBadge />
            </label>
            <textarea
              className="textarea"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Bijv: bedenk 5 topics rond AI-implementatie voor advocatenkantoren, focus Q3 — of: vergelijkingen tussen ChatGPT en Claude voor specifieke MKB-use-cases — of: leg uit met casussen, geen generieke 'wat is X'."
              autoFocus
            />
            <FieldHelp>
              Vrij tekstveld. De AI volgt dit strikt bovenop je brand voice + pillars
              + (optioneel) DataForSEO data. Laat leeg → klik "Brede voorstellen" voor
              de standaardgenerator.
            </FieldHelp>
          </div>
        </div>
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--surface-2)",
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onSubmit("")}
            title="Genereer breed (zonder specifieke instructie)"
          >
            Brede voorstellen
          </button>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuleer
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSubmit(prompt.trim())}
              disabled={!prompt.trim()}
            >
              <Wand2 size={13} /> Genereer met instructie
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddTopicModal({
  siteSlug,
  pillars,
  onClose,
  onCreated,
}: {
  siteSlug: string;
  pillars: Pillar[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [keyword, setKeyword] = React.useState("");
  const [pillarSlug, setPillarSlug] = React.useState(pillars[0]?.slug ?? "");
  const [intent, setIntent] = React.useState<"informational" | "commercial" | "transactional">(
    "informational"
  );
  const [wordCount, setWordCount] = React.useState(1500);
  const [priority, setPriority] = React.useState(0);
  const [customInstructions, setCustomInstructions] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    if (!title.trim() || !keyword.trim()) {
      toast.error("Titel en target keyword zijn verplicht");
      return;
    }
    setSaving(true);
    const r = await createTopicAction(siteSlug, {
      title: title.trim(),
      targetKeyword: keyword.trim(),
      pillarSlug,
      intent,
      intendedWordCount: wordCount,
      priority,
      customInstructions: customInstructions.trim() || undefined,
    });
    setSaving(false);
    if (r.ok) {
      toast.success("Topic toegevoegd");
      onCreated();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,27,59,0.4)", backdropFilter: "blur(2px)", display: "grid", placeItems: "center", zIndex: 50 }}>
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(92vw, 520px)", maxHeight: "88vh", overflow: "hidden", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="card-header">
          <h3>Nieuw topic</h3>
          <button type="button" className="icon-btn card-action" onClick={onClose} aria-label="Sluit">
            <X size={16} />
          </button>
        </div>
        <div className="card-body col" style={{ gap: 12 }}>
          <div className="field">
            <label>
              <span>Werktitel</span>
              <RequiredBadge />
            </label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="De complete gids voor AI in MKB"
            />
            <FieldHelp>
              Werktitel — de strategist mag deze herschrijven naar een sterker
              H1-voorstel. Houd 'm beschrijvend (niet clickbait).
            </FieldHelp>
          </div>
          <div className="field">
            <label>
              <span>Target keyword</span>
              <RequiredBadge />
            </label>
            <input
              className="input"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ai voor mkb"
            />
            <FieldHelp>
              Focus keyword — de hoofdterm waar deze blog op moet ranken. Long-tail
              werkt vaak beter dan brede termen (bv. "ai-implementatie advocatenkantoor"
              ipv "ai").
            </FieldHelp>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>
                <span>Pillar</span>
                <RequiredBadge />
              </label>
              <select
                className="select"
                value={pillarSlug}
                onChange={(e) => setPillarSlug(e.target.value)}
              >
                {pillars.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
              <FieldHelp>Onder welk content-thema valt dit topic.</FieldHelp>
            </div>
            <div className="field">
              <label>
                <span>Intent</span>
                <RequiredBadge />
              </label>
              <select
                className="select"
                value={intent}
                onChange={(e) => setIntent(e.target.value as typeof intent)}
              >
                <option value="informational">Informational</option>
                <option value="commercial">Commercial</option>
                <option value="transactional">Transactional</option>
              </select>
              <FieldHelp>
                Informational = uitleg/gids. Commercial = vergelijking/keuze.
                Transactional = direct kopen/aanmelden.
              </FieldHelp>
            </div>
            <div className="field">
              <label>
                <span>Woorden</span>
                <OptionalBadge />
              </label>
              <input
                className="input"
                type="number"
                min={500}
                max={5000}
                step={100}
                value={wordCount}
                onChange={(e) => setWordCount(Number(e.target.value) || 1500)}
              />
              <FieldHelp>
                Doel-lengte. Default 1500. Informational mag 2000-2500;
                commercial/transactional 750-1000.
              </FieldHelp>
            </div>
          </div>
          <div className="field">
            <label>
              <span>Prioriteit</span>
              <OptionalBadge />
            </label>
            <input
              className="input"
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
            <FieldHelp>
              Hogere getallen worden eerder gepakt door de pipeline. Default 0
              (FIFO). Gebruik 5-10 voor urgente topics.
            </FieldHelp>
          </div>
          <div className="field">
            <label>
              <span>Custom instructies</span>
              <OptionalBadge />
            </label>
            <textarea
              className="textarea"
              rows={4}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Bijv: focus op compliance-aspect, noem ons product X, gebruik casus van klant Y, doelgroep advocatenkantoren..."
            />
            <FieldHelp>
              Vrij tekstveld dat de strategist + writer meekrijgen. Gebruik voor
              brand- of klant-specifieke vragen die niet uit titel/keyword volgen
              (focus, casussen, te vermijden onderwerpen, specifieke doelgroep).
            </FieldHelp>
          </div>
        </div>
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            background: "var(--surface-2)",
          }}
        >
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuleer
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Toevoegen..." : "Topic toevoegen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditTopicModal({
  topic,
  pillars,
  onClose,
  onSaved,
}: {
  topic: TopicRow;
  pillars: Pillar[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState(topic.title);
  const [keyword, setKeyword] = React.useState(topic.targetKeyword);
  const [pillarSlug, setPillarSlug] = React.useState(topic.pillarSlug);
  const [intent, setIntent] = React.useState<"informational" | "commercial" | "transactional">(
    topic.intent
  );
  const [wordCount, setWordCount] = React.useState(topic.intendedWordCount);
  const [priority, setPriority] = React.useState(topic.priority);
  const [customInstructions, setCustomInstructions] = React.useState(topic.customInstructions ?? "");
  const [resetStatus, setResetStatus] = React.useState(topic.status === "rejected");
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    if (!title.trim() || !keyword.trim()) {
      toast.error("Titel en target keyword zijn verplicht");
      return;
    }
    setSaving(true);
    const r = await updateTopicAction(topic.id, {
      title: title.trim(),
      targetKeyword: keyword.trim(),
      pillarSlug,
      intent,
      intendedWordCount: wordCount,
      priority,
      customInstructions: customInstructions.trim() || null,
      // Only set status when resetting — otherwise leave whatever it currently is.
      ...(resetStatus && topic.status === "rejected"
        ? { status: "queued" as const, rejectReason: null }
        : {}),
    });
    setSaving(false);
    if (r.ok) {
      toast.success(
        resetStatus && topic.status === "rejected"
          ? "Topic bijgewerkt + status terug naar queued"
          : "Topic bijgewerkt"
      );
      onSaved();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(11,27,59,0.4)", backdropFilter: "blur(2px)", display: "grid", placeItems: "center", zIndex: 50 }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(92vw, 520px)", maxHeight: "88vh", overflow: "hidden", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="card-header">
          <h3>Topic bewerken</h3>
          <button type="button" className="icon-btn card-action" onClick={onClose} aria-label="Sluit">
            <X size={16} />
          </button>
        </div>
        <div className="card-body col" style={{ gap: 12, overflowY: "auto" }}>
          <div className="field">
            <label>
              <span>Werktitel</span>
              <RequiredBadge />
            </label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>
              <span>Target keyword</span>
              <RequiredBadge />
            </label>
            <input className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>
                <span>Pillar</span>
                <RequiredBadge />
              </label>
              <select className="select" value={pillarSlug} onChange={(e) => setPillarSlug(e.target.value)}>
                {pillars.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                <span>Intent</span>
                <RequiredBadge />
              </label>
              <select className="select" value={intent} onChange={(e) => setIntent(e.target.value as typeof intent)}>
                <option value="informational">Informational</option>
                <option value="commercial">Commercial</option>
                <option value="transactional">Transactional</option>
              </select>
            </div>
            <div className="field">
              <label>
                <span>Woorden</span>
                <OptionalBadge />
              </label>
              <input
                className="input"
                type="number"
                min={500}
                max={5000}
                step={100}
                value={wordCount}
                onChange={(e) => setWordCount(Number(e.target.value) || 1500)}
              />
            </div>
          </div>
          <div className="field">
            <label>
              <span>Prioriteit</span>
              <OptionalBadge />
            </label>
            <input
              className="input"
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>
              <span>Custom instructies</span>
              <OptionalBadge />
            </label>
            <textarea
              className="textarea"
              rows={4}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Bijv: GEEN specifieke percentages of bedragen; schrijf kwalitatief ('een groeiend aantal'). Of: focus op compliance, noem product X."
            />
            <FieldHelp>
              Voor rejected topics met fact_check fails: voeg hier "GEEN specifieke
              percentages of bedragen, schrijf kwalitatief" toe om verzonnen
              statistieken te voorkomen op een volgende run.
            </FieldHelp>
          </div>

          {topic.status === "rejected" && (
            <div
              style={{
                padding: 10,
                background: "rgba(59,130,246,0.06)",
                border: "1px solid rgba(59,130,246,0.25)",
                borderRadius: 6,
              }}
            >
              <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={resetStatus}
                  onChange={(e) => setResetStatus(e.target.checked)}
                />
                <span>
                  <strong>Reset naar queued</strong> — topic gaat terug in de wachtrij
                  en kan opnieuw worden gegenereerd
                </span>
              </label>
              {topic.rejectReason && (
                <div className="muted" style={{ fontSize: 11, marginTop: 6, marginLeft: 24 }}>
                  Reden vorige rejection: {topic.rejectReason}
                </div>
              )}
            </div>
          )}
        </div>
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            background: "var(--surface-2)",
          }}
        >
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuleer
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestionsModal({
  siteSlug,
  pillars,
  proposals,
  onClose,
  onAdded,
}: {
  siteSlug: string;
  pillars: Pillar[];
  proposals: TopicProposalView[];
  onClose: () => void;
  onAdded: (count: number) => void;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(
    new Set(proposals.map((p) => p.id))
  );
  const [saving, setSaving] = React.useState(false);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function accept() {
    const chosen = proposals.filter((p) => selected.has(p.id));
    if (chosen.length === 0) {
      toast.error("Selecteer minstens één topic.");
      return;
    }
    setSaving(true);
    const res = await acceptTopicProposalsAction(siteSlug, chosen);
    setSaving(false);
    if (res.ok) {
      onAdded(res.created);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,27,59,0.4)",
        backdropFilter: "blur(2px)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(92vw, 720px)",
          maxHeight: "88vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="card-header">
          <div>
            <h3>AI-voorgestelde topics</h3>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Vink aan welke je in de queue wil. Je kunt ze later nog bewerken.
            </div>
          </div>
          <button type="button" className="icon-btn card-action" onClick={onClose} aria-label="Sluit">
            <X size={16} />
          </button>
        </div>
        <div className="card-body col" style={{ gap: 10, overflow: "auto" }}>
          {proposals.map((p) => {
            const pillar = pillars.find((pl) => pl.slug === p.pillarSlug);
            const isSelected = selected.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 12,
                  padding: 14,
                  textAlign: "left",
                  border: isSelected ? "2px solid var(--secondary)" : "1px solid var(--border)",
                  background: isSelected ? "rgba(59,130,246,0.04)" : "var(--surface)",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: isSelected ? "none" : "1px solid var(--border-strong)",
                    background: isSelected ? "var(--secondary)" : "white",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  {isSelected && <Check size={14} />}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--primary)", marginBottom: 4 }}>
                    {p.title}
                  </div>
                  <div className="row wrap" style={{ gap: 4, marginBottom: 6 }}>
                    {pillar && <span className="badge b-navy">{pillar.name}</span>}
                    <span className="badge b-gray">{p.intent}</span>
                    <span className="badge b-gray">{p.intendedWordCount}w</span>
                    <span className="badge b-blue">P{p.priority}</span>
                    {sourceBadge(p.source)}
                  </div>
                  <div className="mono muted" style={{ fontSize: 11, marginBottom: 4 }}>
                    target: {p.targetKeyword}
                  </div>
                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                    {p.rationale}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
            background: "var(--surface-2)",
            alignItems: "center",
          }}
        >
          <span className="muted" style={{ fontSize: 12 }}>
            {selected.size} van {proposals.length} geselecteerd
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuleer
            </button>
            <button type="button" className="btn btn-primary" onClick={accept} disabled={saving || selected.size === 0}>
              {saving ? "Toevoegen..." : `Voeg ${selected.size} toe`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
