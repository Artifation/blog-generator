import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDraft } from "~/lib/drafts";

export async function GET(_req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const draft = await getDraft(draftId);
  if (!draft?.imagePath) return new NextResponse("Not found", { status: 404 });
  const abs = path.resolve(process.cwd(), "../../", draft.imagePath);
  if (!fs.existsSync(abs)) return new NextResponse("Not found", { status: 404 });
  const bytes = fs.readFileSync(abs);
  const ext = path.extname(abs).slice(1).toLowerCase();
  const contentType = ext === "avif" ? "image/avif" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
  });
}
