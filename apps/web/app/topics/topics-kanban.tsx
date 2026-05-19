"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Sparkles, Trash2, X, RefreshCw, ExternalLink, Wand2, Check } from "lucide-react";
import { createTopicAction, deleteTopicAction } from "~/lib/actions/topics";
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
}

const COLUMNS: Array<{ status: string; label: string; tone: string }> = [
  { status: "queued", label: "Queued", tone: "b-blue" },
  { status: "in_progress", label: "In progress", tone: "b-yellow" },
  { status: "published", label: "Published", tone: "b-green" },
  { status: "rejected", label: "Rejected", tone: "b-red" },
];

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
  const [generating, setGenerating] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<TopicProposalView[] | null>(null);
  const [suggesting, setSuggesting] = React.useState(false);
  const [suggestDialogOpen, setSuggestDialogOpen] = React.useState(false);

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

      <div className="kanban">
        {COLUMNS.map((col) => {
          const rows = topics.filter((t) => t.status === col.status);
          return (
            <div key={col.status} className="kcol">
              <div className="kcol-head">
                <span className={`kc-title`}>{col.label}</span>
                <span className="kc-count">{rows.length}</span>
              </div>
              <div className="kcol-body">
                {rows.length === 0 ? (
                  <p className="muted" style={{ fontSize: 12, padding: 8, margin: 0 }}>
                    Geen topics.
                  </p>
                ) : (
                  rows.map((t) => {
                    const pillar = pillars.find((p) => p.slug === t.pillarSlug);
                    return (
                      <div key={t.id} className="tcard">
                        <div className="tc-title">{t.title}</div>
                        <div className="tc-meta">
                          {pillar && <span className="badge b-navy">{pillar.name}</span>}
                          <span className="badge b-gray">{t.intent}</span>
                          <span className="badge b-gray">{t.intendedWordCount}w</span>
                        </div>
                        <div className="mono muted" style={{ fontSize: 11 }}>
                          {t.targetKeyword}
                        </div>
                        {t.rejectReason && (
                          <div
                            style={{
                              fontSize: 11,
                              background: "var(--warning-bg)",
                              color: "#b45309",
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid #fde68a",
                            }}
                          >
                            {t.rejectReason}
                          </div>
                        )}
                        {t.publishedUrl && (
                          <a
                            href={t.publishedUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: 11,
                              color: "var(--secondary)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            Bekijk post <ExternalLink size={10} />
                          </a>
                        )}
                        <div className="tc-foot">
                          {(t.status === "queued" || t.status === "rejected") && (
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
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => remove(t)}
                            disabled={generating !== null}
                            aria-label="Verwijder"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

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
