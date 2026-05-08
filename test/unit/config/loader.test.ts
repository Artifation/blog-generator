import { describe, expect, it } from "vitest";
import { loadTenant } from "@/config/loader";

describe("loadTenant", () => {
  it("loads & validates a tenant config from disk", async () => {
    const t = await loadTenant("example", "test/fixtures/tenants");
    expect(t.slug).toBe("example");
  });

  it("throws for missing tenant", async () => {
    await expect(loadTenant("nope", "test/fixtures/tenants")).rejects.toThrow();
  });
});
