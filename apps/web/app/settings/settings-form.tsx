"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Save, AlertCircle } from "lucide-react";
import { updateSiteAction, deleteSiteAction } from "~/lib/actions/sites";
import { slugify } from "~/lib/utils";

type Pillar = { slug?: string; name: string; weight: number };

interface SiteData {
  id: string;
  slug: string;
  name: string;
  domain: string;
  language: string;
  brandVoice: string;
  banList: string[];
  signaturePhrases: string[];
  qualityThreshold: number;
  maxPostsPerWeek: number;
  scheduleCron: string;
  publishDestination: "built_in" | "wordpress" | "markdown";
  wordpressConfig: { baseUrl: string; user: string; appPassword: string } | null;
  author: { name?: string; bio?: string; linkedin?: string; photoUrl?: string };
  apiKeys: Record<string, string | undefined>;
  pillars: Pillar[];
  features: Record<string, unknown>;
}

interface SearchConsoleFeature {
  enabled?: boolean;
  property_url?: string;
}

function readSearchConsole(features: Record<string, unknown>): SearchConsoleFeature {
  const sc = features.search_console;
  if (!sc || typeof sc !== "object") return {};
  return sc as SearchConsoleFeature;
}

export function SettingsForm({
  site,
  teamSection,
}: {
  site: SiteData;
  teamSection?: React.ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<SiteData>(site);
  const [saving, setSaving] = React.useState(false);

  function up<K extends keyof SiteData>(k: K, v: SiteData[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  async function save() {
    setSaving(true);
    const r = await updateSiteAction(site.id, {
      name: state.name,
      slug: state.slug,
      domain: state.domain,
      language: state.language,
      brandVoice: state.brandVoice,
      banList: state.banList,
      signaturePhrases: state.signaturePhrases,
      qualityThreshold: state.qualityThreshold,
      maxPostsPerWeek: state.maxPostsPerWeek,
      scheduleCron: state.scheduleCron,
      publishDestination: state.publishDestination,
      wordpressConfig: state.wordpressConfig,
      author: { name: state.author.name ?? "", bio: state.author.bio, linkedin: state.author.linkedin, photoUrl: state.author.photoUrl },
      apiKeys: state.apiKeys as Record<string, string>,
      pillars: state.pillars,
      features: state.features,
    });
    setSaving(false);
    if (r.ok) {
      toast.success("Instellingen opgeslagen");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  async function destroy() {
    if (!confirm(`Verwijder "${site.name}" en alles wat erbij hoort?`)) return;
    if (!confirm("Echt zeker? Dit is onomkeerbaar.")) return;
    await deleteSiteAction(site.id);
  }

  return (
    <>
      <div className="page-head">
        <div className="ph-text">
          <h1>Instellingen</h1>
          <div className="ph-sub">Brand, pillars, quality, destination en API-keys.</div>
        </div>
      </div>

      <div className="col gap-lg" style={{ paddingBottom: 80 }}>
        <Section title="Basis" description="Naam, slug, domein en taal.">
          <div className="row" style={{ gap: 12 }}>
            <Field label="Naam">
              <input className="input" value={state.name} onChange={(e) => up("name", e.target.value)} />
            </Field>
            <Field label="Slug">
              <input className="input mono" value={state.slug} onChange={(e) => up("slug", slugify(e.target.value))} />
            </Field>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Field label="Domein">
              <input className="input" value={state.domain} onChange={(e) => up("domain", e.target.value)} />
            </Field>
            <Field label="Taal">
              <select className="select" value={state.language} onChange={(e) => up("language", e.target.value)}>
                <option value="nl-NL">Nederlands</option>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="de-DE">Deutsch</option>
                <option value="fr-FR">Français</option>
                <option value="es-ES">Español</option>
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Brand voice" description="Hoe moet de writer klinken — en wat te vermijden.">
          <Field label="Voice">
            <textarea className="textarea" rows={6} value={state.brandVoice} onChange={(e) => up("brandVoice", e.target.value)} />
          </Field>
          <ChipsField
            label="Ban list"
            description="Woorden en zinnen die nooit in gepubliceerde posts mogen verschijnen."
            values={state.banList}
            onChange={(v) => up("banList", v)}
          />
          <ChipsField
            label="Signature phrases"
            description="Zinnen die jouw brand signaleren."
            values={state.signaturePhrases}
            onChange={(v) => up("signaturePhrases", v)}
          />
        </Section>

        <Section title="Pillars" description="Content pillars sturen topic-selectie. Weights normaliseren naar 1.0.">
          <PillarEditor pillars={state.pillars} onChange={(v) => up("pillars", v)} />
        </Section>

        <Section title="Kwaliteit & cadans">
          <div className="row" style={{ gap: 12 }}>
            <Field label="Quality threshold (0–10)">
              <input className="input tnum" type="number" min={0} max={10} step={0.1} value={state.qualityThreshold} onChange={(e) => up("qualityThreshold", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Max posts / week">
              <input className="input tnum" type="number" min={0} value={state.maxPostsPerWeek} onChange={(e) => up("maxPostsPerWeek", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Schedule (cron, UTC)">
              <input className="input mono" value={state.scheduleCron} onChange={(e) => up("scheduleCron", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Publiceren" description="Waar finale posts naartoe gaan.">
          <Field label="Bestemming">
            <select className="select" value={state.publishDestination} onChange={(e) => up("publishDestination", e.target.value as SiteData["publishDestination"])}>
              <option value="built_in">Built-in CMS</option>
              <option value="wordpress">WordPress</option>
              <option value="markdown">Markdown export</option>
            </select>
          </Field>
          {state.publishDestination === "wordpress" && (
            <div className="card" style={{ background: "var(--surface-2)" }}>
              <div className="card-body col" style={{ gap: 12 }}>
                <Field label="WordPress URL">
                  <input
                    className="input"
                    value={state.wordpressConfig?.baseUrl ?? ""}
                    onChange={(e) =>
                      up("wordpressConfig", {
                        baseUrl: e.target.value,
                        user: state.wordpressConfig?.user ?? "",
                        appPassword: state.wordpressConfig?.appPassword ?? "",
                      })
                    }
                  />
                </Field>
                <div className="row" style={{ gap: 12 }}>
                  <Field label="User">
                    <input
                      className="input"
                      value={state.wordpressConfig?.user ?? ""}
                      onChange={(e) =>
                        up("wordpressConfig", {
                          baseUrl: state.wordpressConfig?.baseUrl ?? "",
                          user: e.target.value,
                          appPassword: state.wordpressConfig?.appPassword ?? "",
                        })
                      }
                    />
                  </Field>
                  <Field label="App password">
                    <input
                      className="input"
                      type="password"
                      value={state.wordpressConfig?.appPassword ?? ""}
                      onChange={(e) =>
                        up("wordpressConfig", {
                          baseUrl: state.wordpressConfig?.baseUrl ?? "",
                          user: state.wordpressConfig?.user ?? "",
                          appPassword: e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
            </div>
          )}
        </Section>

        <Section title="Auteur" description="De byline op gepubliceerde posts.">
          <div className="row" style={{ gap: 12 }}>
            <Field label="Naam">
              <input className="input" value={state.author.name ?? ""} onChange={(e) => up("author", { ...state.author, name: e.target.value })} />
            </Field>
            <Field label="LinkedIn URL">
              <input
                className="input"
                value={state.author.linkedin ?? ""}
                onChange={(e) => up("author", { ...state.author, linkedin: e.target.value })}
                placeholder="https://www.linkedin.com/in/..."
              />
            </Field>
          </div>
          <Field label="Bio">
            <textarea
              className="textarea"
              rows={3}
              value={state.author.bio ?? ""}
              onChange={(e) => up("author", { ...state.author, bio: e.target.value })}
            />
          </Field>
        </Section>

        {teamSection}

        <Section
          title="Google Search Console"
          description="Schakel in om 'Suggest topics' te voeden met striking-distance queries, content-gaps en stijgende queries uit GSC. Vereist ook GSC_SERVICE_ACCOUNT_JSON in je env."
        >
          {(() => {
            const sc = readSearchConsole(state.features);
            const setSc = (patch: Partial<SearchConsoleFeature>) =>
              up("features", { ...state.features, search_console: { ...sc, ...patch } });
            return (
              <>
                <div className="row" style={{ gap: 12, alignItems: "center" }}>
                  <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={sc.enabled ?? false}
                      onChange={(e) => setSc({ enabled: e.target.checked })}
                    />
                    <span>Search Console gebruiken</span>
                  </label>
                </div>
                <Field label="Property URL (precies zoals in GSC, bv. 'sc-domain:artifation.nl' of 'https://artifation.nl/')">
                  <input
                    className="input mono"
                    value={sc.property_url ?? ""}
                    onChange={(e) => setSc({ property_url: e.target.value })}
                    placeholder="sc-domain:jouwsite.nl"
                    disabled={!(sc.enabled ?? false)}
                  />
                </Field>
              </>
            );
          })()}
        </Section>

        <Section title="API-keys" description="Lokaal opgeslagen in SQLite. Geldt voor de volgende pipeline-run.">
          <ApiKey label="Anthropic" value={state.apiKeys.anthropic ?? ""} onChange={(v) => up("apiKeys", { ...state.apiKeys, anthropic: v })} />
          <ApiKey label="Gemini" value={state.apiKeys.gemini ?? ""} onChange={(v) => up("apiKeys", { ...state.apiKeys, gemini: v })} />
          <ApiKey label="Groq" value={state.apiKeys.groq ?? ""} onChange={(v) => up("apiKeys", { ...state.apiKeys, groq: v })} />
          <ApiKey label="Fal.ai" value={state.apiKeys.fal ?? ""} onChange={(v) => up("apiKeys", { ...state.apiKeys, fal: v })} />
          <ApiKey label="Resend (email)" value={state.apiKeys.resend ?? ""} onChange={(v) => up("apiKeys", { ...state.apiKeys, resend: v })} />
        </Section>

        <Section title="Gevaarzone" description="Permanente acties.">
          <div className="row">
            <button type="button" className="btn btn-danger" onClick={destroy}>
              <Trash2 size={14} /> Verwijder deze site
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              <AlertCircle size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
              Verwijdert alle topics, drafts en gepubliceerde posts.
            </span>
          </div>
        </Section>
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 240,
          right: 0,
          borderTop: "1px solid var(--border)",
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(8px)",
          padding: "12px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 5,
        }}
      >
        <span className="muted" style={{ fontSize: 12 }}>
          Wijzigingen gelden voor de volgende pipeline-run.
        </span>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={13} /> {saving ? "Opslaan..." : "Alles opslaan"}
        </button>
      </div>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>{title}</h3>
          {description && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{description}</div>}
        </div>
      </div>
      <div className="card-body col" style={{ gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field" style={{ flex: 1 }}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function ApiKey({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ gap: 6 }}>
        <input
          className="input mono"
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-..."
        />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setShow((s) => !s)}>
          {show ? "Verberg" : "Toon"}
        </button>
      </div>
    </div>
  );
}

function PillarEditor({ pillars, onChange }: { pillars: Pillar[]; onChange: (v: Pillar[]) => void }) {
  const total = pillars.reduce((s, p) => s + p.weight, 0);
  function set(i: number, patch: Partial<Pillar>) {
    onChange(pillars.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function add() {
    onChange([...pillars, { name: "", weight: 0.1 }]);
  }
  function remove(i: number) {
    onChange(pillars.filter((_, idx) => idx !== i));
  }
  return (
    <div className="col" style={{ gap: 10 }}>
      {pillars.map((p, i) => (
        <div key={i} className="row" style={{ gap: 10, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Pillar</label>
            <input className="input" value={p.name} onChange={(e) => set(i, { name: e.target.value })} />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label>Weight</label>
            <input
              className="input tnum"
              type="number"
              min={0}
              step="0.05"
              value={p.weight}
              onChange={(e) => set(i, { weight: Number(e.target.value) || 0 })}
            />
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => remove(i)}
            disabled={pillars.length === 1}
            aria-label="Verwijder pillar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-outline btn-sm" onClick={add}>
          <Plus size={12} /> Pillar toevoegen
        </button>
      </div>
      <div className="muted" style={{ fontSize: 11 }}>
        Totaal: {total.toFixed(2)} — wordt bij opslaan genormaliseerd naar 1.0.
      </div>
    </div>
  );
}

function ChipsField({
  label,
  description,
  values,
  onChange,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = React.useState("");
  function add() {
    const v = input.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setInput("");
  }
  return (
    <div className="field">
      <label>{label}</label>
      {description && <div className="hint">{description}</div>}
      <div className="chips">
        {values.map((v, i) => (
          <span key={`${v}-${i}`} className="chip">
            {v}
            <button
              type="button"
              className="chip-x"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              aria-label={`Verwijder ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
            if (e.key === "Backspace" && !input && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          placeholder="Typ en druk op Enter"
        />
      </div>
    </div>
  );
}
