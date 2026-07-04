import Link from "next/link";
import { AlertTriangle, CheckCircle2, Filter } from "lucide-react";

import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import {
  listErrors,
  countErrors,
  type ErrorSource,
  type ErrorSeverity,
} from "~/lib/errors/store";
import { formatRelative } from "~/lib/utils";

export const dynamic = "force-dynamic";

const SOURCES: ErrorSource[] = ["pipeline", "refresh", "scheduler", "http", "api", "other"];
const SEVERITIES: ErrorSeverity[] = ["error", "warn", "fatal"];

const SEVERITY_BADGE: Record<ErrorSeverity, string> = {
  fatal: "b-red",
  error: "b-red",
  warn: "b-yellow",
};
const SEVERITY_LABEL: Record<ErrorSeverity, string> = {
  fatal: "fatal",
  error: "error",
  warn: "warn",
};

const SOURCE_BADGE: Record<ErrorSource, string> = {
  pipeline: "b-blue",
  refresh: "b-blue",
  scheduler: "b-yellow",
  http: "b-gray",
  api: "b-gray",
  other: "b-gray",
};

interface PageProps {
  searchParams: Promise<{
    source?: string;
    severity?: string;
    resolved?: string;
    scope?: string; // "site" | "all"
  }>;
}

function parseFilter<T extends string>(raw: string | undefined, allowed: T[]): T | undefined {
  if (!raw) return undefined;
  return (allowed as string[]).includes(raw) ? (raw as T) : undefined;
}

function truncate(s: string, max = 140): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export default async function ErrorsPage({ searchParams }: PageProps) {
  const site = await requireSite();
  const sp = await searchParams;
  const source = parseFilter(sp.source, SOURCES);
  const severity = parseFilter(sp.severity, SEVERITIES);
  const resolved =
    sp.resolved === "true" ? true : sp.resolved === "false" ? false : "any";
  const scope = sp.scope === "all" ? "all" : "site";

  // "site"-scope: alleen errors die expliciet aan deze site hangen.
  // "all"-scope: deze site PLUS scheduler/platform-rijen (siteId = null) — maar
  // NOOIT rijen van andere tenants (dat was een cross-tenant read-lek).
  const siteFilter: { siteId: string; includeGlobal?: boolean } =
    scope === "all"
      ? { siteId: site.id, includeGlobal: true }
      : { siteId: site.id };

  const [events, counts, pending, topics] = await Promise.all([
    listErrors({
      ...siteFilter,
      source,
      severity,
      resolved,
      limit: 100,
    }),
    countErrors(siteFilter),
    listDraftsForSite(site.id, "pending_review"),
    listTopicsForSite(site.id),
  ]);

  const queuedTopics = topics.filter((t) => t.status === "queued").length;

  return (
    <AdminShell
      site={site}
      pendingDrafts={pending.length}
      queuedTopics={queuedTopics}
      unresolvedErrors={counts.unresolved}
      crumbs={[{ label: "Errors" }]}
    >
      <div className="page-head">
        <div className="ph-text">
          <h1>Errors</h1>
          <div className="ph-sub">
            Centraal aggregatie-overzicht van pipeline-, refresh-, scheduler- en
            HTTP-fouten. {counts.unresolved} unresolved · {counts.resolved} opgelost
            {counts.fatalUnresolved > 0 && (
              <> · <strong style={{ color: "#b91c1c" }}>{counts.fatalUnresolved} fatal</strong></>
            )}
            .
          </div>
        </div>
      </div>

      <FilterBar
        current={{
          source,
          severity,
          resolved,
          scope,
        }}
      />

      {events.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <CheckCircle2 size={28} />
          </div>
          <h2>Geen errors die aan deze filters voldoen</h2>
          <p>Pas de filters aan of geniet van de rust.</p>
        </div>
      ) : (
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Wanneer</th>
                <th style={{ width: 90 }}>Severity</th>
                <th style={{ width: 110 }}>Source</th>
                <th>Message</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ fontSize: 12 }} title={e.ts}>
                    {formatRelative(e.ts)}
                  </td>
                  <td>
                    <span className={`badge ${SEVERITY_BADGE[e.severity]}`}>
                      {e.severity === "fatal" && (
                        <AlertTriangle
                          size={11}
                          style={{ marginRight: 3, verticalAlign: "-2px" }}
                        />
                      )}
                      {SEVERITY_LABEL[e.severity]}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${SOURCE_BADGE[e.source]}`}>{e.source}</span>
                  </td>
                  <td style={{ fontSize: 13, maxWidth: 0 }}>
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={e.message}
                    >
                      {truncate(e.message, 160)}
                    </div>
                    {e.siteId && e.siteId !== site.id && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        site: {e.siteId}
                      </div>
                    )}
                  </td>
                  <td>
                    {e.resolvedAt ? (
                      <span className="badge b-green">opgelost</span>
                    ) : (
                      <span className="badge b-gray">open</span>
                    )}
                  </td>
                  <td>
                    <Link href={`/errors/${e.id}`} className="lnk">
                      details →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

function FilterBar({
  current,
}: {
  current: {
    source?: ErrorSource;
    severity?: ErrorSeverity;
    resolved: boolean | "any";
    scope: "site" | "all";
  };
}) {
  const buildHref = (overrides: Partial<typeof current>) => {
    const merged = { ...current, ...overrides };
    const params = new URLSearchParams();
    if (merged.source) params.set("source", merged.source);
    if (merged.severity) params.set("severity", merged.severity);
    if (merged.resolved === true) params.set("resolved", "true");
    if (merged.resolved === false) params.set("resolved", "false");
    if (merged.scope === "all") params.set("scope", "all");
    const qs = params.toString();
    return qs ? `/errors?${qs}` : "/errors";
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 16,
        alignItems: "center",
      }}
    >
      <Filter size={14} className="muted" style={{ marginRight: 4 }} />

      <FilterChip
        label="alle"
        href={buildHref({ resolved: "any" })}
        active={current.resolved === "any"}
      />
      <FilterChip
        label="open"
        href={buildHref({ resolved: false })}
        active={current.resolved === false}
      />
      <FilterChip
        label="opgelost"
        href={buildHref({ resolved: true })}
        active={current.resolved === true}
      />

      <span className="muted" style={{ margin: "0 8px", fontSize: 11 }}>|</span>

      <FilterChip
        label="alle severities"
        href={buildHref({ severity: undefined })}
        active={!current.severity}
      />
      {SEVERITIES.map((s) => (
        <FilterChip
          key={s}
          label={s}
          href={buildHref({ severity: s })}
          active={current.severity === s}
        />
      ))}

      <span className="muted" style={{ margin: "0 8px", fontSize: 11 }}>|</span>

      <FilterChip
        label="alle sources"
        href={buildHref({ source: undefined })}
        active={!current.source}
      />
      {SOURCES.map((s) => (
        <FilterChip
          key={s}
          label={s}
          href={buildHref({ source: s })}
          active={current.source === s}
        />
      ))}

      <span className="muted" style={{ margin: "0 8px", fontSize: 11 }}>|</span>

      <FilterChip
        label="deze site"
        href={buildHref({ scope: "site" })}
        active={current.scope === "site"}
      />
      <FilterChip
        label="+ systeem"
        href={buildHref({ scope: "all" })}
        active={current.scope === "all"}
      />
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`btn btn-sm ${active ? "btn-primary" : "btn-outline"}`}
      style={{ textTransform: "lowercase" }}
    >
      {label}
    </Link>
  );
}
