import { getSiteBySlug } from "~/lib/sites";
import { listPublishedPostsForSite } from "~/lib/drafts";

export const dynamic = "force-dynamic";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Per-site XML sitemap for the built-in public blog: lists the blog index plus
 * every published post. Discoverable at /blog/<siteSlug>/sitemap.xml.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteSlug: string }> },
): Promise<Response> {
  const { siteSlug } = await params;
  const site = await getSiteBySlug(siteSlug);
  if (!site) return new Response("Not found", { status: 404 });

  const origin = new URL(req.url).origin;
  const posts = await listPublishedPostsForSite(site.id);

  const entries = [
    { loc: `${origin}/blog/${site.slug}`, lastmod: undefined as string | undefined },
    ...posts.map((p) => ({
      loc: `${origin}/blog/${site.slug}/${p.slug}`,
      lastmod: p.publishedAt,
    })),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map(
        (e) =>
          `  <url><loc>${xmlEscape(e.loc)}</loc>` +
          (e.lastmod ? `<lastmod>${xmlEscape(e.lastmod)}</lastmod>` : "") +
          `</url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
