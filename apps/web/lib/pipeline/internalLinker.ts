/**
 * Built-in CMS internal-linker.
 *
 * Walks the most recent N published posts and asks Claude to suggest links
 * from them to the latest published post. Mutates published_posts.content_html.
 * Limited to the built-in CMS — WordPress destinations have their own
 * pipeline/internalLinkerJob.
 */

import { eq, and, desc, ne, sql } from "drizzle-orm";
import { getDb, ensureSchema } from "~/lib/db/client";
import { publishedPosts, type Site } from "~/lib/db/schema";
import { createProviderRegistry, resolveAgentModel } from "@/llm/client";
import { runInternalLinker } from "@/agents/internalLinker";

export interface InternalLinkerResult {
  linksAdded: Array<{ from: string; to: string; anchor: string; confidence: number }>;
  skipped: Array<{ from: string; reason: string }>;
  durationMs: number;
}

export async function runBuiltInInternalLinker(
  site: Site,
  opts: { newestPostId?: string } = {}
): Promise<InternalLinkerResult> {
  await ensureSchema();
  const db = getDb();
  const startedAt = Date.now();

  const env = { ...process.env };
  if (site.apiKeys?.anthropic) env.ANTHROPIC_API_KEY = site.apiKeys.anthropic;
  if (site.apiKeys?.gemini) env.GEMINI_API_KEY = site.apiKeys.gemini;
  if (site.apiKeys?.groq) env.GROQ_API_KEY = site.apiKeys.groq;

  const all = await db
    .select()
    .from(publishedPosts)
    .where(and(eq(publishedPosts.siteId, site.id), sql`${publishedPosts.externalUrl} IS NULL`))
    .orderBy(desc(publishedPosts.publishedAt));

  if (all.length < 2) {
    return { linksAdded: [], skipped: [{ from: "site", reason: "minder dan 2 built-in posts" }], durationMs: Date.now() - startedAt };
  }

  // newest = the post we want everyone to link TO
  const newest = opts.newestPostId
    ? all.find((p) => p.id === opts.newestPostId) ?? all[0]!
    : all[0]!;

  const olderCandidates = await db
    .select()
    .from(publishedPosts)
    .where(and(eq(publishedPosts.siteId, site.id), ne(publishedPosts.id, newest.id), sql`${publishedPosts.externalUrl} IS NULL`))
    .orderBy(desc(publishedPosts.publishedAt))
    .limit(5);

  if (olderCandidates.length === 0) {
    return {
      linksAdded: [],
      skipped: [{ from: "site", reason: "geen oudere posts om vanaf te linken" }],
      durationMs: Date.now() - startedAt,
    };
  }

  if (!env.ANTHROPIC_API_KEY) {
    return {
      linksAdded: [],
      skipped: [{ from: "site", reason: "geen Anthropic API-key" }],
      durationMs: Date.now() - startedAt,
    };
  }

  const providers = createProviderRegistry(env);
  const internalLinkerModel = resolveAgentModel("internalLinker", providers);
  const linksAdded: InternalLinkerResult["linksAdded"] = [];
  const skipped: InternalLinkerResult["skipped"] = [];

  const newestUrl = `/blog/${site.slug}/${newest.slug}`;

  for (const older of olderCandidates) {
    // Skip if the older post already links to newest
    if (older.contentHtml.includes(newestUrl)) {
      skipped.push({ from: older.id, reason: "linkt al naar nieuwste post" });
      continue;
    }
    try {
      const res = await runInternalLinker(
        {
          old_post_html: older.contentHtml,
          new_post: {
            title: newest.title,
            tldr_one_liner: newest.tldr,
            focus_keyword: newest.targetKeyword,
            url: newestUrl,
            key_entities: [],
          },
          constraint_anchor_already_used: [],
        },
        { provider: providers.get(internalLinkerModel.provider), model: internalLinkerModel }
      );

      if (!res.parsed.should_link || res.parsed.confidence < 0.6) {
        skipped.push({ from: older.id, reason: `lage confidence (${res.parsed.confidence.toFixed(2)})` });
        continue;
      }

      // Replace the matching paragraph in the older post
      const sig = res.parsed.target_paragraph_signature.trim();
      if (!sig || !older.contentHtml.includes(sig.slice(0, 50))) {
        skipped.push({ from: older.id, reason: "kon paragraaf niet vinden" });
        continue;
      }

      const updated = older.contentHtml.replace(sig, res.parsed.rewritten_paragraph_html);
      if (updated === older.contentHtml) {
        skipped.push({ from: older.id, reason: "geen wijziging na replace" });
        continue;
      }

      await db.update(publishedPosts).set({ contentHtml: updated }).where(eq(publishedPosts.id, older.id));
      linksAdded.push({
        from: older.id,
        to: newest.id,
        anchor: res.parsed.anchor_text,
        confidence: res.parsed.confidence,
      });
    } catch (err) {
      skipped.push({ from: older.id, reason: (err as Error).message });
    }
  }

  return { linksAdded, skipped, durationMs: Date.now() - startedAt };
}
