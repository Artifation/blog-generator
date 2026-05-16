import type { Draft, Site } from "~/lib/db/schema";
import { publishDraftBuiltIn } from "~/lib/drafts";
import { publishToWordpress } from "./wordpress";
import { exportDraftAsMarkdown } from "./markdown";

export interface PublishResult {
  destination: "built_in" | "wordpress" | "markdown";
  url: string | null;
  externalId?: string | null;
  message?: string;
}

export async function publishDraft(draft: Draft, site: Site): Promise<PublishResult> {
  switch (site.publishDestination) {
    case "built_in": {
      const post = await publishDraftBuiltIn({ draftId: draft.id });
      return {
        destination: "built_in",
        url: `/${site.slug}/${post.slug}`,
        message: "Published to built-in CMS",
      };
    }
    case "wordpress": {
      if (!site.wordpressConfig) {
        throw new Error(
          "WordPress destination selected, but no WordPress config saved for this site."
        );
      }
      const wpResult = await publishToWordpress(draft, site, site.wordpressConfig);
      await publishDraftBuiltIn({
        draftId: draft.id,
        externalUrl: wpResult.url,
        externalId: String(wpResult.id),
      });
      return {
        destination: "wordpress",
        url: wpResult.url,
        externalId: String(wpResult.id),
        message: `Published as WordPress draft (post #${wpResult.id})`,
      };
    }
    case "markdown": {
      const path = await exportDraftAsMarkdown(draft, site);
      await publishDraftBuiltIn({ draftId: draft.id, externalUrl: path });
      return {
        destination: "markdown",
        url: path,
        message: `Exported markdown to ${path}`,
      };
    }
    default:
      throw new Error(`Unknown destination ${(site as Site).publishDestination}`);
  }
}
