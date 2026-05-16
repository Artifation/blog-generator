import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const sites = sqliteTable(
  "sites",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    language: text("language").notNull().default("en-US"),

    // brand
    brandVoice: text("brand_voice").notNull().default(""),
    banList: text("ban_list", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    signaturePhrases: text("signature_phrases", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    readingLevelMin: integer("reading_level_min").notNull().default(50),
    readingLevelMax: integer("reading_level_max").notNull().default(70),

    // quality + cadence
    qualityThreshold: real("quality_threshold").notNull().default(8.0),
    maxPostsPerWeek: integer("max_posts_per_week").notNull().default(2),
    scheduleCron: text("schedule_cron").notNull().default("0 6 * * 1,3,5"),
    autoPublish: integer("auto_publish", { mode: "boolean" }).notNull().default(false),

    // publishing
    publishDestination: text("publish_destination", {
      enum: ["built_in", "wordpress", "markdown"],
    })
      .notNull()
      .default("built_in"),
    wordpressConfig: text("wordpress_config", { mode: "json" }).$type<{
      baseUrl: string;
      user: string;
      appPassword: string;
    } | null>(),

    // notifications
    emailConfig: text("email_config", { mode: "json" }).$type<{
      enabled: boolean;
      from?: string;
      to?: string;
      replyTo?: string;
    }>().notNull().default(sql`'{"enabled":false}'`),

    // identity
    author: text("author", { mode: "json" }).$type<{
      name: string;
      bio?: string;
      linkedin?: string;
      photoUrl?: string;
    }>().notNull().default(sql`'{"name":""}'`),
    organization: text("organization", { mode: "json" }).$type<{
      legalName?: string;
      kvk?: string;
      btw?: string;
      address?: string;
    }>().notNull().default(sql`'{}'`),

    // API keys (stored as a json blob — encrypt-at-rest is a future improvement)
    apiKeys: text("api_keys", { mode: "json" }).$type<{
      anthropic?: string;
      gemini?: string;
      groq?: string;
      fal?: string;
      resend?: string;
      cloudflareAccount?: string;
      cloudflareToken?: string;
    }>().notNull().default(sql`'{}'`),

    // generic features blob (mirrors existing src/config/tenant.ts FeaturesSchema)
    features: text("features", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),

    createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    slugIdx: uniqueIndex("sites_slug_idx").on(t.slug),
  })
);

export const pillars = sqliteTable(
  "pillars",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    weight: real("weight").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    sitePillarIdx: uniqueIndex("pillars_site_slug_idx").on(t.siteId, t.slug),
  })
);

export const topics = sqliteTable(
  "topics",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    targetKeyword: text("target_keyword").notNull(),
    pillarSlug: text("pillar_slug").notNull(),
    intent: text("intent", {
      enum: ["informational", "commercial", "transactional"],
    }).notNull().default("informational"),
    intendedWordCount: integer("intended_word_count").notNull().default(1500),
    priority: integer("priority").notNull().default(0),
    status: text("status", {
      enum: [
        "queued",
        "in_progress",
        "published",
        "rejected",
        "cap_deferred",
        "cannibalization_skipped",
        "proposed",
        "proposed_expired",
      ],
    }).notNull().default("queued"),
    retryAfter: text("retry_after"),
    rejectReason: text("reject_reason"),
    publishedDraftId: text("published_draft_id"),
    publishedUrl: text("published_url"),
    keyEntities: text("key_entities", { mode: "json" }).$type<string[]>().default(sql`'[]'`),
    proposedAt: text("proposed_at"),
    proposalSource: text("proposal_source", {
      enum: [
        "competitor_sitemap",
        "gsc_rising_query",
        "gsc_striking_distance",
        "gsc_unmapped_query",
        "manual",
      ],
    }),
    proposalRationale: text("proposal_rationale"),
    createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    siteStatusIdx: index("topics_site_status_idx").on(t.siteId, t.status),
  })
);

export const drafts = sqliteTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => topics.id, { onDelete: "set null" }),
    runId: text("run_id"),
    status: text("status", {
      enum: ["pending_review", "approved", "rejected", "published"],
    }).notNull().default("pending_review"),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    contentHtml: text("content_html").notNull(),
    metaTitle: text("meta_title").notNull().default(""),
    metaDescription: text("meta_description").notNull().default(""),
    tldr: text("tldr").notNull().default(""),
    imagePath: text("image_path"),
    imageAlt: text("image_alt"),
    rubricScores: text("rubric_scores", { mode: "json" }).$type<Record<string, number>>(),
    weightedTotal: real("weighted_total"),
    hardFails: text("hard_fails", { mode: "json" }).$type<string[]>().default(sql`'[]'`),
    costUsd: real("cost_usd"),
    createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    reviewedAt: text("reviewed_at"),
  },
  (t) => ({
    siteStatusIdx: index("drafts_site_status_idx").on(t.siteId, t.status),
  })
);

export const publishedPosts = sqliteTable(
  "published_posts",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    draftId: text("draft_id").references(() => drafts.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    contentHtml: text("content_html").notNull(),
    metaTitle: text("meta_title").notNull().default(""),
    metaDescription: text("meta_description").notNull().default(""),
    tldr: text("tldr").notNull().default(""),
    imagePath: text("image_path"),
    imageAlt: text("image_alt"),
    targetKeyword: text("target_keyword").notNull().default(""),
    pillarSlug: text("pillar_slug").notNull().default(""),
    publishedAt: text("published_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    externalUrl: text("external_url"),
    externalId: text("external_id"),
    repurposed: text("repurposed", { mode: "json" }).$type<{
      linkedin?: { hook_first_200: string; full_text: string; cta: string };
      newsletter?: { subject_line: string; preheader: string; body_html: string; cta_url: string };
      xthread?: { tweets: string[]; blog_link_tweet_index: number };
      generated_at: string;
    } | null>(),
  },
  (t) => ({
    siteSlugIdx: uniqueIndex("published_site_slug_idx").on(t.siteId, t.slug),
  })
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default(""),
    role: text("role", { enum: ["owner", "editor", "viewer"] }).notNull().default("editor"),
    invitedBy: text("invited_by"),
    invitedAt: text("invited_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    lastLoginAt: text("last_login_at"),
  },
  (t) => ({
    emailSiteIdx: uniqueIndex("users_email_site_idx").on(t.siteId, t.email),
  })
);
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    topicId: text("topic_id"),
    startedAt: text("started_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    finishedAt: text("finished_at"),
    verdict: text("verdict", {
      enum: ["running", "published", "rejected", "cap_deferred", "cannibalization_skipped", "error"],
    }).notNull().default("running"),
    weightedTotal: real("weighted_total"),
    hardFails: text("hard_fails", { mode: "json" }).$type<string[]>().default(sql`'[]'`),
    reason: text("reason"),
    costUsd: real("cost_usd"),
    stages: text("stages", { mode: "json" }).$type<Array<{ stage: string; ms: number; ok: boolean }>>().default(sql`'[]'`),
    errorMessage: text("error_message"),
  },
  (t) => ({
    siteStartedIdx: index("runs_site_started_idx").on(t.siteId, t.startedAt),
  })
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Pillar = typeof pillars.$inferSelect;
export type NewPillar = typeof pillars.$inferInsert;
export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
export type Draft = typeof drafts.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;
export type PublishedPost = typeof publishedPosts.$inferSelect;
export type NewPublishedPost = typeof publishedPosts.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
