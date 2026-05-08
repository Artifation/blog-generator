import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";

export const TopicStatus = z.enum([
  "queued",
  "in_progress",
  "published",
  "rejected",
  "cap_deferred",
  "cannibalization_skipped",
]);
export type TopicStatusT = z.infer<typeof TopicStatus>;

export const TopicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  pillar: z.string().min(1),
  target_keyword: z.string().min(1),
  intended_word_count: z.number().int().min(500),
  status: TopicStatus,
  priority: z.number().int(),
  last_attempted: z.string().datetime().optional(),
  retry_after: z.string().datetime().optional(),
  reject_reason: z.string().optional(),
});
export type Topic = z.infer<typeof TopicSchema>;

export const TopicsListSchema = z.array(TopicSchema);

export function parseTopics(input: unknown): Topic[] {
  return TopicsListSchema.parse(input);
}

export async function loadTopics(
  tenantSlug: string,
  baseDir: string = "tenants"
): Promise<Topic[]> {
  const file = path.join(baseDir, tenantSlug, "topics.yaml");
  const raw = await readFile(file, "utf-8");
  return parseTopics(yaml.load(raw));
}

export async function saveTopics(
  topics: Topic[],
  tenantSlug: string,
  baseDir: string = "tenants"
): Promise<void> {
  const file = path.join(baseDir, tenantSlug, "topics.yaml");
  await writeFile(file, yaml.dump(topics, { lineWidth: 120 }), "utf-8");
}
