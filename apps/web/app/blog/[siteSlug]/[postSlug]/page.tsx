import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSiteBySlug } from "~/lib/sites";
import { getPublishedPostBySlug } from "~/lib/drafts";
import { LogoMark } from "~/components/brand/logo-mark";
import { sanitizeContentHtml } from "~/lib/security/sanitize-html";

/** Escape `<` so a `</script>` in any field can't break out of the JSON-LD block. */
function jsonLdSafe(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteSlug: string; postSlug: string }>;
}): Promise<Metadata> {
  const { siteSlug, postSlug } = await params;
  const site = await getSiteBySlug(siteSlug);
  if (!site) return { title: "Not found" };
  const post = await getPublishedPostBySlug(site.id, postSlug);
  if (!post) return { title: "Not found" };
  return {
    title: post.metaTitle || post.title,
    description: post.metaDescription || post.tldr,
    alternates: { canonical: `/blog/${site.slug}/${post.slug}` },
    openGraph: {
      title: post.metaTitle || post.title,
      description: post.metaDescription || post.tldr,
      type: "article",
      images: post.imagePath ? [`/api/post-image/${post.id}`] : undefined,
    },
  };
}

export default async function PublicPostPage({
  params,
}: {
  params: Promise<{ siteSlug: string; postSlug: string }>;
}) {
  const { siteSlug, postSlug } = await params;
  const site = await getSiteBySlug(siteSlug);
  if (!site) notFound();
  const post = await getPublishedPostBySlug(site.id, postSlug);
  if (!post) notFound();

  const author = site.author as { name?: string; linkedin?: string; bio?: string };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription || post.tldr,
    image: post.imagePath ? [`/api/post-image/${post.id}`] : undefined,
    datePublished: post.publishedAt,
    author: author?.name
      ? { "@type": "Person", name: author.name, url: author.linkedin }
      : undefined,
    publisher: { "@type": "Organization", name: site.name },
    mainEntityOfPage: `/blog/${site.slug}/${post.slug}`,
  };

  const authorInitials =
    (author?.name ?? "")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "·";

  return (
    <div className="app public">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }}
      />

      <div className="pub-shell">
        <nav className="pub-nav">
          <Link href={`/blog/${site.slug}`} className="pub-brand">
            <span className="logo-mark">
              <LogoMark size={22} />
            </span>
            {site.name}
          </Link>
          <div className="pub-links">
            <Link href={`/blog/${site.slug}`}>← Alle posts</Link>
          </div>
        </nav>
      </div>

      <article className="pub-article">
        <div className="pub-meta-top">
          {post.pillarSlug && <span className="badge b-navy">{post.pillarSlug}</span>}
          <time>
            {new Date(post.publishedAt).toLocaleDateString("nl-NL", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        </div>
        <h1>{post.title}</h1>

        {author?.name && (
          <div className="byline">
            <div className="author-avatar">{authorInitials}</div>
            <div>
              <div className="author">{author.name}</div>
              {author?.bio && <div className="date">{author.bio}</div>}
            </div>
          </div>
        )}

        {post.imagePath && (
          <img
            src={`/api/post-image/${post.id}`}
            alt={post.imageAlt ?? post.title}
            style={{ width: "100%", height: "auto", borderRadius: 10, marginBottom: 24 }}
          />
        )}

        {post.tldr && (
          <div className="tldr-box">
            <strong>TL;DR.</strong> {post.tldr}
          </div>
        )}

        <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(post.contentHtml) }} />
      </article>

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
