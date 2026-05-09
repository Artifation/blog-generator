import { describe, expect, it } from "vitest";
import {
  buildBlogPostingSchema,
  buildPersonSchema,
  buildOrganizationSchema,
  buildBreadcrumbListSchema,
  buildAllSchemaJsonLd,
  type SchemaInput,
} from "@/pipeline/schemaGenerator";
import type { TenantConfig } from "@/config/tenant";

const TENANT: TenantConfig = {
  slug: "artifation",
  domain: "artifation.nl",
  language: "nl-NL",
  brand: {
    name: "Artifation",
    voice: "informeel",
    ban_list: [],
    signature_phrases: [],
    banlist_last_updated: undefined,
  },
  author: {
    name: "Test Auteur",
    linkedin: "https://linkedin.com/in/test",
    bio: "B2B AI-strateeg in NL",
    photo_url: "https://artifation.nl/photo.jpg",
  },
  organization: {
    legal_name: "Artifation BV",
    kvk: "12345678",
    btw: "NL000000000B01",
    address: "Amsterdam",
  },
  wordpress: {
    base_url: "https://artifation.nl",
    user_secret_ref: "WP_USER",
    app_password_secret_ref: "WP_APP_PASSWORD",
  },
  email: { from: "a@x.test", to: "b@x.test", reply_to: "b@x.test" },
  pillars: [{ id: "ai-per-afdeling", weight: 1.0 }],
  quality_threshold: 8.0,
  max_posts_per_week_published: 4,
  features: {
    internal_linker: { enabled: false, max_links_per_run: 10, lookback_posts: 50, exclude_post_ids: [] },
    ai_detection: { enabled: false, provider: "gptzero" as const, threshold_max_ai_pct: 80 },
    indexnow: { enabled: false, key_secret_ref: "INDEXNOW_KEY" },
    ai_crawlers: {},
    anchor_tracker: { enabled: false, max_exact_match_per_url: 3, cache_ttl_hours: 24 },
    cwv_monitoring: { enabled: false, alert_on_poor: true, psi_api_key_secret_ref: "PSI_API_KEY" },
    repurposer: { enabled: false, formats: [] },
    search_console: { enabled: false, property_url: "" },
    topic_suggester: { enabled: false, competitor_domains: [], max_proposals_per_week: 5, expire_after_weeks: 4 },
  },
} as TenantConfig;

const INPUT: SchemaInput = {
  tenant: TENANT,
  topic: { pillar: "ai-per-afdeling", target_keyword: "AI in HR" },
  post: {
    headline: "AI in HR voor MKB",
    description: "AI helpt MKB-HR.",
    slug: "ai-in-hr-mkb",
    url: "https://artifation.nl/ai-in-hr-mkb/",
    datePublished: "2026-05-09T10:00:00Z",
    imageUrl: "https://artifation.nl/wp-content/uploads/img.png",
    imageAlt: "AI in HR header",
  },
  keyEntities: ["MKB", "HR", "AVG"],
};

describe("buildPersonSchema", () => {
  it("uses tenant author + key_entities for knowsAbout", () => {
    const p = buildPersonSchema(TENANT, ["MKB", "AVG"]);
    expect(p["@type"]).toBe("Person");
    expect(p.name).toBe("Test Auteur");
    expect(p.url).toBe("https://linkedin.com/in/test");
    expect(p.knowsAbout).toEqual(["MKB", "AVG"]);
  });

  it("omits knowsAbout when no entities provided", () => {
    const p = buildPersonSchema(TENANT);
    expect(p.knowsAbout).toBeUndefined();
  });

  it("caps knowsAbout to 10 entries", () => {
    const many = Array.from({ length: 20 }, (_, i) => `entity-${i}`);
    const p = buildPersonSchema(TENANT, many);
    expect(p.knowsAbout?.length).toBe(10);
  });
});

describe("buildOrganizationSchema", () => {
  it("returns Organization with brand name + legal name + url", () => {
    const o = buildOrganizationSchema(TENANT);
    expect(o.name).toBe("Artifation");
    expect(o.legalName).toBe("Artifation BV");
    expect(o.url).toBe("https://artifation.nl");
  });
});

describe("buildBlogPostingSchema", () => {
  it("returns BlogPosting with author (Person) + publisher (Organization) nested", () => {
    const a = buildBlogPostingSchema(INPUT);
    expect(a["@type"]).toBe("BlogPosting");
    expect(a.headline).toBe("AI in HR voor MKB");
    expect(a.author["@type"]).toBe("Person");
    expect(a.publisher["@type"]).toBe("Organization");
    expect(a.mainEntityOfPage["@id"]).toBe("https://artifation.nl/ai-in-hr-mkb/");
    expect(a.keywords).toBe("AI in HR");
  });
});

describe("buildBreadcrumbListSchema", () => {
  it("returns 3-item breadcrumb (Home > pillar > post)", () => {
    const b = buildBreadcrumbListSchema(INPUT);
    expect(b.itemListElement).toHaveLength(3);
    expect(b.itemListElement[0]!.name).toBe("Home");
    expect(b.itemListElement[1]!.name).toBe("ai-per-afdeling");
    expect(b.itemListElement[2]!.name).toBe("AI in HR voor MKB");
  });
});

describe("buildAllSchemaJsonLd", () => {
  it("returns concatenated <script> blocks containing all schema types", () => {
    const out = buildAllSchemaJsonLd(INPUT);
    expect(out).toContain('<script type="application/ld+json">');
    expect(out).toContain('"@type":"BlogPosting"');
    expect(out).toContain('"@type":"BreadcrumbList"');
    expect(out).toContain('"@type":"Person"'); // nested in BlogPosting.author
    expect(out).toContain('"@type":"Organization"'); // nested in BlogPosting.publisher
  });

  it("output passes the rubric schema-detection regexes", () => {
    const out = buildAllSchemaJsonLd(INPUT);
    expect(/"@type"\s*:\s*"(?:Article|BlogPosting)"/.test(out)).toBe(true);
    expect(/"@type"\s*:\s*"BreadcrumbList"/.test(out)).toBe(true);
    expect(/"@type"\s*:\s*"Person"/.test(out)).toBe(true);
  });
});
