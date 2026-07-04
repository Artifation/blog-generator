"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Plus, Trash2, Sparkles, RefreshCw, Wand2, CheckCircle } from "lucide-react";
import { LogoMark } from "~/components/brand/logo-mark";
import { slugify } from "~/lib/utils";
import { createSiteAction } from "~/lib/actions/sites";
import { loginAction, createOwnerUserAction } from "~/lib/actions/auth";
import { scrapeWebsiteAction } from "~/lib/actions/scrape";
import { RequiredBadge, OptionalBadge, FieldHelp } from "~/components/ui/form-help";

const STEPS = ["Basis", "Brand voice", "Pillars", "Kwaliteit", "Publiceren & keys"] as const;

interface WizardState {
  name: string;
  slug: string;
  domain: string;
  language: string;
  brandVoice: string;
  banList: string[];
  signaturePhrases: string[];
  pillars: Array<{ name: string; weight: number }>;
  qualityThreshold: number;
  maxPostsPerWeek: number;
  scheduleCron: string;
  publishDestination: "built_in" | "wordpress" | "markdown";
  wpBaseUrl: string;
  wpUser: string;
  wpAppPassword: string;
  authorName: string;
  authorBio: string;
  authorLinkedin: string;
  apiKeys: {
    anthropic: string;
    gemini: string;
    groq: string;
    fal: string;
    resend: string;
  };
}

