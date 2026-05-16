"use server";

import { revalidatePath } from "next/cache";
import { requireSite } from "~/lib/auth";
import { runBuiltInInternalLinker } from "~/lib/pipeline/internalLinker";

export async function runInternalLinkerAction(): Promise<
  | { ok: true; linksAdded: number; skipped: number; durationMs: number }
  | { ok: false; error: string }
> {
  const site = await requireSite();
  if (!site.apiKeys?.anthropic) {
    return { ok: false, error: "Anthropic API-key ontbreekt — vul die in onder Instellingen." };
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
