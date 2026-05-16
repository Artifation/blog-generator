"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { requireSite } from "~/lib/auth";
import { getDb, ensureSchema } from "~/lib/db/client";
import { publishedPosts } from "~/lib/db/schema";
import { createProviderRegistry } from "@/llm/client";
import {
  runRepurposerLinkedIn,
  runRepurposerNewsletter,
  runRepurposerXThread,
} from "@/agents/repurposer";

export interface RepurposeResult {
  ok: true;
  linkedin?: { hook_first_200: string; full_text: string; cta: string };
  newsletter?: { subject_line: string; preheader: string; body_html: string; cta_url: string };
  xthread?: { tweets: string[]; blog_link_tweet_index: number };
}

export async function repurposePostAction(
  postId: string,
  formats: Array<"linkedin" | "newsletter" | "xthread">
): Promise<RepurposeResult | { ok: false; error: string }> {
  const site = await requireSite();
  if (!site.apiKeys?.anthropic) {
    return { ok: false, error: "Anthropic API-key ontbreekt." };
  }
  if (formats.length === 0) {
    return { ok: false, error: "Kies minstens één format." };
  }

  await ensureSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(publishedPosts)
    .where(and(eq(publishedPosts.id, postId), eq(publishedPosts.siteId, site.id)))
    .limit(1);
  const post = rows[0];
  if (!post) return { ok: false, error: "Post niet gevonden." };

  const env = { ...process.env, ANTHROPIC_API_KEY: site.apiKeys.anthropic };
  const providers = createProviderRegistry(env);

  const url = post.externalUrl ?? `https://${site.domain}/blog/${site.slug}/${post.slug}`;
  const blog = {
    title: post.title,
    tldr: post.tldr,
    url,
    target_keyword: post.targetKeyword,
    pillar: post.pillarSlug,
  };

  const out: RepurposeResult = { ok: true };

  try {
    const tasks: Array<Promise<void>> = [];
    if (formats.includes("linkedin")) {
      tasks.push(
        runRepurposerLinkedIn(
          { blog, brand_voice: site.brandVoice },
          { provider: providers.get("anthropic") }
        ).then((r) => {
          out.linkedin = r.parsed;
        })
      );
    }
    if (formats.includes("newsletter")) {
      tasks.push(
        runRepurposerNewsletter(
          { blog, brand_voice: site.brandVoice },
          { provider: providers.get("anthropic") }
        ).then((r) => {
          out.newsletter = r.parsed;
        })
      );
    }
    if (formats.includes("xthread")) {
      tasks.push(
        runRepurposerXThread(
          { blog, brand_voice: site.brandVoice },
          { provider: providers.get("anthropic") }
        ).then((r) => {
          out.xthread = r.parsed;
        })
      );
    }
    await Promise.all(tasks);
  } catch (err) {
    return { ok: false, error: `Repurpose mislukte: ${(err as Error).message}` };
  }

  // Merge with any existing repurposed output so re-running keeps formats we don't redo.
  const existing = post.repurposed ?? { generated_at: new Date().toISOString() };
  const merged = {
    ...existing,
    ...(out.linkedin ? { linkedin: out.linkedin } : {}),
    ...(out.newsletter ? { newsletter: out.newsletter } : {}),
    ...(out.xthread ? { xthread: out.xthread } : {}),
    generated_at: new Date().toISOString(),
  };

  await db
    .update(publishedPosts)
    .set({ repurposed: merged })
    .where(eq(publishedPosts.id, post.id));

  revalidatePath(`/published/${post.id}`);
  revalidatePath(`/published`);
  return out;
}