const initial: WizardState = {
  name: "",
  slug: "",
  domain: "",
  language: "nl-NL",
  brandVoice:
    "Direct, behulpzaam, geen poespas. Korte zinnen mixen met langere. Concrete getallen en voorbeelden boven abstracte beloften.",
  banList: [
    "in conclusion",
    "moreover",
    "furthermore",
    "navigate the complexities",
    "leverage",
    "delve",
  ],
  signaturePhrases: [],
  pillars: [
    { name: "Industry insights", weight: 0.5 },
    { name: "Product & features", weight: 0.3 },
    { name: "Customer stories", weight: 0.2 },
  ],
  qualityThreshold: 8.0,
  maxPostsPerWeek: 2,
  scheduleCron: "0 6 * * 1,3,5",
  publishDestination: "built_in",
  wpBaseUrl: "",
  wpUser: "",
  wpAppPassword: "",
  authorName: "",
  authorBio: "",
  authorLinkedin: "",
  apiKeys: { anthropic: "", gemini: "", groq: "", fal: "", resend: "" },
};

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [state, setState] = React.useState<WizardState>(initial);
  const [saving, setSaving] = React.useState(false);

  // Pre-fill from invite code stash
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem("artifation_invite");
      if (!raw) return;
      const inv = JSON.parse(raw) as { company?: string; name?: string; domain?: string };
      setState((s) => ({
        ...s,
        name: inv.company ?? s.name,
        slug: inv.company ? slugify(inv.company) : s.slug,
        domain: inv.domain ?? s.domain,
        authorName: inv.name ?? s.authorName,
      }));
    } catch {
      // ignore
    }
  }, []);

  const update = <K extends keyof WizardState>(k: K, v: WizardState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  function canAdvance(): string | null {
    if (step === 0) {
      if (!state.name.trim()) return "Naam is verplicht";
      if (!state.domain.trim()) return "Domein is verplicht";
    }
    if (step === 1) {
      if (state.brandVoice.trim().length < 20) return "Brand voice te kort — geef de writer iets te pakken.";
    }
    if (step === 2) {
      if (state.pillars.length < 1) return "Minimaal één pillar";
      if (state.pillars.some((p) => !p.name.trim())) return "Lege pillar-naam";
    }
    if (step === 4) {
      if (state.publishDestination === "wordpress") {
        if (!state.wpBaseUrl.trim() || !state.wpUser.trim() || !state.wpAppPassword.trim())
          return "WordPress credentials zijn verplicht bij die bestemming";
      }
    }
    return null;
  }

  async function handleSubmit() {
    const err = canAdvance();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    const slug = state.slug.trim() || slugify(state.name);
    // The single-use invite code (stashed by the activate form) is required to
    // create a site — pass it so createSiteAction can claim it.
    let inviteCode = "";
    try {
      const rawInvite = sessionStorage.getItem("artifation_invite");
      if (rawInvite) inviteCode = (JSON.parse(rawInvite) as { code?: string }).code ?? "";
    } catch {
      /* ignore */
    }
    const result = await createSiteAction({
      name: state.name.trim(),
      slug,
      domain: state.domain.trim(),
      language: state.language,
      brandVoice: state.brandVoice.trim(),
      banList: state.banList.filter(Boolean),
      signaturePhrases: state.signaturePhrases.filter(Boolean),
      qualityThreshold: state.qualityThreshold,
      maxPostsPerWeek: state.maxPostsPerWeek,
      scheduleCron: state.scheduleCron,
      publishDestination: state.publishDestination,
      wordpressConfig:
        state.publishDestination === "wordpress"
          ? {
              baseUrl: state.wpBaseUrl.trim(),
              user: state.wpUser.trim(),
              appPassword: state.wpAppPassword.trim(),
            }
          : null,
      author: {
        name: state.authorName.trim(),
        bio: state.authorBio.trim() || undefined,
        linkedin: state.authorLinkedin.trim() || undefined,
      },
      apiKeys: {
        anthropic: state.apiKeys.anthropic.trim(),
        gemini: state.apiKeys.gemini.trim(),
        groq: state.apiKeys.groq.trim(),
        fal: state.apiKeys.fal.trim(),
        resend: state.apiKeys.resend.trim(),
      },
      pillars: state.pillars.map((p) => ({ name: p.name.trim(), weight: p.weight })),
    }, inviteCode);

    if (!result.ok) {
      setSaving(false);
      toast.error(result.error);
      return;
    }

    // If invite stash exists with email + password, create the owner user.
    let userCreated = false;
    try {
      const raw = sessionStorage.getItem("artifation_invite");
      if (raw) {
        const inv = JSON.parse(raw) as { email?: string; password?: string; name?: string };
        if (inv.email && inv.password) {
          const u = await createOwnerUserAction(result.slug, {
            email: inv.email,
            password: inv.password,
            name: inv.name ?? state.authorName ?? "",
          });
          if (u.ok) userCreated = true;
        }
      }
    } catch {
      // ignore — fall back to demo login
    }

    if (!userCreated) {
      const loginResult = await loginAction(result.slug);
      if (!loginResult.ok) {
        setSaving(false);
        toast.error("Site aangemaakt maar inloggen mislukte. Ga naar /login.");
        return;
      }
    }

    setSaving(false);
    sessionStorage.removeItem("artifation_invite");
    toast.success("Klaar! Welkom in je dashboard.");
    router.push("/dashboard");
  }

  function next() {
    const err = canAdvance();
    if (err) {
      toast.error(err);
      return;
    }
    if (step === STEPS.length - 1) {
      handleSubmit();
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function prev() {
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <>
      <div
        className="row"
        style={{ marginBottom: 28, alignItems: "center", gap: 10 }}
      >
        <span style={{ color: "var(--secondary)" }}>
          <LogoMark size={26} />
        </span>
        <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em" }}>
          Artifation <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>Blog</span>
        </div>
      </div>

      <Stepper step={step} />

      <div className="card">
        <div className="card-header">
          <div>
            <h3>{STEPS[step]}</h3>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {stepDescription(step)}
            </div>
          </div>
        </div>
        <div className="card-body col" style={{ gap: 14 }}>
          {step === 0 && <BasicsStep state={state} update={update} />}
          {step === 1 && <VoiceStep state={state} update={update} />}
          {step === 2 && <PillarsStep state={state} update={update} />}
          {step === 3 && <QualityStep state={state} update={update} />}
          {step === 4 && <PublishStep state={state} update={update} />}
        </div>
      </div>

      <div className="row between" style={{ marginTop: 20 }}>
        <button type="button" className="btn btn-ghost" onClick={prev} disabled={step === 0 || saving}>
          <ArrowLeft size={13} /> Vorige
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={next} disabled={saving}>
          {step === STEPS.length - 1 ? (
            saving ? (
              <>
                <RefreshCw size={14} className="spin" /> Aanmaken…
              </>
            ) : (
              <>
                <Sparkles size={13} /> Maak mijn blog aan
              </>
            )
          ) : (
            <>
              Volgende <ArrowRight size={13} />
            </>
          )}
        </button>
      </div>
    </>
  );
}

function stepDescription(step: number): string {
  switch (step) {
    case 0:
      return "Geef je site een naam, domein en taal.";
    case 1:
      return "Vertel de writer hoe hij moet klinken. Ban list = woorden die nooit in posts mogen.";
    case 2:
      return "Content pillars sturen topic-selectie. Weights normaliseren naar 1.0.";
    case 3:
      return "Hoe streng is je kwaliteitsbar, hoe vaak publiceer je?";
    case 4:
      return "Waar komen de finale posts terecht, en welke LLM-providers gebruiken we?";
    default:
      return "";
  }
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="stepper">
      {STEPS.map((label, i) => {
        const state = i < step ? "done" : i === step ? "active" : "";
        return (
          <React.Fragment key={label}>
            <div className={`step ${state}`}>
              <span className="step-num">{i + 1}</span>
              <span className="step-label">{label}</span>
            </div>
            {i < STEPS.length - 1 && <span className="step-line" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function BasicsStep({
  state,
  update,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
}) {
  const [scraping, setScraping] = React.useState(false);
  const [scraped, setScraped] = React.useState<{ url: string; companyName: string } | null>(null);

  async function autoFill() {
    if (!state.domain.trim()) {
      toast.error("Vul eerst je domein in.");
      return;
    }
    setScraping(true);
    const tid = toast.loading("Bezig je site te lezen…");
    const res = await scrapeWebsiteAction(state.domain.trim());
    toast.dismiss(tid);
    setScraping(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    const e = res.extraction;
    update("name", e.company_name || state.name);
    if (!state.slug || state.slug === slugify(state.name)) {
      update("slug", slugify(e.company_name || state.name));
    }
    update("brandVoice", e.brand_voice);
    update("pillars", e.pillars.map((p) => ({ name: p.name, weight: p.weight })));
    if (e.detected_language) update("language", e.detected_language);
    if (e.ban_list_suggestions && e.ban_list_suggestions.length > 0) {
      // merge with existing defaults, dedupe
      const merged = Array.from(new Set([...state.banList, ...e.ban_list_suggestions]));
      update("banList", merged);
    }
    if (e.author_bio) update("authorBio", e.author_bio);

    setScraped({ url: res.finalUrl, companyName: e.company_name });
    toast.success(`Voorgevuld vanuit ${new URL(res.finalUrl).hostname}`);
  }

  return (
    <>
      <div className="field">
        <label>
          <span>Naam</span>
          <RequiredBadge />
        </label>
        <input
          className="input"
          value={state.name}
          onChange={(e) => {
            update("name", e.target.value);
            if (!state.slug) update("slug", slugify(e.target.value));
          }}
          placeholder="Bijv. Acme Blog"
          autoFocus
        />
        <FieldHelp>De naam van deze site. Verschijnt als publisher op gepubliceerde blogs.</FieldHelp>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>
            <span>Slug</span>
            <RequiredBadge />
          </label>
          <input className="input mono" value={state.slug} onChange={(e) => update("slug", slugify(e.target.value))} placeholder="acme" />
          <FieldHelp>URL-veilige korte naam — wordt gebruikt in /blog/:slug/:post URLs.</FieldHelp>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>
            <span>Domein</span>
            <RequiredBadge />
          </label>
          <input className="input" value={state.domain} onChange={(e) => update("domain", e.target.value)} placeholder="acme.com" />
          <FieldHelp>Het echte domein zonder https:// (voor canonical URL's). Wordt ook gebruikt voor de auto-fill scrape.</FieldHelp>
        </div>
      </div>

      <div
        style={{
          border: scraped ? "1px solid #a7f3d0" : "1px dashed var(--border-strong)",
          background: scraped ? "var(--success-bg)" : "var(--surface-2)",
          borderRadius: 10,
          padding: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: scraped ? "var(--success)" : "rgba(59,130,246,0.12)",
            color: scraped ? "white" : "var(--secondary)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {scraped ? <CheckCircle size={18} /> : <Wand2 size={18} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--primary)" }}>
            {scraped ? `Ingelezen van ${new URL(scraped.url).hostname}` : "Vul mijn voice + pillars in op basis van mijn website"}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {scraped
              ? "Brand voice, pillars en taal zijn voorgevuld. Check ze in de volgende stappen."
              : "Wij scrapen je homepage en stellen tone of voice, pillars en taal voor."}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={autoFill}
          disabled={scraping || !state.domain.trim()}
        >
          {scraping ? (
            <>
              <RefreshCw size={13} className="spin" /> Lezen…
            </>
          ) : scraped ? (
            <>
              <RefreshCw size={13} /> Opnieuw
            </>
          ) : (
            <>
              <Wand2 size={13} /> Auto-invullen
            </>
          )}
        </button>
      </div>

      <div className="field">
        <label>
          <span>Taal</span>
          <RequiredBadge />
        </label>
        <select className="select" value={state.language} onChange={(e) => update("language", e.target.value)}>
          <option value="nl-NL">Nederlands</option>
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="de-DE">Deutsch</option>
          <option value="fr-FR">Français</option>
          <option value="es-ES">Español</option>
        </select>
        <FieldHelp>Default taal voor gegenereerde content. Bij auto-invullen wordt deze gedetecteerd uit je website.</FieldHelp>
      </div>
    </>
  );
}

function VoiceStep({
  state,
  update,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
}) {
  return (
    <>
      <div className="field">
        <label>
          <span>Brand voice</span>
          <RequiredBadge />
        </label>
        <textarea
          className="textarea"
          rows={6}
          value={state.brandVoice}
          onChange={(e) => update("brandVoice", e.target.value)}
        />
        <FieldHelp>
          2-5 zinnen die uitleggen hoe je site klinkt. Wees concreet: persona
          (je/u/wij), toon (direct/uitleggend), energie. Voorbeeld: "Direct,
          expert, nuchter. Spreek de lezer aan met je. Geen marketingjargon."
        </FieldHelp>
      </div>
      <ChipsField
        label="Ban list"
        description="Woorden/zinnen die NOOIT in gepubliceerde posts mogen voorkomen. Default banlist (delve, leverage, in conclusion, etc.) staat al klaar — voeg eventueel brand-specifieke verboden toe. Optioneel."
        values={state.banList}
        onChange={(v) => update("banList", v)}
      />
      <ChipsField
        label="Signature phrases (optioneel)"
        description="Terugkerende zinnen die jouw brand herkenbaar maken. Writer gebruikt deze waar het natuurlijk past. Optioneel."
        values={state.signaturePhrases}
        onChange={(v) => update("signaturePhrases", v)}
      />
      <div className="field">
        <label>
          <span>Auteursnaam</span>
          <RequiredBadge />
        </label>
        <input
          className="input"
          value={state.authorName}
          onChange={(e) => update("authorName", e.target.value)}
          placeholder="Jouw naam (verschijnt als byline)"
        />
        <FieldHelp>
          Verschijnt onder elke post als byline + in JSON-LD schema (E-E-A-T
          signaal voor Google).
        </FieldHelp>
      </div>
    </>
  );
}

function PillarsStep({
  state,
  update,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
}) {
  const total = state.pillars.reduce((s, p) => s + p.weight, 0);
  function setPillar(i: number, patch: Partial<{ name: string; weight: number }>) {
    update(
      "pillars",
      state.pillars.map((p, idx) => (idx === i ? { ...p, ...patch } : p))
    );
  }
  function add() {
    update("pillars", [...state.pillars, { name: "", weight: 0.1 }]);
  }
  function remove(i: number) {
    update("pillars", state.pillars.filter((_, idx) => idx !== i));
  }
  return (
    <>
      {state.pillars.map((p, i) => (
        <div key={i} className="row" style={{ gap: 10, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Pillar naam</label>
            <input
              className="input"
              value={p.name}
              onChange={(e) => setPillar(i, { name: e.target.value })}
              placeholder="bv. Industry insights"
            />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label>Weight</label>
            <input
              className="input tnum"
              type="number"
              min={0}
              step="0.05"
              value={p.weight}
              onChange={(e) => setPillar(i, { weight: Number(e.target.value) || 0 })}
            />
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => remove(i)}
            disabled={state.pillars.length === 1}
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
    </>
  );
}

function QualityStep({
  state,
  update,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
}) {
  return (
    <>
      <div className="field">
        <label>
          <span>Quality threshold (0–10)</span>
          <RequiredBadge />
        </label>
        <input
          className="input tnum"
          type="number"
          min={0}
          max={10}
          step={0.1}
          value={state.qualityThreshold}
          onChange={(e) => update("qualityThreshold", Number(e.target.value) || 0)}
        />
        <FieldHelp>Drafts met een lagere gewogen score worden automatisch afgewezen. 8.0 = streng, 7.0 = ruimer, 6.0 = mild.</FieldHelp>
      </div>
      <div className="field">
        <label>
          <span>Max posts per week</span>
          <RequiredBadge />
        </label>
        <input
          className="input tnum"
          type="number"
          min={0}
          max={20}
          value={state.maxPostsPerWeek}
          onChange={(e) => update("maxPostsPerWeek", Number(e.target.value) || 0)}
        />
        <FieldHelp>Hard cap. Boven deze cap pauzeert de pipeline (topic krijgt status 'cap_deferred') tot volgende week.</FieldHelp>
      </div>
      <div className="field">
        <label>
          <span>Schedule (cron, UTC)</span>
          <RequiredBadge />
        </label>
        <input className="input mono" value={state.scheduleCron} onChange={(e) => update("scheduleCron", e.target.value)} />
        <FieldHelp>Cron-expressie (5 velden, UTC). Default: maandag/woensdag/vrijdag 06:00 UTC. Manuele triggers blijven altijd werken.</FieldHelp>
      </div>
    </>
  );
}

function PublishStep({
  state,
  update,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
}) {
  return (
    <>
      <div className="field">
        <label>
          <span>Publish destination</span>
          <RequiredBadge />
        </label>
        <div className="row" style={{ gap: 8 }}>
          <DestOpt
            v="built_in"
            cur={state.publishDestination}
            onClick={() => update("publishDestination", "built_in")}
            title="Built-in CMS"
            sub="Posts worden gehost op deze app."
            tag="Aanbevolen"
          />
          <DestOpt
            v="wordpress"
            cur={state.publishDestination}
            onClick={() => update("publishDestination", "wordpress")}
            title="WordPress"
            sub="Posts worden WP-drafts via REST API."
          />
          <DestOpt
            v="markdown"
            cur={state.publishDestination}
            onClick={() => update("publishDestination", "markdown")}
            title="Markdown export"
            sub=".md files in data/exports/."
          />
        </div>
        <FieldHelp>
          Built-in is de snelste start (geen externe setup). Je kunt later
          altijd wisselen onder Settings → Publiceren.
        </FieldHelp>
      </div>
      {state.publishDestination === "wordpress" && (
        <div className="card" style={{ background: "var(--surface-2)" }}>
          <div className="card-body col" style={{ gap: 12 }}>
            <div className="field">
              <label>
                <span>WordPress URL</span>
                <RequiredBadge />
              </label>
              <input className="input" value={state.wpBaseUrl} onChange={(e) => update("wpBaseUrl", e.target.value)} placeholder="https://your-site.com" />
              <FieldHelp>Volledige basis-URL incl. https://.</FieldHelp>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>
                  <span>WP user</span>
                  <RequiredBadge />
                </label>
                <input className="input" value={state.wpUser} onChange={(e) => update("wpUser", e.target.value)} placeholder="blog-bot" />
                <FieldHelp>WP-gebruikersnaam (login, niet display name).</FieldHelp>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>
                  <span>App password</span>
                  <RequiredBadge />
                </label>
                <input className="input" type="password" value={state.wpAppPassword} onChange={(e) => update("wpAppPassword", e.target.value)} />
                <FieldHelp>Application Password uit WP-admin (Users → Profile → Application Passwords). NIET je login-wachtwoord.</FieldHelp>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--primary)" }}>LLM API-keys</h4>
        <p className="hint" style={{ marginBottom: 12 }}>
          Lokaal opgeslagen in SQLite. <strong>Minstens één van Anthropic OF Gemini is verplicht</strong> —
          die doen het schrijfwerk. Groq, Fal.ai en Resend zijn optioneel.
        </p>
        <div className="col" style={{ gap: 10 }}>
          <ApiKeyField label="Anthropic" value={state.apiKeys.anthropic} onChange={(v) => update("apiKeys", { ...state.apiKeys, anthropic: v })} />
          <ApiKeyField label="Gemini" value={state.apiKeys.gemini} onChange={(v) => update("apiKeys", { ...state.apiKeys, gemini: v })} />
          <ApiKeyField label="Groq" value={state.apiKeys.groq} onChange={(v) => update("apiKeys", { ...state.apiKeys, groq: v })} />
          <ApiKeyField label="Fal.ai (optioneel, image gen)" value={state.apiKeys.fal} onChange={(v) => update("apiKeys", { ...state.apiKeys, fal: v })} />
        </div>
      </div>
    </>
  );
}

function DestOpt({
  v,
  cur,
  onClick,
  title,
  sub,
  tag,
}: {
  v: string;
  cur: string;
  onClick: () => void;
  title: string;
  sub: string;
  tag?: string;
}) {
  const active = v === cur;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: 12,
        textAlign: "left",
        background: active ? "rgba(59,130,246,0.06)" : "var(--surface)",
        border: active ? "2px solid var(--secondary)" : "1px solid var(--border)",
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      <div className="row" style={{ gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        {tag && <span className="badge b-blue">{tag}</span>}
      </div>
      <div className="muted" style={{ fontSize: 11 }}>{sub}</div>
    </button>
  );
}

function ApiKeyField({
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
        <input className="input mono" type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder="sk-..." />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setShow((s) => !s)}>
          {show ? "Verberg" : "Toon"}
        </button>
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
