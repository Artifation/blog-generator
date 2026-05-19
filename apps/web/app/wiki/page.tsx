import Link from "next/link";
import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { WikiShell } from "./wiki-shell";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  articlesByCategory,
} from "~/lib/wiki/articles";

export const dynamic = "force-dynamic";

export default async function WikiIndexPage() {
  const site = await requireSite();
  const pendingDrafts = await listDraftsForSite(site.id, "pending_review");
  const topics = await listTopicsForSite(site.id);
  const queued = topics.filter((t) => t.status === "queued").length;
  const byCat = articlesByCategory();

  return (
    <AdminShell
      site={site}
      pendingDrafts={pendingDrafts.length}
      queuedTopics={queued}
      crumbs={[{ label: "Wiki" }]}
    >
      <WikiShell>
        <div style={{ maxWidth: 760 }}>
          <h1 style={{ marginBottom: 6, fontSize: 28 }}>Wiki</h1>
          <p
            className="muted"
            style={{ fontSize: 15, lineHeight: 1.55, marginTop: 0, marginBottom: 24 }}
          >
            Hoe deze tool werkt, hoe blogs ranken in Google, en wat alle
            SEO-vakjargon eigenlijk betekent. Bedoeld als referentie — sla 'm op
            in je bookmarks.
          </p>

          <div className="col" style={{ gap: 18 }}>
            {CATEGORY_ORDER.map((cat) => (
              <section key={cat}>
                <h2
                  style={{
                    fontSize: 14,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    color: "var(--muted, #6b7280)",
                    margin: "0 0 8px 0",
                  }}
                >
                  {CATEGORY_LABEL[cat]}
                </h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 8,
                  }}
                >
                  {byCat[cat].map((a) => (
                    <Link
                      key={a.slug}
                      href={`/wiki/${a.slug}`}
                      style={{
                        display: "block",
                        padding: 12,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        textDecoration: "none",
                        color: "var(--text)",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                        {a.title}
                      </div>
                      <div
                        className="muted"
                        style={{ fontSize: 12, lineHeight: 1.4 }}
                      >
                        {a.summary}
                      </div>
                      <div
                        className="muted"
                        style={{ fontSize: 10, marginTop: 6 }}
                      >
                        {a.readMinutes} min lezen
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </WikiShell>
    </AdminShell>
  );
}
