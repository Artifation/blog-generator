import { describe, expect, it } from "vitest";
import { parseTenantConfig } from "@/config/tenant";

describe("parseTenantConfig", () => {
  const valid = {
    slug: "artifation",
    domain: "artifation.nl",
    language: "nl-NL",
    brand: {
      name: "Artifation",
      voice: "informeel-direct",
      ban_list: ["delve"],
      signature_phrases: [],
    },
    author: {
      name: "Test Auteur",
      linkedin: "https://linkedin.com/in/x",
      bio: "Bio",
      photo_url: "https://x.test/photo.png",
    },
    organization: {
      legal_name: "Artifation B.V.",
      kvk: "12345678",
      btw: "NL000000000B01",
      address: "Adres 1, Plaats",
    },
    wordpress: {
      base_url: "https://artifation.nl",
      user_secret_ref: "WP_USER",
      app_password_secret_ref: "WP_APP_PASSWORD",
    },
    email: {
      from: "blog-bot@artifation.nl",
      to: "algemeen@artifation.nl",
      reply_to: "algemeen@artifation.nl",
    },
    pillars: [
      { id: "ai-per-afdeling", weight: 0.5 },
      { id: "ai-act", weight: 0.3 },
      { id: "sector-extensie", weight: 0.2 },
    ],
    quality_threshold: 8.0,
    max_posts_per_week_published: 4,
  };

  it("parses a valid config", () => {
    expect(parseTenantConfig(valid).slug).toBe("artifation");
  });

  it("rejects pillar-weights die geen 1.0 sommeren", () => {
    const bad = { ...valid, pillars: [{ id: "a", weight: 0.5 }] };
    expect(() => parseTenantConfig(bad)).toThrow(/sum to 1/);
  });

  it("rejects quality_threshold buiten 0-10", () => {
    expect(() => parseTenantConfig({ ...valid, quality_threshold: 11 })).toThrow();
  });
});
