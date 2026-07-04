"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SiteWithPillars } from "~/lib/sites";
import { SectionIntro, FieldHelp, OptionalBadge, RequiredBadge } from "~/components/ui/form-help";
import { CardHead } from "../card-head";
import { useAutoSave } from "../use-auto-save";

interface Props {
  site: SiteWithPillars;
}

export function IntegrationsTab({ site }: Props) {
  return (
    <div className="col gap-lg" style={{ paddingBottom: 40 }}>
      <GeminiCard site={site} />
      <AdvancedSection site={site} />
    </div>
  );
}

function GeminiCard({ site }: Props) {
  const [gemini, setGemini] = React.useState(site.apiKeys?.gemini ?? "");
  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Gemini",
    values: { apiKeys: { ...site.apiKeys, gemini } },
  });
  const [show, setShow] = React.useState(false);

  return (
    <div className="card">
      <CardHead title="Gemini API-key" status={status} onRetry={flush} />
      <div className="card-body col" style={{ gap: 10 }}>
        <SectionIntro>
          De enige key die je écht nodig hebt. Powert alle agents (writer, researcher,
          topic-suggester, image-prompter, audit). Krijg er één op{" "}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com
          </a>{" "}
          — gratis tier voldoende voor een paar posts per week.
        </SectionIntro>
        <label>
          <span>Gemini</span>
          <RequiredBadge />
        </label>
        <div className="row" style={{ gap: 6 }}>
          <input
            className="input mono"
            type={show ? "text" : "password"}
            value={gemini}
            onChange={(e) => setGemini(e.target.value)}
            onBlur={flush}
            placeholder="AIza…"
          />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShow((s) => !s)}>
            {show ? "Verberg" : "Toon"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdvancedSection({ site }: Props) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="card-header"
        style={{ background: "transparent", border: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
      >
        <div>
          <h3>Geavanceerd</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Override-keys voor specifieke providers en extra features (GSC, DataForSEO).
          </div>
        </div>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && (
        <div className="card-body col" style={{ gap: 14 }}>
          <ApiKeyOverrideCard
            site={site}
            title="Anthropic (override)"
            description="LLM-override voor writer/strategist/factChecker/qualityJudge."
            fallbackNote="Zonder Anthropic: deze agents draaien op Gemini (default)."
            apiKeyName="anthropic"
            placeholder="sk-ant-…"
          />
          <ApiKeyOverrideCard
            site={site}
            title="Groq (override)"
            description="Snelle, goedkope LLM voor image-prompter."
            fallbackNote="Zonder Groq: image-prompter draait op Gemini."
            apiKeyName="groq"
            placeholder="gsk_…"
          />
          <ApiKeyOverrideCard
            site={site}
            title="Fal.ai — premium image-gen"
            description="Genereert de afbeelding bovenaan elke post (Flux Pro)."
            fallbackNote="Zonder Fal: images draaien op Gemini Imagen 3 (gebruikt je Gemini-key). Iets ander kwaliteits-profiel, maar gewoon werkend."
            apiKeyName="fal"
            placeholder="fal_…"
          />
          <ApiKeyOverrideCard
            site={site}
            title="Resend — e-mail notificaties"
            description="Stuurt mail bij nieuwe drafts en topic-voorstellen."
            fallbackNote="Zonder Resend: je ziet alles alleen in het dashboard."
            apiKeyName="resend"
            placeholder="re_…"
          />
          <GscCard site={site} />
          <DfsCard site={site} />
        </div>
      )}
    </div>
  );
}

function ApiKeyOverrideCard({
  site,
  title,
  description,
  fallbackNote,
  apiKeyName,
  placeholder,
}: {
  site: SiteWithPillars;
  title: string;
  description: React.ReactNode;
  fallbackNote: string;
  apiKeyName: "anthropic" | "groq" | "fal" | "resend";
  placeholder: string;
}) {
  const [value, setValue] = React.useState(site.apiKeys?.[apiKeyName] ?? "");
  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: title,
    values: { apiKeys: { ...site.apiKeys, [apiKeyName]: value } },
  });
  const [show, setShow] = React.useState(false);
  return (
    <div className="card" style={{ background: "var(--surface-2)" }}>
      <CardHead title={title} description={description} status={status} onRetry={flush} />
      <div className="card-body col" style={{ gap: 8 }}>
        <label>
          <span>API-key</span>
          <OptionalBadge />
        </label>
        <div className="row" style={{ gap: 6 }}>
          <input
            className="input mono"
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={flush}
            placeholder={placeholder}
          />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShow((s) => !s)}>
            {show ? "Verberg" : "Toon"}
          </button>
        </div>
        <FieldHelp>{fallbackNote}</FieldHelp>
      </div>
    </div>
  );
}

