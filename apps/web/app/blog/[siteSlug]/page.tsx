import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSiteBySlug } from "~/lib/sites";
import { listPublishedPostsForSite } from "~/lib/drafts";
import { LogoMark } from "~/components/brand/logo-mark";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}): Promise<Metadata> {
  const { siteSlug } = await params;
  const site = await getSiteBySlug(siteSlug);
  if (!site) return { title: "Not found" };
  return {
    title: `${site.name} — Blog`,
    description: `Laatste posts van ${site.name}`,
    alternates: { canonical: `/blog/${site.slug}` },
  };
}

export default async function PublicBlogIndex({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;
  const site = await getSiteBySlug(siteSlug);
  if (!site) notFound();
  const posts = (await listPublishedPostsForSite(site.id)).filter((p) => !p.externalUrl);

  return (
    <div className="app public">
      <div className="pub-shell">
        <nav className="pub-nav">
          <Link href={`/blog/${site.slug}`} className="pub-brand">
            <span className="logo-mark">
              <LogoMark size={22} />
            </span>
            {site.name}
          </Link>
          <div className="pub-links">
            <Link href="/login">Inloggen ↗</Link>
          </div>
        </nav>

        <div className="pub-hero">
          <h1>Het laatste van {site.name}.</h1>
          <p className="pub-sub">
            {posts.length === 0
              ? "Binnenkort de eerste post — kom snel terug."
              : `${posts.length} ${posts.length === 1 ? "post" : "posts"} geschreven door zes AI-agents en handmatig goedgekeurd.`}
          </p>
        </div>

        {posts.length > 0 && (
          <div className="pub-list">
            {posts.map((p) => (
              <Link key={p.id} href={`/blog/${site.slug}/${p.slug}`} className="pub-row">
                <div>
                  <h2>{p.title}</h2>
                  <p className="pub-row-tldr">{p.tldr}</p>
                  <div className="pub-row-meta">
                    {p.pillarSlug && <span className="badge b-navy">{p.pillarSlug}</span>}
                    <time>
                      {new Date(p.publishedAt).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </time>
                  </div>
                </div>
                <div className="pub-img" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <div className="pf-brand">
            <span style={{ color: "var(--secondary)" }}>
              <LogoMark size={22} />
            </span>
            <span>{site.name}</span>
          </div>
          <div className="pf-links">
            <span>Geleverd door Artifation</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
