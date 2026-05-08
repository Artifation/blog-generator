import { z } from "zod";

const PillarSchema = z.object({
  id: z.string().min(1),
  weight: z.number().min(0).max(1),
});

export const TenantConfigSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    domain: z.string().min(3),
    language: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/),

    brand: z.object({
      name: z.string().min(1),
      voice: z.string().min(1),
      ban_list: z.array(z.string()).default([]),
      signature_phrases: z.array(z.string()).default([]),
    }),

    author: z.object({
      name: z.string().min(1),
      linkedin: z.string().url(),
      bio: z.string().min(1),
      photo_url: z.string().url(),
    }),

    organization: z.object({
      legal_name: z.string().min(1),
      kvk: z.string().min(1),
      btw: z.string().min(1),
      address: z.string().min(1),
    }),

    wordpress: z.object({
      base_url: z.string().url(),
      user_secret_ref: z.string().min(1),
      app_password_secret_ref: z.string().min(1),
    }),

    email: z.object({
      from: z.string().email(),
      to: z.string().email(),
      reply_to: z.string().email(),
    }),

    pillars: z.array(PillarSchema).min(1),
    quality_threshold: z.number().min(0).max(10),
    max_posts_per_week_published: z.number().int().min(0),
  })
  .refine(
    (c) => Math.abs(c.pillars.reduce((s, p) => s + p.weight, 0) - 1) < 0.001,
    { message: "pillar weights must sum to 1.0" }
  );

export type TenantConfig = z.infer<typeof TenantConfigSchema>;

export function parseTenantConfig(input: unknown): TenantConfig {
  return TenantConfigSchema.parse(input);
}
