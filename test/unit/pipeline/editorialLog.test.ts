import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendEditorialLogEntry, type EditorialLogEntry } from "@/pipeline/editorialLog";

const SAMPLE_ENTRY: EditorialLogEntry = {
  post_id: 42,
  post_url: "https://artifation.nl/ai-in-hr-mkb/",
  post_title: "AI in HR voor MKB",
  reviewer: "Test Auteur",
  approved_at: "2026-05-09T10:00:00.000Z",
  ai_models_used: ["claude-sonnet-4-6", "gemini-2.5-pro", "groq llama-3.3-70b"],
  pipeline_version: "abc1234",
  rubric_total: 8.7,
  topic_id: "ai-in-hr",
};

async function makeTmpBase(): Promise<string> {
  // We use baseDir as "tenants" equivalent; log lands in <projectRoot>/data/...
  // Here we make a tmp dir that acts as "tenants", so projectRoot = its parent.
  const root = await mkdtemp(path.join(tmpdir(), "editorial-test-"));
  // Create a "tenants" subdir inside the tmp root so baseDir = root/tenants
  return root;
}

describe("appendEditorialLogEntry", () => {
  it("creates log file and appends first entry", async () => {
    const root = await makeTmpBase();
    const baseDir = path.join(root, "tenants");

    await appendEditorialLogEntry(SAMPLE_ENTRY, {
      tenant_slug: "artifation",
      baseDir,
      now: new Date("2026-05-09T10:00:00Z"),
    });

    const logPath = path.join(root, "data", "editorial-reviews", "artifation", "2026.json");
    const raw = await readFile(logPath, "utf-8");
    const entries = JSON.parse(raw) as EditorialLogEntry[];

    expect(entries).toHaveLength(1);
    expect(entries[0]!.post_id).toBe(42);
    expect(entries[0]!.reviewer).toBe("Test Auteur");
    expect(entries[0]!.topic_id).toBe("ai-in-hr");
  });

  it("appends to existing entries without overwriting", async () => {
    const root = await makeTmpBase();
    const baseDir = path.join(root, "tenants");
    const now = new Date("2026-05-09T10:00:00Z");

    await appendEditorialLogEntry(SAMPLE_ENTRY, { tenant_slug: "artifation", baseDir, now });
    await appendEditorialLogEntry(
      { ...SAMPLE_ENTRY, post_id: 43, topic_id: "ai-tools" },
      { tenant_slug: "artifation", baseDir, now }
    );

    const logPath = path.join(root, "data", "editorial-reviews", "artifation", "2026.json");
    const entries = JSON.parse(await readFile(logPath, "utf-8")) as EditorialLogEntry[];

    expect(entries).toHaveLength(2);
    expect(entries[0]!.post_id).toBe(42);
    expect(entries[1]!.post_id).toBe(43);
  });

  it("creates separate files for different calendar years (year rollover)", async () => {
    const root = await makeTmpBase();
    const baseDir = path.join(root, "tenants");

    await appendEditorialLogEntry(SAMPLE_ENTRY, {
      tenant_slug: "artifation",
      baseDir,
      now: new Date("2026-12-31T23:59:00Z"),
    });
    await appendEditorialLogEntry(
      { ...SAMPLE_ENTRY, post_id: 99, approved_at: "2027-01-01T00:05:00.000Z" },
      {
        tenant_slug: "artifation",
        baseDir,
        now: new Date("2027-01-01T00:05:00Z"),
      }
    );

    const log2026 = path.join(root, "data", "editorial-reviews", "artifation", "2026.json");
    const log2027 = path.join(root, "data", "editorial-reviews", "artifation", "2027.json");

    const entries2026 = JSON.parse(await readFile(log2026, "utf-8")) as EditorialLogEntry[];
    const entries2027 = JSON.parse(await readFile(log2027, "utf-8")) as EditorialLogEntry[];

    expect(entries2026).toHaveLength(1);
    expect(entries2026[0]!.post_id).toBe(42);
    expect(entries2027).toHaveLength(1);
    expect(entries2027[0]!.post_id).toBe(99);
  });

  it("stores all required fields in the log entry", async () => {
    const root = await makeTmpBase();
    const baseDir = path.join(root, "tenants");

    await appendEditorialLogEntry(SAMPLE_ENTRY, {
      tenant_slug: "artifation",
      baseDir,
      now: new Date("2026-05-09T10:00:00Z"),
    });

    const logPath = path.join(root, "data", "editorial-reviews", "artifation", "2026.json");
    const [entry] = JSON.parse(await readFile(logPath, "utf-8")) as EditorialLogEntry[];

    expect(entry!.ai_models_used).toEqual([
      "claude-sonnet-4-6",
      "gemini-2.5-pro",
      "groq llama-3.3-70b",
    ]);
    expect(entry!.pipeline_version).toBe("abc1234");
    expect(entry!.rubric_total).toBe(8.7);
    expect(entry!.post_url).toBe("https://artifation.nl/ai-in-hr-mkb/");
  });
});
