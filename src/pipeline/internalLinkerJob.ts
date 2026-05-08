import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseHtml } from "node-html-parser";
import { loadTenant } from "@/config/loader";
import { loadTopics } from "@/config/topics";
import { createProviderRegistry } from "@/llm/client";
import { runInternalLinker } from "@/agents/internalLinker";
import { createWordpressClient } from "@/wordpress/client";
import { listRecentPosts, updatePostContent, type WpPost } from "@/wordpress/posts";

export interface InternalLinkerJobOpts {
  tenantSlug: string;
  baseDir?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

interface RunLog {
  run_at: string;
  tenant: string;
  new_post_count: number;
  old_post_count: number;
  agent_calls: number;
  links_added: {
    from_post_id: number;
    to_post_id: number;
    anchor: string;
    confidence: number;
  }[];
  skipped: { from_post_id: number; to_post_id: number; reason: string }[];
}

const NEW_POST_WINDOW_DAYS = 14;

export async function runInternalLinkerJob(opts: InternalLinkerJobOpts): Promise<void> {
  const env = opts.env ?? process.env;
  const baseDir = opts.baseDir ?? "tenants";
  const now = opts.now ?? new Date();

  const tenant = await loadTenant(opts.tenantSlug, baseDir);
  const cfg = tenant.features.internal_linker;
  if (!cfg.enabled) {
    console.log(JSON.stringify({ stage: "skip", reason: "feature disabled" }));
    return;
  }

  const wp = createWordpressClient({
    baseUrl: tenant.wordpress.base_url,
    user: requireEnv(env, tenant.wordpress.user_secret_ref),
    appPassword: requireEnv(env, tenant.wordpress.app_password_secret_ref),
  });

  const allPosts = await listRecentPosts(wp, cfg.lookback_posts);
  const cutoff = new Date(now.getTime() - NEW_POST_WINDOW_DAYS * 86400000);

  const newPosts = allPosts.filter((p) => new Date(p.date) >= cutoff);
  const oldPosts = allPosts.filter(
    (p) => new Date(p.date) < cutoff && !cfg.exclude_post_ids.includes(p.id)
  );

  const topics = await loadTopics(opts.tenantSlug, baseDir);

  const log: RunLog = {
    run_at: now.toISOString(),
    tenant: opts.tenantSlug,
    new_post_count: newPosts.length,
    old_post_count: oldPosts.length,
    agent_calls: 0,
    links_added: [],
    skipped: [],
  };

  if (newPosts.length === 0) {
    await persistLog(baseDir, opts.tenantSlug, now, log);
    console.log(JSON.stringify({ stage: "skip", reason: "no new posts" }));
    return;
  }

  const providers = createProviderRegistry(env);
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  let linksAddedCount = 0;

  for (const oldPost of oldPosts) {
    if (linksAddedCount >= cfg.max_links_per_run) break;

    for (const newPost of newPosts) {
      if (oldPost.id === newPost.id) continue;
      if (linksAddedCount >= cfg.max_links_per_run) break;

      const newPostTopic = topics.find((t) => t.wp_post_id === newPost.id);
      if (!newPostTopic) {
        log.skipped.push({
          from_post_id: oldPost.id,
          to_post_id: newPost.id,
          reason: "no topic metadata",
        });
        continue;
      }

      // Idempotency: skip if already linked.
      if (oldPost.content.rendered.includes(`href="${newPost.link}"`)) {
        log.skipped.push({
          from_post_id: oldPost.id,
          to_post_id: newPost.id,
          reason: "already linked",
        });
        continue;
      }

      // Pre-filter: keyword overlap.
      const oldText = parseHtml(oldPost.content.rendered).text.toLowerCase();
      const overlap = oldText.includes(newPostTopic.target_keyword.toLowerCase());
      if (!overlap) {
        log.skipped.push({
          from_post_id: oldPost.id,
          to_post_id: newPost.id,
          reason: "no keyword overlap",
        });
        continue;
      }

      log.agent_calls++;
      const r = await runInternalLinker(
        {
          old_post_html: oldPost.content.rendered,
          new_post: {
            title: newPost.title.rendered,
            tldr_one_liner: newPostTopic.title,
            focus_keyword: newPostTopic.target_keyword,
            url: newPost.link,
            key_entities: [],
          },
          constraint_anchor_already_used: [],
        },
        { provider: providers.get("anthropic"), sleepImpl: sleep }
      );

      if (!r.parsed.should_link || r.parsed.confidence < 0.7) {
        log.skipped.push({
          from_post_id: oldPost.id,
          to_post_id: newPost.id,
          reason: `agent declined (conf=${r.parsed.confidence})`,
        });
        continue;
      }

      const newHtml = replaceParagraphBySignature(
        oldPost.content.rendered,
        r.parsed.target_paragraph_signature,
        r.parsed.rewritten_paragraph_html
      );
      if (newHtml === null) {
        log.skipped.push({
          from_post_id: oldPost.id,
          to_post_id: newPost.id,
          reason: "signature mismatch",
        });
        continue;
      }

      await updatePostContent(wp, oldPost.id, newHtml);
      log.links_added.push({
        from_post_id: oldPost.id,
        to_post_id: newPost.id,
        anchor: r.parsed.anchor_text,
        confidence: r.parsed.confidence,
      });
      linksAddedCount++;

      // Update local copy so iteration sees the new link.
      oldPost.content.rendered = newHtml;
      break; // 1 link per oude post
    }
  }

  await persistLog(baseDir, opts.tenantSlug, now, log);
  console.log(
    JSON.stringify({
      stage: "complete",
      linksAdded: log.links_added.length,
      skipped: log.skipped.length,
    })
  );
}

function replaceParagraphBySignature(
  html: string,
  signature: string,
  replacement: string
): string | null {
  const root = parseHtml(html);
  const sigLower = signature.toLowerCase().trim();
  const paragraphs = root.querySelectorAll("p");
  for (const p of paragraphs) {
    const plainText = p.text.toLowerCase().trim();
    if (plainText.startsWith(sigLower.slice(0, Math.min(40, sigLower.length)))) {
      p.replaceWith(replacement);
      return root.toString();
    }
  }
  return null;
}

async function persistLog(baseDir: string, slug: string, now: Date, log: RunLog): Promise<void> {
  const dir = path.join(baseDir, "..", "data", "internal-linker-runs", slug);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${now.toISOString().slice(0, 10)}.json`);
  await writeFile(file, JSON.stringify(log, null, 2), "utf-8");
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tenantArg = process.argv.slice(2).find((a) => a.startsWith("--tenant="));
  if (!tenantArg) throw new Error("Usage: internalLinkerJob.ts --tenant=<slug>");
  const slug = tenantArg.split("=")[1]!;
  runInternalLinkerJob({ tenantSlug: slug }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
