import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDraft } from "~/lib/drafts";
import { getCurrentSite } from "~/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;

  // Draft images are PRIVATE, pre-publication, per-tenant assets (unlike
  // post-image, which serves already-public published content). Require a
  // session bound to the owning site.
  const session = await getCurrentSite();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const draft = await getDraft(draftId);
  // 404 (not 403) on cross-tenant / missing so we don't confirm id existence.
  if (!draft || draft.siteId !== session.id || !draft.imagePath) {
    return new NextResponse("Not found", { status: 404 });
  }

  const abs = path.resolve(process.cwd(), "../../", draft.imagePath);
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
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}
