/**
 * Yoast SEO meta-velden voor WordPress posts.
 *
 * Yoast registreert deze keys via register_post_meta met show_in_rest=true
 * sinds versie 20+; we kunnen ze schrijven via het standaard POST /wp/v2/posts
 * endpoint in de `meta` field — geen aparte plugin/endpoint nodig.
 */

export interface YoastSeoInput {
  title: string;
  description: string;
  focusKeyword: string;
  canonicalUrl?: string;
}

export function buildYoastMeta(input: YoastSeoInput): Record<string, string> {
  const meta: Record<string, string> = {
    _yoast_wpseo_title: input.title,
    _yoast_wpseo_metadesc: input.description,
    _yoast_wpseo_focuskw: input.focusKeyword,
  };
  if (input.canonicalUrl) {
    meta._yoast_wpseo_canonical = input.canonicalUrl;
  }
  return meta;
}
