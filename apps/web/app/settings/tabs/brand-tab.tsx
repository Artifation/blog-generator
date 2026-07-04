"use client";

import * as React from "react";
import type { SiteWithPillars } from "~/lib/sites";
import { slugify } from "~/lib/utils";
import { SectionIntro } from "~/components/ui/form-help";
import { Field, PillarEditor, ChipsField } from "../shared";
import type { Pillar } from "../shared";
import { CardHead } from "../card-head";
import { useAutoSave } from "../use-auto-save";

interface Props {
  site: SiteWithPillars;
}

export function BrandTab({ site }: Props) {
  return (
    <div className="col gap-lg" style={{ paddingBottom: 40 }}>
      <BasicsCard site={site} />
      <VoiceCard site={site} />
      <PillarsCard site={site} />
      <AuthorCard site={site} />
    </div>
  );
}

function BasicsCard({ site }: Props) {
  const [name, setName] = React.useState(site.name);
  const [slug, setSlug] = React.useState(site.slug);
  const [domain, setDomain] = React.useState(site.domain);
  const [language, setLanguage] = React.useState(site.language);

  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Basis",
    values: { name, slug, domain, language },
  });

  return (
    <div className="card">
      <CardHead
        title="Basis"
        description="Naam, slug, domein en taal van deze site."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Deze waardes worden gebruikt op de gepubliceerde blog (titel, URL-structuur)
          en sturen alle agents (taal-detectie, brand voice). Wijzig de slug alleen
          als de site nog niet live is — bestaande URL's wijzigen niet retroactief.
        </SectionIntro>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Naam" required help="Wordt zichtbaar als author/publisher.">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={flush}
              placeholder="Artifation"
            />
          </Field>
          <Field label="Slug" required help="URL-veilige identifier.">
            <input
              className="input mono"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              onBlur={flush}
              placeholder="artifation"
            />
          </Field>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Domein" required help="Echte domein zonder protocol.">
            <input
              className="input"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onBlur={flush}
              placeholder="artifation.nl"
            />
          </Field>
          <Field label="Taal" required help="Default taal voor gegenereerde content.">
            <select
              className="select"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setTimeout(flush, 0);
              }}
            >
              <option value="nl-NL">Nederlands</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="de-DE">Deutsch</option>
              <option value="fr-FR">Français</option>
              <option value="es-ES">Español</option>
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}

function VoiceCard({ site }: Props) {
  const [brandVoice, setBrandVoice] = React.useState(site.brandVoice);
  const [banList, setBanList] = React.useState<string[]>(site.banList ?? []);
  const [signaturePhrases, setSignaturePhrases] = React.useState<string[]>(site.signaturePhrases ?? []);

  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Brand voice",
    values: { brandVoice, banList, signaturePhrases },
  });

  const setBanListAndSave = React.useCallback((v: string[]) => {
    setBanList(v);
    setTimeout(flush, 0);
  }, [flush]);
  const setSigAndSave = React.useCallback((v: string[]) => {
    setSignaturePhrases(v);
    setTimeout(flush, 0);
  }, [flush]);

  return (
    <div className="card">
      <CardHead
        title="Brand voice"
        description="Hoe moet de writer klinken — en wat te vermijden."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Brand voice is het tweede sterkste signaal voor de writer (na de outline).
          Wees concreet: persona, toon, energie.
        </SectionIntro>
        <Field label="Voice" required help="2-5 zinnen die uitleggen hoe je site klinkt.">
          <textarea
            className="textarea"
            rows={6}
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            onBlur={flush}
            placeholder="Direct, expert, nuchter — geen marketingjargon..."
          />
        </Field>
        <ChipsField
          label="Ban list"
          optional
          description="Woorden die NOOIT in gepubliceerde posts mogen voorkomen."
          values={banList}
          onChange={setBanListAndSave}
        />
        <ChipsField
          label="Signature phrases"
          optional
          description="Korte zinnen die jouw brand herkenbaar maken."
          values={signaturePhrases}
          onChange={setSigAndSave}
        />
      </div>
    </div>
  );
}

function PillarsCard({ site }: Props) {
  // Map DB Pillar (has id, siteId, sortOrder) to the shared Pillar shape
  // ({ slug?: string; name: string; weight: number }) so useAutoSave receives
  // a value that satisfies UpdateSiteInput["pillars"].
  const [pillars, setPillars] = React.useState<Pillar[]>(() =>
    site.pillars.map((p) => ({ slug: p.slug, name: p.name, weight: p.weight }))
  );
  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Pillars",
    values: { pillars },
  });

  const setPillarsAndSave = React.useCallback((v: Pillar[]) => {
    setPillars(v);
    setTimeout(flush, 0);
  }, [flush]);

  return (
    <div className="card">
      <CardHead
        title="Pillars"
        description="Content pillars sturen topic-selectie en het topic-suggester-agent."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Pillars zijn de hoofd-thema's van je blog. Weights normaliseren bij opslaan naar 1.0.
        </SectionIntro>
        <PillarEditor pillars={pillars} onChange={setPillarsAndSave} />
      </div>
    </div>
  );
}

function AuthorCard({ site }: Props) {
  const [author, setAuthor] = React.useState(site.author);
  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Auteur",
    values: { author },
  });

  return (
    <div className="card">
      <CardHead
        title="Auteur"
        description="De byline op gepubliceerde posts."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Wordt gebruikt in JSON-LD schema en op de zichtbare byline.
        </SectionIntro>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Naam" required help="Volledige naam van de auteur.">
            <input
              className="input"
              value={author.name ?? ""}
              onChange={(e) => setAuthor({ ...author, name: e.target.value })}
              onBlur={flush}
              placeholder="Julian Dunsbergen"
            />
          </Field>
          <Field label="LinkedIn URL" help="LinkedIn-profiel — E-E-A-T signaal.">
            <input
              className="input"
              value={author.linkedin ?? ""}
              onChange={(e) => setAuthor({ ...author, linkedin: e.target.value })}
              onBlur={flush}
              placeholder="https://www.linkedin.com/in/..."
            />
          </Field>
        </div>
        <Field label="Bio" help="1-3 zinnen over de auteur.">
          <textarea
            className="textarea"
            rows={3}
            value={author.bio ?? ""}
            onChange={(e) => setAuthor({ ...author, bio: e.target.value })}
            onBlur={flush}
          />
        </Field>
      </div>
    </div>
  );
}
