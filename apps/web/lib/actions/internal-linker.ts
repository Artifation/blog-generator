"use server";

import { revalidatePath } from "next/cache";
import { requireSite } from "~/lib/auth";
import { runBuiltInInternalLinker } from "~/lib/pipeline/internalLinker";

export async function runInternalLinkerAction(): Promise<
  | { ok: true; linksAdded: number; skipped: number; durationMs: number }
  | { ok: false; error: string }
> {
  const site = await requireSite();
  // Internal-linker falls back to Gemini in the pipeline if Anthropic isn't
  // configured, so only the Gemini key is strictly required.
  const geminiKey = site.apiKeys?.gemini ?? process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return { ok: false, error: "Gemini API-key vereist. Ga naar Instellingen → Integraties." };
  }
  try {
    const result = await runBuiltInInternalLinker(site);
    revalidatePath("/published");
    revalidatePath(`/blog/${site.slug}`);
    return {
      ok: true,
      linksAdded: result.linksAdded.length,
      skipped: result.skipped.length,
      durationMs: result.durationMs,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
