import fs from "node:fs/promises";
import path from "node:path";

import { exportsBaseDir } from "~/lib/publish/markdown";

// Files live on the mounted data volume and change at runtime — never cache.
export const dynamic = "force-dynamic";

/**
 * Public read-only server for Markdown exports written by the publish adapter.
 *
 * The exporter writes to `<data>/exports/<site>/<slug>.md` (persistent volume)
 * and returns `/exports/<site>/<slug>.md` as the post's URL. Next.js only
 * serves `public/` statically, so without this route that URL 404s. Marked
 * public in middleware.ts (the operator chose publicly-accessible exports).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;
  const base = exportsBaseDir();

  // Resolve the requested path and confirm it stays inside the exports root —
  // blocks `..` traversal and absolute-path escapes on a public endpoint.
  const target = path.resolve(base, ...segments);
  if (target !== base && !target.startsWith(base + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const body = await fs.readFile(target);
    const isMarkdown = target.toLowerCase().endsWith(".md");
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": isMarkdown
          ? "text/markdown; charset=utf-8"
          : "application/octet-stream",
        "Content-Disposition": `inline; filename="${path.basename(target)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
