import fs from "node:fs/promises";
import path from "node:path";
import type { Draft, Site } from "~/lib/db/schema";

function escapeYaml(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

/** Decode the handful of entities the writer emits, for literal code output. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function htmlToMarkdown(html: string): string {
  // Minimal HTML → Markdown converter. Good enough for blog posts produced
  // by the writer agent. Users can refine in their static-site generator.
  let md = html;

  // Code first: turn <pre><code> into fenced blocks and inline <code> into
  // backticks, then stash them behind a placeholder so the inline transforms +
  // the final tag-strip below never touch (or eat the `<…>` literals in) their
  // contents. Restored verbatim at the end.
  const codeBlocks: string[] = [];
  const stash = (out: string) => {
    codeBlocks.push(out);
    return `￼cb${codeBlocks.length - 1}￼`;
  };
  md = md.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, c: string) =>
    stash("```\n" + decodeEntities(c.replace(/\r?\n$/, "")) + "\n```\n\n"),
  );
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gis, (_, c: string) =>
    stash("```\n" + decodeEntities(c.trim()) + "\n```\n\n"),
  );
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gis, (_, c: string) =>
    stash("`" + decodeEntities(c.trim()) + "`"),
  );

  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gis, (_, t) => `# ${t.trim()}\n\n`);
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gis, (_, t) => `## ${t.trim()}\n\n`);
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gis, (_, t) => `### ${t.trim()}\n\n`);
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gis, (_, t) => `${t.trim()}\n\n`);
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gis, (_, t) => `- ${t.trim()}\n`);
  md = md.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
  md = md.replace(/<br\s*\/?>/gi, "  \n");
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => `> ${t.trim()}\n\n`);
  md = md.replace(/<[^>]+>/g, "");
  md = md.replace(/\n{3,}/g, "\n\n");
  // Restore code blocks verbatim (after the tag-strip, so their `<…>` survive).
  md = md.replace(/￼cb(\d+)￼/g, (_, i: string) => codeBlocks[Number(i)]);
  return md.trim() + "\n";
}

/**
 * Absolute path to the on-disk exports root (`<data>/exports`). Lives on the
 * mounted `/app/data` volume in production. The `/exports/[...path]` route
 * serves files from here, so the exporter and the route MUST agree on it.
 */
export function exportsBaseDir(): string {
  return path.resolve(process.cwd(), "../../data/exports");
}

/**
 * Write the draft as a Markdown file and return the PUBLIC URL under which the
 * `/exports/[...path]` route serves it (e.g. `/exports/<site>/<slug>.md`).
 * Returning a real URL — not the filesystem path — is what makes the link in
 * the publish toast actually open instead of 404'ing.
 */
export async function exportDraftAsMarkdown(draft: Draft, site: Site): Promise<string> {
  const baseDir = path.join(exportsBaseDir(), site.slug);
  await fs.mkdir(baseDir, { recursive: true });
  const file = path.join(baseDir, `${draft.slug}.md`);

  const frontmatter = [
    "---",
    `title: "${escapeYaml(draft.title)}"`,
    `slug: "${draft.slug}"`,
    `description: "${escapeYaml(draft.metaDescription || draft.tldr)}"`,
    `tldr: "${escapeYaml(draft.tldr)}"`,
    `published: ${new Date().toISOString()}`,
    site.author?.name ? `author: "${escapeYaml(site.author.name)}"` : "",
    draft.imagePath ? `image: "${draft.imagePath}"` : "",
    "---",
    "",
  ].filter(Boolean).join("\n");

  const body = htmlToMarkdown(draft.contentHtml);
  await fs.writeFile(file, frontmatter + "\n" + body, "utf8");
  // Public URL served by app/exports/[...path]/route.ts (encode each segment
  // so unusual slugs don't break the URL).
  return `/exports/${encodeURIComponent(site.slug)}/${encodeURIComponent(`${draft.slug}.md`)}`;
}
