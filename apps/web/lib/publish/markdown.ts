import fs from "node:fs/promises";
import path from "node:path";
import type { Draft, Site } from "~/lib/db/schema";

function escapeYaml(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

function htmlToMarkdown(html: string): string {
  // Minimal HTML → Markdown converter. Good enough for blog posts produced
  // by the writer agent. Users can refine in their static-site generator.
  let md = html;
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
  return md.trim() + "\n";
}

export async function exportDraftAsMarkdown(draft: Draft, site: Site): Promise<string> {
  const baseDir = path.resolve(process.cwd(), "../../data/exports", site.slug);
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
  return path.relative(path.resolve(process.cwd(), "../../"), file).replace(/\\/g, "/");
}
