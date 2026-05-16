import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getDraft, updateDraftContent } from "~/lib/drafts";
import { getSiteById } from "~/lib/sites";
import { getCurrentSite } from "~/lib/auth";
import { getDb } from "~/lib/db/client";
import { drafts } from "~/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function POST(req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const session = await getCurrentSite();
  if (!session) return NextResponse.json({ ok: false, error: "Niet ingelogd" }, { status: 401 });

  const draft = await getDraft(draftId);
  if (!draft) return NextResponse.json({ ok: false, error: "Draft niet gevonden" }, { status: 404 });
  if (draft.siteId !== session.id) {
    return NextResponse.json({ ok: false, error: "Geen toegang" }, { status: 403 });
  }
  const site = await getSiteById(draft.siteId);
  if (!site) return NextResponse.json({ ok: false, error: "Site weg" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Geen bestand meegestuurd" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `Bestand te groot (${(file.size / 1024 / 1024).toFixed(1)} MB > 8 MB)` },
      { status: 400 }
    );
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: `Niet-ondersteund type: ${file.type}` },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const dir = path.resolve(process.cwd(), "../../data/images", site.slug, "uploads");
  await fs.mkdir(dir, { recursive: true });
  const filename = `${draftId}.${ext}`;
  const abs = path.join(dir, filename);
  await fs.writeFile(abs, bytes);
  const relPath = `data/images/${site.slug}/uploads/${filename}`;

  // Update the draft's imagePath via direct query (the updateDraftContent helper doesn't cover imagePath)
  const db = getDb();
  await db.update(drafts).set({ imagePath: relPath }).where(eq(drafts.id, draftId));

  return NextResponse.json({ ok: true, imagePath: relPath, contentType: file.type, bytes: bytes.length });
}
