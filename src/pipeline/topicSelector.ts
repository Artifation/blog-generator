import type { Topic } from "@/config/topics";

export function selectNextTopic(topics: Topic[], now: Date): Topic | undefined {
  const eligible = topics.filter((t) => {
    if (t.status !== "queued" && t.status !== "cap_deferred") return false;
    if (t.retry_after && new Date(t.retry_after) > now) return false;
    return true;
  });
  if (eligible.length === 0) return undefined;
  return eligible.reduce((a, b) => (b.priority > a.priority ? b : a));
}
