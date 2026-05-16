import fs from "node:fs";
import path from "node:path";
import { createWordpressClient } from "@/wordpress/client";
import { uploadMedia } from "@/wordpress/media";
import { createDraftPost } from "@/wordpress/posts";
import { buildYoastMeta } from "@/wordpress/yoastSeo";
import type { Draft, Site } from "~/lib/db/schema";

export async function publishToWordpress(
  draft: Draft,
  site: Site,
  cfg: { baseUrl: string; user: string; appPassword: string }
): Promise<{ id: number; url: string }> {
  const wp = createWordpressClient({
    baseUrl: cfg.baseUrl,
    user: cfg.user,
    appPassword: cfg.appPassword,
  });

  let featuredMediaId: number | undefined;
  if (draft.imagePath) {
    const abs = path.resolve(process.cwd(), "../../", draft.imagePath);
    if (fs.existsSync(abs)) {
      const bytes = fs.readFileSync(abs);
      const ext = path.extname(abs).slice(1).toLowerCase();
      const ct = ext === "avif" ? "image/avif" : ext === "webp" ? "image/webp" : "image/jpeg";
      const media = await uploadMedia(wp, {
        bytes,
        contentType: ct,
        filename: `${draft.slug}.${ext}`,
        altText: draft.imageAlt ?? draft.title,
      });
      featuredMediaId = media.id;
    }
  }

  const post = await createDraftPost(wp, {
    title: draft.title,
    content: draft.contentHtml,
    slug: draft.slug,
    excerpt: draft.tldr,
    featuredMediaId: featuredMediaId ?? 0,
    categories: [],
    tags: [],
    meta: buildYoastMeta({
      title: draft.metaTitle,
      description: draft.metaDescription,
      focusKeyword: "",
      canonicalUrl: `${cfg.baseUrl}/${draft.slug}/`,
    }),
  });

  return { id: post.id, url: post.link };
}
