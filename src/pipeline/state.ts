import type { Topic, TopicStatusT } from "@/config/topics";

export function countPublishedThisIsoWeek(topics: Topic[], now: Date): number {
  const week = isoWeek(now);
  return topics.filter((t) => {
    if (t.status !== "published") return false;
    if (!t.last_attempted) return false;
    return isoWeek(new Date(t.last_attempted)) === week;
  }).length;
}

export function markTopicStatus(
  topics: Topic[],
  topicId: string,
  status: TopicStatusT,
  now: Date,
  patch: Partial<Topic> = {}
): Topic[] {
  return topics.map((t) =>
    t.id === topicId ? { ...t, ...patch, status, last_attempted: now.toISOString() } : t
  );
}

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
