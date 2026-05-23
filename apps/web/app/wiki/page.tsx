import Link from "next/link";
import {
  BookOpen,
  Compass,
  Sparkles,
  Target,
  PenTool,
  ListChecks,
  LineChart,
  GraduationCap,
  ArrowRight,
} from "lucide-react";
import { requireSite } from "~/lib/auth";
import { AdminShell } from "~/components/layout/app-shell";
import { listDraftsForSite } from "~/lib/drafts";
import { listTopicsForSite } from "~/lib/topics";
import { WikiShell } from "./wiki-shell";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  articlesByCategory,
  ARTICLE_BY_SLUG,
  type WikiCategory,
} from "~/lib/wiki/articles";
import { getWikiSearchIndex } from "~/lib/wiki/search-index";

export const dynamic = "force-dynamic";

const CATEGORY_ICON: Record<WikiCategory, React.ComponentType<{ size?: number }>> = {
  starten: Compass,
  blueprint: Sparkles,
  seo: Target,
  schrijven: PenTool,
  rubric: ListChecks,
  data: LineChart,
  termen: GraduationCap,
};

const CATEGORY_DESC: Record<WikiCategory, string> = {
  starten: "Wat de tool doet, hoe je 'm gebruikt.",
  blueprint:
    "Élke parameter van een ranking-bare blog, in exacte getallen.",
  seo: "Hoe Google rankt, intent, schema, snelheid, AI Overviews.",
  schrijven: "Brand voice, koppen, meta-tags, anti-AI-clichés.",
  rubric: "De 8 quality-dimensies en hoe ze gescoord worden.",
  data: "GSC vs DataForSEO en keyword-research praktisch.",
  termen: "Alle vakjargon op één pagina, gelinkt waar relevant.",
};

const RECOMMENDED_PATH: Array<{ slug: string; note: string }> = [
  { slug: "hoe-de-tool-werkt", note: "Begrijp eerst wat er onder de motorkap gebeurt." },
  { slug: "perfecte-blog-blueprint", note: "DE referentie — bookmark deze pagina." },
  { slug: "hoe-een-blog-rankt", note: "De vijf SEO-fundamenten, in volgorde van impact." },
  { slug: "search-intent", note: "De #1 ranking-fout vermijden." },
  { slug: "on-page-seo-checklist", note: "Per-post checklist om af te vinken." },
  { slug: "e-e-a-t", note: "Hoe Google vakkundigheid herkent." },
];

