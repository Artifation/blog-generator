"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Save, AlertCircle } from "lucide-react";
import { updateSiteAction, deleteSiteAction } from "~/lib/actions/sites";
import { slugify } from "~/lib/utils";
import { RequiredBadge, OptionalBadge, FieldHelp, SectionIntro } from "~/components/ui/form-help";

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
        <Section title="Basis" description="Naam, slug, domein en taal van deze site.">
          <SectionIntro>
            Deze waardes worden gebruikt op de gepubliceerde blog (titel, URL-structuur)
            en sturen alle agents (taal-detectie, brand voice). Wijzig de slug alleen
            als de site nog niet live is — bestaande URL's wijzigen niet retroactief.
          </SectionIntro>
          <div className="row" style={{ gap: 12 }}>
            <Field
              label="Naam"
              required
              help="Wordt zichtbaar als author/publisher op published posts en in interne lijsten."
            >
              <input className="input" value={state.name} onChange={(e) => up("name", e.target.value)} placeholder="Artifation" />
            </Field>
            <Field
              label="Slug"
              required
              help="Korte URL-veilige identifier. Gebruikt in interne paden (bijv. /blog/<slug>)."
            >
              <input className="input mono" value={state.slug} onChange={(e) => up("slug", slugify(e.target.value))} placeholder="artifation" />
            </Field>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Field
              label="Domein"
              required
              help="Het echte domein zonder protocol (bijv. 'artifation.nl'). Gebruikt voor canonical URL's en interne-link-detectie."
            >
              <input className="input" value={state.domain} onChange={(e) => up("domain", e.target.value)} placeholder="artifation.nl" />
            </Field>
            <Field
              label="Taal"
              required
              help="Default taal voor alle gegenereerde content op deze site."
            >
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
          <SectionIntro>
            Brand voice is de tweede sterkste signaal voor de writer (na de outline).
            Wees concreet: persona (jij/u), toon (direct/uitleggend), energie. Vermijd
            generieke marketing-woorden — die maken het juist platter.
          </SectionIntro>
          <Field
            label="Voice"
            required
            help="2-5 zinnen die uitleggen hoe je site klinkt. Voorbeeld: 'Direct, expert, nuchter. Spreek de lezer aan met je. Geen marketingjargon. Onderbouw met concrete voorbeelden.'"
          >
            <textarea
              className="textarea"
              rows={6}
              value={state.brandVoice}
              onChange={(e) => up("brandVoice", e.target.value)}
              placeholder="Direct, expert, nuchter — geen marketingjargon. Spreek lezer aan met 'je'. Onderbouw beweringen met concrete getallen of cases. Vermijd buzz-words."
            />
          </Field>
          <ChipsField
            label="Ban list"
            optional
            description="Woorden/zinnen die NOOIT in gepubliceerde posts mogen voorkomen. Default banlist (delve, leverage, in conclusion, etc.) wordt automatisch toegevoegd — voeg hier alleen brand-specifieke verboden toe (bv. namen van concurrenten, gedateerde slogans)."
            values={state.banList}
            onChange={(v) => up("banList", v)}
          />
          <ChipsField
            label="Signature phrases"
            optional
            description="Korte typische zinnen die jouw brand herkenbaar maken. De writer gebruikt deze waar het natuurlijk past."
            values={state.signaturePhrases}
            onChange={(v) => up("signaturePhrases", v)}
          />
        </Section>

        <Section title="Pillars" description="Content pillars sturen topic-selectie en het topic-suggester-agent.">
          <SectionIntro>
            Pillars zijn de hoofd-thema's van je blog (bv. "AI per afdeling", "AI-act"
            voor een AI-consultancy). De topic-suggester en DataForSEO-flow gebruiken
            de pillar-namen als seed. Weights normaliseren bij opslaan naar 1.0 —
            de verhouding stuurt hoe vaak elk pillar aan bod komt.
          </SectionIntro>
          <PillarEditor pillars={state.pillars} onChange={(v) => up("pillars", v)} />
        </Section>

        <Section title="Kwaliteit & cadans" description="Drempelwaardes voor publish + schedule.">
          <SectionIntro>
            Drafts onder de threshold worden automatisch rejected (komen op de
            rejected-tab maar publiseren niet). De cron-schedule wordt nu nog niet
            automatisch gedraaid — manual triggers werken.
          </SectionIntro>
          <div className="row" style={{ gap: 12 }}>
            <Field
              label="Quality threshold (0–10)"
              required
              help="Drafts met een gewogen quality-score onder deze waarde worden afgekeurd. 8.0 is streng, 7.0 ruimer."
            >
              <input className="input tnum" type="number" min={0} max={10} step={0.1} value={state.qualityThreshold} onChange={(e) => up("qualityThreshold", Number(e.target.value) || 0)} />
            </Field>
            <Field
              label="Max posts / week"
              required
              help="Hard cap voor de pipeline. Bij overschrijding krijgt het topic status 'cap_deferred' en wacht."
            >
              <input className="input tnum" type="number" min={0} value={state.maxPostsPerWeek} onChange={(e) => up("maxPostsPerWeek", Number(e.target.value) || 0)} />
            </Field>
            <Field
              label="Schedule (cron, UTC)"
              required
              help="Cron-expressie voor automatische runs (5 velden, UTC). Default: '0 6 * * 1,3,5' = ma/wo/vr 06:00 UTC."
            >
              <input className="input mono" value={state.scheduleCron} onChange={(e) => up("scheduleCron", e.target.value)} placeholder="0 6 * * 1,3,5" />
            </Field>
          </div>
        </Section>

        <Section title="Publiceren" description="Waar finale posts naartoe gaan.">
          <SectionIntro>
            Built-in CMS = posts worden gerenderd op deze webapp zelf (/blog/&lt;slug&gt;).
            WordPress = posts worden via REST API gepost naar je WP-instance. Markdown
            = .md-bestanden in data/exports/. Je kunt later van bestemming wisselen.
          </SectionIntro>
          <Field
            label="Bestemming"
            required
            help="Default is 'Built-in CMS' — werkt direct zonder externe setup. Kies WordPress alleen als je daar al een site hebt draaien."
          >
            <select className="select" value={state.publishDestination} onChange={(e) => up("publishDestination", e.target.value as SiteData["publishDestination"])}>
              <option value="built_in">Built-in CMS</option>
              <option value="wordpress">WordPress</option>
              <option value="markdown">Markdown export</option>
            </select>
          </Field>
          {state.publishDestination === "wordpress" && (
            <div className="card" style={{ background: "var(--surface-2)" }}>
              <div className="card-body col" style={{ gap: 12 }}>
                <SectionIntro>
                  WordPress credentials. Vereist een Application Password (Users →
                  Profile → Application Passwords in WP-admin), niet je gewone wachtwoord.
                </SectionIntro>
                <Field
                  label="WordPress URL"
                  required
                  help="Volledige basis-URL incl. https://. Bijv. https://blog.artifation.nl"
                >
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
                    placeholder="https://blog.example.com"
                  />
                </Field>
                <div className="row" style={{ gap: 12 }}>
                  <Field
                    label="User"
                    required
                    help="WordPress-gebruikersnaam (login, niet display name)."
                  >
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
                      placeholder="admin"
                    />
                  </Field>
                  <Field
                    label="App password"
                    required
                    help="Application Password uit WP-admin. NIET je gewone login-wachtwoord."
                  >
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
                      placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                    />
                  </Field>
                </div>
              </div>
            </div>
          )}
        </Section>

        <Section title="Auteur" description="De byline op gepubliceerde posts.">
          <SectionIntro>
            Wordt gebruikt in JSON-LD schema (Person/Author) en in de zichtbare byline
            op de blog. Google's E-E-A-T weegt herkenbaar auteurschap mee in rankings.
          </SectionIntro>
          <div className="row" style={{ gap: 12 }}>
            <Field
              label="Naam"
              required
              help="Volledige naam van de auteur. Wordt zichtbaar onder elke post."
            >
              <input className="input" value={state.author.name ?? ""} onChange={(e) => up("author", { ...state.author, name: e.target.value })} placeholder="Julian Dunsbergen" />
            </Field>
            <Field
              label="LinkedIn URL"
              help="LinkedIn-profiel van de auteur. Wordt gelinkt vanaf de byline (E-E-A-T signaal)."
            >
              <input
                className="input"
                value={state.author.linkedin ?? ""}
                onChange={(e) => up("author", { ...state.author, linkedin: e.target.value })}
                placeholder="https://www.linkedin.com/in/..."
              />
            </Field>
          </div>
          <Field
            label="Bio"
            help="1-3 zinnen over de auteur. Verschijnt onderaan elke post + in schema."
          >
            <textarea
              className="textarea"
              rows={3}
              value={state.author.bio ?? ""}
              onChange={(e) => up("author", { ...state.author, bio: e.target.value })}
              placeholder="Julian helpt MKB-bedrijven AI implementeren zonder marketingjargon. 12+ jaar ervaring in B2B SaaS."
            />
          </Field>
        </Section>

        {teamSection}

        <Section
          title="Google Search Console"
          description="Schakel in om 'Suggest topics' te voeden met striking-distance queries, content-gaps en stijgende queries uit GSC. Plak je service-account JSON hieronder — wordt per site bewaard zodat elke site z'n eigen credential heeft."
        >
          {(() => {
            const sc = readSearchConsole(state.features);
            const setSc = (patch: Partial<SearchConsoleFeature>) =>
              up("features", { ...state.features, search_console: { ...sc, ...patch } });
            const enabled = sc.enabled ?? false;
            const gscJson = state.apiKeys.gscServiceAccountJson ?? "";
            const jsonLooksValid = (() => {
              if (!gscJson.trim()) return null;
              try {
                const parsed = JSON.parse(gscJson) as { client_email?: string; private_key?: string };
                if (parsed.client_email && parsed.private_key) return parsed.client_email;
                return false;
              } catch {
                return false;
              }
            })();
            return (
              <>
                <div className="row" style={{ gap: 12, alignItems: "center" }}>
                  <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setSc({ enabled: e.target.checked })}
                    />
                    <span>Search Console gebruiken</span>
                  </label>
                </div>
                <Field
                  label="Property URL"
                  required={enabled}
                  help="Exact zoals in GSC. Domain-property: 'sc-domain:artifation.nl'. URL-prefix-property: 'https://artifation.nl/' (mét trailing slash)."
                >
                  <input
                    className="input mono"
                    value={sc.property_url ?? ""}
                    onChange={(e) => setSc({ property_url: e.target.value })}
                    placeholder="sc-domain:jouwsite.nl"
                    disabled={!enabled}
                  />
                </Field>
                <Field
                  label="Service account JSON"
                  required={enabled}
                  help="Plak de volledige JSON-key uit Google Cloud (IAM → Service Accounts → Keys → Add Key). Vergeet niet het service-account-email als gebruiker toe te voegen in je GSC property (Settings → Users and permissions → Add user, permission 'Restricted')."
                >
                  <textarea
                    className="textarea mono"
                    rows={6}
                    value={gscJson}
                    onChange={(e) =>
                      up("apiKeys", { ...state.apiKeys, gscServiceAccountJson: e.target.value })
                    }
                    placeholder='{"type":"service_account","project_id":"...","client_email":"...","private_key":"..."}'
                    disabled={!enabled}
                    style={{ fontSize: 11, fontFamily: "monospace" }}
                  />
                  {jsonLooksValid === false && (
                    <div style={{ color: "var(--danger, #b91c1c)", marginTop: 4, fontSize: 11 }}>
                      ⚠ JSON is ongeldig of mist <code>client_email</code> / <code>private_key</code>.
                    </div>
                  )}
                  {typeof jsonLooksValid === "string" && (
                    <div style={{ color: "var(--success, #047857)", marginTop: 4, fontSize: 11 }}>
                      ✓ JSON geparsed — service account: <code>{jsonLooksValid}</code>
                    </div>
                  )}
                </Field>
              </>
            );
          })()}
        </Section>

        <Section
          title="DataForSEO (optioneel, betaald)"
          description="Met DataForSEO Labs krijg je echte maandelijkse search volumes + keyword difficulty per voorgesteld topic en SERP-aware audit-feedback."
        >
          <SectionIntro>
            Helemaal optioneel. Zonder credentials valt Suggest topics terug op de
            gratis GSC + Gemini stack en mist het audit-feature alleen het SERP-panel.
            Pricing: ~$0.0075 per pillar bij Suggest topics + ~$0.0006 per audit.
            Maak een account op{" "}
            <a href="https://dataforseo.com/" target="_blank" rel="noreferrer">dataforseo.com</a>{" "}
            en gebruik je API-credentials (Login → API-tab).
          </SectionIntro>
          <div className="row" style={{ gap: 12 }}>
            <Field
              label="Login (email)"
              help="Het emailadres waarmee je inlogt op DataForSEO."
            >
              <input
                className="input mono"
                value={state.apiKeys.dataForSeoLogin ?? ""}
                onChange={(e) =>
                  up("apiKeys", { ...state.apiKeys, dataForSeoLogin: e.target.value })
                }
                placeholder="jouw-dfs-account@example.com"
              />
            </Field>
            <Field
              label="API password"
              help="Het API-password uit Login → API-tab. NIET je gewone dashboard-login wachtwoord."
            >
              <input
                className="input mono"
                type="password"
                value={state.apiKeys.dataForSeoPassword ?? ""}
                onChange={(e) =>
                  up("apiKeys", { ...state.apiKeys, dataForSeoPassword: e.target.value })
                }
                placeholder="********"
              />
            </Field>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Field
              label="Taal (ISO code)"
              help="Default 'nl'. Gebruik 'en', 'de', 'fr' voor andere markten."
            >
              <input
                className="input mono"
                value={state.apiKeys.dataForSeoLanguageCode ?? ""}
                onChange={(e) =>
                  up("apiKeys", { ...state.apiKeys, dataForSeoLanguageCode: e.target.value })
                }
                placeholder="nl"
              />
            </Field>
            <Field
              label="Locatie (DFS code)"
              help="NL = 2528, US = 2840, DE = 2276, BE = 2056. Default is NL. Zie DataForSEO Locations API voor andere landen."
            >
              <input
                className="input tnum"
                inputMode="numeric"
                value={state.apiKeys.dataForSeoLocationCode ?? ""}
                onChange={(e) =>
                  up("apiKeys", {
                    ...state.apiKeys,
                    dataForSeoLocationCode: e.target.value.replace(/\D/g, "") || undefined,
                  })
                }
                placeholder="2528"
              />
            </Field>
          </div>
        </Section>

        <Section
          title="API-keys"
          description="Pipeline-keys voor de blog-generatoren. Lokaal opgeslagen in SQLite."
        >
          <SectionIntro>
            <strong>Minstens één van Anthropic OF Gemini is verplicht</strong> — die
            doen het schrijfwerk. Groq, Fal.ai en Resend zijn optioneel: zonder Fal.ai
            krijg je geen images, zonder Resend geen e-mail notificaties. Keys gelden
            voor alle agents in de volgende pipeline-run.
          </SectionIntro>
          <ApiKey label="Anthropic" value={state.apiKeys.anthropic ?? ""} onChange={(v) => up("apiKeys", { ...state.apiKeys, anthropic: v })} hint="Verplicht of Gemini. Voor strategist + writer + factChecker + qualityJudge." />
          <ApiKey label="Gemini" value={state.apiKeys.gemini ?? ""} onChange={(v) => up("apiKeys", { ...state.apiKeys, gemini: v })} hint="Verplicht of Anthropic. Researcher (search grounding), topic suggester, scrape extractor, blog audit." />
          <ApiKey label="Groq" value={state.apiKeys.groq ?? ""} onChange={(v) => up("apiKeys", { ...state.apiKeys, groq: v })} hint="Optioneel. Image-prompter draait op Groq voor snelle goedkope prompts." />
          <ApiKey label="Fal.ai" value={state.apiKeys.fal ?? ""} onChange={(v) => up("apiKeys", { ...state.apiKeys, fal: v })} hint="Optioneel. Genereert blog-feature-images. Zonder Fal krijgen posts geen image." />
          <ApiKey label="Resend (email)" value={state.apiKeys.resend ?? ""} onChange={(v) => up("apiKeys", { ...state.apiKeys, resend: v })} hint="Optioneel. Voor email-notificaties bij nieuwe drafts en topic-voorstellen." />
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

function Field({
  label,
  required,
  help,
  children,
}: {
  label: string;
  /** Defaults to false (= optional). Pass true for verplicht-velden so the
   * Required badge appears next to the label and screen readers see it. */
  required?: boolean;
  /** Short hint shown under the field, explaining what it's for. */
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="field" style={{ flex: 1 }}>
      <label>
        <span>{label}</span>
        {required ? <RequiredBadge /> : <OptionalBadge />}
      </label>
      {children}
      {help && <FieldHelp>{help}</FieldHelp>}
    </div>
  );
}

function ApiKey({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Short hint explaining when this key is required and what it's used for. */
  hint?: string;
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
      {hint && <FieldHelp>{hint}</FieldHelp>}
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
  optional,
  required,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (v: string[]) => void;
  /** Defaults to neither badge — explicit opt-in keeps backwards compat. */
  optional?: boolean;
  required?: boolean;
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
      <label>
        <span>{label}</span>
        {required ? <RequiredBadge /> : optional ? <OptionalBadge /> : null}
      </label>
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