function GscCard({ site }: Props) {
  // Migrate the GSC section from settings-form.tsx (around lines 354-429 in the original).
  // The section toggles GSC via features.search_console.enabled, takes property URL,
  // and accepts a service-account JSON pasted into apiKeys.gscServiceAccountJson.
  const initialSc = (() => {
    const sc = (site.features ?? {}).search_console;
    if (sc && typeof sc === "object") return sc as { enabled?: boolean; property_url?: string };
    return {} as { enabled?: boolean; property_url?: string };
  })();
  const [enabled, setEnabled] = React.useState(initialSc.enabled ?? false);
  const [propertyUrl, setPropertyUrl] = React.useState(initialSc.property_url ?? "");
  const [gscJson, setGscJson] = React.useState(site.apiKeys?.gscServiceAccountJson ?? "");

  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Google Search Console",
    values: {
      features: { ...(site.features ?? {}), search_console: { enabled, property_url: propertyUrl } },
      apiKeys: { ...site.apiKeys, gscServiceAccountJson: gscJson },
    },
  });

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
    <div className="card" style={{ background: "var(--surface-2)" }}>
      <CardHead
        title="Google Search Console"
        description="Voedt 'AI-suggesties' met striking-distance queries en content-gaps uit GSC."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 10 }}>
        <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setTimeout(flush, 0);
            }}
          />
          <span>Search Console gebruiken</span>
        </label>
        <label>
          <span>Property URL</span>
          {enabled ? <RequiredBadge /> : <OptionalBadge />}
        </label>
        <input
          className="input mono"
          value={propertyUrl}
          onChange={(e) => setPropertyUrl(e.target.value)}
          onBlur={flush}
          placeholder="sc-domain:jouwsite.nl"
          disabled={!enabled}
        />
        <FieldHelp>
          Domain-property: <code>sc-domain:artifation.nl</code>. URL-prefix: <code>https://artifation.nl/</code> (mét trailing slash).
        </FieldHelp>
        <label>
          <span>Service account JSON</span>
          {enabled ? <RequiredBadge /> : <OptionalBadge />}
        </label>
        <textarea
          className="textarea mono"
          rows={6}
          value={gscJson}
          onChange={(e) => setGscJson(e.target.value)}
          onBlur={flush}
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
      </div>
    </div>
  );
}

function DfsCard({ site }: Props) {
  // Migrate the DataForSEO section from settings-form.tsx (around lines 431-504 in the original).
  const [login, setLogin] = React.useState(site.apiKeys?.dataForSeoLogin ?? "");
  const [password, setPassword] = React.useState(site.apiKeys?.dataForSeoPassword ?? "");
  const [langCode, setLangCode] = React.useState(site.apiKeys?.dataForSeoLanguageCode ?? "");
  const [locCode, setLocCode] = React.useState(site.apiKeys?.dataForSeoLocationCode ?? "");

  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "DataForSEO",
    values: {
      apiKeys: {
        ...site.apiKeys,
        dataForSeoLogin: login,
        dataForSeoPassword: password,
        dataForSeoLanguageCode: langCode,
        dataForSeoLocationCode: locCode,
      },
    },
  });

  return (
    <div className="card" style={{ background: "var(--surface-2)" }}>
      <CardHead
        title="DataForSEO (betaald)"
        description="Echte maandelijkse search volumes + SERP-aware audit. ~$0.0075 per pillar."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 10 }}>
        <SectionIntro>
          Helemaal optioneel. Zonder credentials valt Suggest topics terug op de
          gratis GSC + Gemini stack. Maak een account op{" "}
          <a href="https://dataforseo.com/" target="_blank" rel="noreferrer">dataforseo.com</a>{" "}
          en gebruik je API-credentials (Login → API-tab).
        </SectionIntro>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Login (email) <OptionalBadge /></label>
            <input
              className="input mono"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              onBlur={flush}
              placeholder="jouw-dfs-account@example.com"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>API password <OptionalBadge /></label>
            <input
              className="input mono"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={flush}
              placeholder="********"
            />
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Taal (ISO code) <OptionalBadge /></label>
            <input
              className="input mono"
              value={langCode}
              onChange={(e) => setLangCode(e.target.value)}
              onBlur={flush}
              placeholder="nl"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Locatie (DFS code) <OptionalBadge /></label>
            <input
              className="input tnum"
              inputMode="numeric"
              value={locCode}
              onChange={(e) => setLocCode(e.target.value.replace(/\D/g, ""))}
              onBlur={flush}
              placeholder="2528"
            />
            <FieldHelp>NL = 2528, US = 2840, DE = 2276, BE = 2056.</FieldHelp>
          </div>
        </div>
      </div>
    </div>
  );
}