export default async function WikiIndexPage() {
  const site = await requireSite();
  const pendingDrafts = await listDraftsForSite(site.id, "pending_review");
  const topics = await listTopicsForSite(site.id);
  const queued = topics.filter((t) => t.status === "queued").length;
  const byCat = articlesByCategory();
  const searchIndex = getWikiSearchIndex().map((e) => ({
    slug: e.slug,
    text: e.text,
  }));

  const totalArticles = Object.values(byCat).reduce((n, arr) => n + arr.length, 0);
  const totalReadMin = Object.values(byCat)
    .flat()
    .reduce((n, a) => n + a.readMinutes, 0);

  return (
    <AdminShell
      site={site}
      pendingDrafts={pendingDrafts.length}
      queuedTopics={queued}
      crumbs={[{ label: "Wiki" }]}
    >
      <WikiShell searchIndex={searchIndex}>
        <div style={{ maxWidth: 880 }}>
          {/* ----------------------------- Hero ----------------------------- */}
          <section
            style={{
              background:
                "linear-gradient(135deg, rgba(59,130,246,0.10), rgba(99,102,241,0.06))",
              border: "1px solid rgba(59,130,246,0.25)",
              borderRadius: 12,
              padding: "22px 24px",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(59,130,246,0.12)",
                color: "var(--secondary, #3b82f6)",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                padding: "3px 10px",
                borderRadius: 999,
                marginBottom: 10,
              }}
            >
              <BookOpen size={12} /> Wiki & SEO-referentie
            </div>
            <h1 style={{ fontSize: 30, marginTop: 0, marginBottom: 8, lineHeight: 1.2 }}>
              Hoe je blogs schrijft die <em>ranken</em> in Google.
            </h1>
            <p
              className="muted"
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                margin: 0,
                marginBottom: 14,
                color: "var(--muted, #4b5563)",
              }}
            >
              Hoe de tool werkt, hoe SEO anno 2026 werkt, en de exacte cijfers
              waar een perfecte blog aan moet voldoen — woorden, koppen, meta-tags,
              schema, snelheid. Geen meningen, alleen targets. Bookmark deze pagina.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link
                href="/wiki/perfecte-blog-blueprint"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--secondary, #3b82f6)",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 7,
                  textDecoration: "none",
                }}
              >
                <Sparkles size={14} /> Lees de perfecte-blog blauwdruk
                <ArrowRight size={14} />
              </Link>
              <Link
                href="/wiki/on-page-seo-checklist"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 7,
                  textDecoration: "none",
                }}
              >
                <ListChecks size={14} /> On-page checklist
              </Link>
            </div>

            <div
              style={{
                display: "flex",
                gap: 18,
                marginTop: 18,
                paddingTop: 14,
                borderTop: "1px solid rgba(59,130,246,0.15)",
                fontSize: 12,
                color: "var(--muted, #6b7280)",
              }}
            >
              <span>
                <strong style={{ color: "var(--text)", fontSize: 14 }}>
                  {totalArticles}
                </strong>{" "}
                artikelen
              </span>
              <span>
                <strong style={{ color: "var(--text)", fontSize: 14 }}>
                  {totalReadMin}
                </strong>{" "}
                min totaal
              </span>
              <span>
                <strong style={{ color: "var(--text)", fontSize: 14 }}>
                  {CATEGORY_ORDER.length}
                </strong>{" "}
                categorieën
              </span>
              <span>
                Laatst bijgewerkt:{" "}
                <strong style={{ color: "var(--text)", fontSize: 13 }}>
                  mei 2026
                </strong>
              </span>
            </div>
          </section>

          {/* ----------------------- Recommended reading path ----------------------- */}
          <section style={{ marginBottom: 28 }}>
            <h2
              style={{
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                color: "var(--muted, #6b7280)",
                margin: "0 0 10px 0",
                fontWeight: 700,
              }}
            >
              Aanbevolen leesvolgorde
            </h2>
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {RECOMMENDED_PATH.map((step, i) => {
                const a = ARTICLE_BY_SLUG[step.slug];
                if (!a) return null;
                return (
                  <li key={step.slug}>
                    <Link
                      href={`/wiki/${a.slug}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "28px 1fr auto",
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 12px",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        marginBottom: 6,
                        textDecoration: "none",
                        color: "var(--text)",
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 999,
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--secondary, #3b82f6)",
                        }}
                      >
                        {i + 1}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--muted, #6b7280)",
                            marginTop: 2,
                          }}
                        >
                          {step.note}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--muted, #9ca3af)",
                          fontFamily: "monospace",
                        }}
                      >
                        {a.readMinutes} min
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* ----------------------- All categories ----------------------- */}
          <section>
            <h2
              style={{
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                color: "var(--muted, #6b7280)",
                margin: "0 0 12px 0",
                fontWeight: 700,
              }}
            >
              Alle categorieën
            </h2>
            <div className="col" style={{ gap: 22 }}>
              {CATEGORY_ORDER.map((cat) => {
                const Icon = CATEGORY_ICON[cat];
                return (
                  <section key={cat}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 7,
                          background: "rgba(59,130,246,0.10)",
                          color: "var(--secondary, #3b82f6)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Icon size={16} />
                      </div>
                      <div>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: 16,
                            fontWeight: 700,
                          }}
                        >
                          {CATEGORY_LABEL[cat]}
                        </h3>
                        <div
                          className="muted"
                          style={{
                            fontSize: 12,
                            color: "var(--muted, #6b7280)",
                            lineHeight: 1.4,
                          }}
                        >
                          {CATEGORY_DESC[cat]}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(260px, 1fr))",
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
                            borderRadius: 8,
                            textDecoration: "none",
                            color: "var(--text)",
                            transition: "border-color 0.15s",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              marginBottom: 4,
                              lineHeight: 1.3,
                            }}
                          >
                            {a.title}
                          </div>
                          <div
                            className="muted"
                            style={{
                              fontSize: 12,
                              lineHeight: 1.45,
                              color: "var(--muted, #6b7280)",
                            }}
                          >
                            {a.summary}
                          </div>
                          <div
                            className="muted"
                            style={{
                              fontSize: 10,
                              marginTop: 8,
                              color: "var(--muted, #9ca3af)",
                              fontFamily: "monospace",
                            }}
                          >
                            {a.readMinutes} min lezen
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        </div>
      </WikiShell>
    </AdminShell>
  );
}
