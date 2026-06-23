"use client";

import * as React from "react";
import type { SiteWithPillars } from "~/lib/sites";
import { SectionIntro } from "~/components/ui/form-help";
import { Field } from "../shared";
import { CardHead } from "../card-head";
import { useAutoSave } from "../use-auto-save";

interface Props {
  site: SiteWithPillars;
}

export function PublishTab({ site }: Props) {
  return (
    <div className="col gap-lg" style={{ paddingBottom: 40 }}>
      <QualityCard site={site} />
      <DestinationCard site={site} />
    </div>
  );
}

function QualityCard({ site }: Props) {
  const [qualityThreshold, setQt] = React.useState(site.qualityThreshold);
  const [maxPostsPerWeek, setMpw] = React.useState(site.maxPostsPerWeek);
  const [scheduleCron, setSc] = React.useState(site.scheduleCron);

  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Kwaliteit & cadans",
    values: { qualityThreshold, maxPostsPerWeek, scheduleCron },
  });

  return (
    <div className="card">
      <CardHead
        title="Kwaliteit & cadans"
        description="Drempelwaardes voor publish + schedule."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Drafts onder de threshold worden automatisch rejected. De cron-schedule wordt
          op de VPS uitgevoerd door de in-process scheduler.
        </SectionIntro>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Quality threshold (0–10)" required help="8.0 is streng, 7.0 ruimer.">
            <input
              className="input tnum"
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={qualityThreshold}
              onChange={(e) => setQt(Number(e.target.value) || 0)}
              onBlur={flush}
            />
          </Field>
          <Field label="Max posts / week" required help="Hard cap voor de pipeline.">
            <input
              className="input tnum"
              type="number"
              min={0}
              value={maxPostsPerWeek}
              onChange={(e) => setMpw(Number(e.target.value) || 0)}
              onBlur={flush}
            />
          </Field>
          <Field label="Schedule (cron, UTC)" required help="Default: ma/wo/vr 06:00 UTC.">
            <input
              className="input mono"
              value={scheduleCron}
              onChange={(e) => setSc(e.target.value)}
              onBlur={flush}
              placeholder="0 6 * * 1,3,5"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function DestinationCard({ site }: Props) {
  const [publishDestination, setPd] = React.useState(site.publishDestination);
  const [wp, setWp] = React.useState(site.wordpressConfig);

  const { status, flush } = useAutoSave({
    siteId: site.id,
    cardKey: "Publiceren",
    values: { publishDestination, wordpressConfig: wp },
  });

  const setPdAndSave = (next: typeof publishDestination) => {
    setPd(next);
    setTimeout(flush, 0);
  };

  return (
    <div className="card">
      <CardHead
        title="Publiceren"
        description="Waar finale posts naartoe gaan."
        status={status}
        onRetry={flush}
      />
      <div className="card-body col" style={{ gap: 14 }}>
        <SectionIntro>
          Built-in CMS = posts gerenderd op deze webapp. WordPress = via REST API.
          Markdown = .md-bestanden in data/exports/.
        </SectionIntro>
        <Field label="Bestemming" required help="Default 'Built-in CMS' — werkt direct.">
          <select
            className="select"
            value={publishDestination}
            onChange={(e) => setPdAndSave(e.target.value as typeof publishDestination)}
          >
            <option value="built_in">Built-in CMS</option>
            <option value="wordpress">WordPress</option>
            <option value="markdown">Markdown export</option>
          </select>
        </Field>
        {publishDestination === "wordpress" && (
          <div className="card" style={{ background: "var(--surface-2)" }}>
            <div className="card-body col" style={{ gap: 12 }}>
              <SectionIntro>
                WordPress credentials. Vereist een Application Password, niet je
                gewone wachtwoord.
              </SectionIntro>
              <Field label="WordPress URL" required help="Volledige basis-URL incl. https://">
                <input
                  className="input"
                  value={wp?.baseUrl ?? ""}
                  onChange={(e) => setWp({ ...(wp ?? { user: "", appPassword: "" }), baseUrl: e.target.value })}
                  onBlur={flush}
                  placeholder="https://blog.example.com"
                />
              </Field>
              <div className="row" style={{ gap: 12 }}>
                <Field label="User" required help="WP-gebruikersnaam.">
                  <input
                    className="input"
                    value={wp?.user ?? ""}
                    onChange={(e) => setWp({ ...(wp ?? { baseUrl: "", appPassword: "" }), user: e.target.value })}
                    onBlur={flush}
                  />
                </Field>
                <Field label="App password" required help="Application Password uit WP-admin.">
                  <input
                    className="input"
                    type="password"
                    value={wp?.appPassword ?? ""}
                    onChange={(e) => setWp({ ...(wp ?? { baseUrl: "", user: "" }), appPassword: e.target.value })}
                    onBlur={flush}
                    placeholder="xxxx xxxx xxxx xxxx"
                  />
                </Field>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
