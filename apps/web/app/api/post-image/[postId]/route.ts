import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "~/lib/db/client";
import { publishedPosts } from "~/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  await ensureSchema();
  const db = getDb();
  const rows = await db.select().from(publishedPosts).where(eq(publishedPosts.id, postId)).limit(1);
  const post = rows[0];
  if (!post?.imagePath) return new NextResponse("Not found", { status: 404 });
  const abs = path.resolve(process.cwd(), "../../", post.imagePath);
  // Published content is public; read async so a busy disk doesn't block the
  // event loop for other requests.
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(abs);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const ext = path.extname(abs).slice(1).toLowerCase();
  const contentType = ext === "avif" ? "image/avif" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
  });
}
