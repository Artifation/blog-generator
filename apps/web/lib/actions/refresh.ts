"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireSite } from "~/lib/auth";
import { listRefreshOpportunitiesForSite } from "~/lib/refreshes";
import { refreshForSite } from "~/lib/pipeline/refreshForSite";
import { getDb, ensureSchema } from "~/lib/db/client";
import { publishedPosts as publishedPostsTable } from "~/lib/db/schema";

export async function startRefreshAction(input: {
  publishedPostId: string;
}): Promise<
  | { ok: true; refreshId: string; draftId: string }
  | { ok: false; error: string }
> {
  const site = await requireSite();
  if (!site.apiKeys?.gemini && !site.apiKeys?.anthropic) {
    return {
      ok: false,
      error: "Geen Gemini- of Anthropic-key — refresh kan niet draaien zonder LLM-provider.",
    };
  }

  await ensureSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(publishedPostsTable)
    .where(eq(publishedPostsTable.id, input.publishedPostId))
    .limit(1);
  const post = rows[0];
  if (!post || post.siteId !== site.id) {
    return { ok: false, error: "Post niet gevonden voor deze site." };
  }

  // Re-derive opportunities so we pick the freshest signal + correct category
  // for this post. The UI passes only the publishedPostId — we don't trust a
  // client-supplied category.
  const { opportunities } = await listRefreshOpportunitiesForSite({ site });
  const opp = opportunities.find((o) => o.publishedPostId === input.publishedPostId);
  if (!opp) {
    return {
      ok: false,
      error: "Geen refresh-opportunity gevonden voor deze post (mogelijk in cooldown).",
    };
  }

  try {
    const result = await refreshForSite({ site, opportunity: opp });
    revalidatePath("/refreshes");
    revalidatePath("/drafts");
    return { ok: true, refreshId: result.refreshId, draftId: result.draftId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
