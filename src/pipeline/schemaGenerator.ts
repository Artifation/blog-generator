import type { TenantConfig } from "@/config/tenant";

export interface SchemaInput {
  tenant: TenantConfig;
  topic: {
    pillar: string;
    target_keyword: string;
  };
  post: {
    headline: string;
    description: string;
    slug: string;
    url: string; // canonical post URL: ${baseUrl}/${slug}/
    datePublished: string; // ISO 8601
    imageUrl: string;
    imageAlt: string;
  };
  keyEntities?: string[]; // optional: Person.knowsAbout enrichment
}

interface JsonLdBase {
  "@context": "https://schema.org";
  "@type": string;
}

export interface PersonSchema extends JsonLdBase {
  "@type": "Person";
  name: string;
  jobTitle?: string;
  url?: string; // bio page or LinkedIn
  sameAs?: string[]; // additional profile URLs
  description?: string;
  knowsAbout?: string[];
}

export interface OrganizationSchema extends JsonLdBase {
  "@type": "Organization";
  name: string;
  legalName?: string;
  url: string;
  logo?: string;
}

export interface BlogPostingSchema extends JsonLdBase {
  "@type": "BlogPosting";
  headline: string;
  description: string;
  image: string;
  datePublished: string;
  dateModified?: string;
  author: PersonSchema;
  publisher: OrganizationSchema;
  mainEntityOfPage: { "@type": "WebPage"; "@id": string };
  keywords?: string;
}

export interface BreadcrumbItem {
  "@type": "ListItem";
  position: number;
  name: string;
  item: string;
}

export interface BreadcrumbListSchema extends JsonLdBase {
  "@type": "BreadcrumbList";
  itemListElement: BreadcrumbItem[];
}

export function buildPersonSchema(tenant: TenantConfig, keyEntities?: string[]): PersonSchema {
  const author = tenant.author;
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    description: author.bio,
    url: author.linkedin,
    sameAs: [author.linkedin],
    knowsAbout: keyEntities && keyEntities.length > 0 ? keyEntities.slice(0, 10) : undefined,
  };
}

export function buildOrganizationSchema(tenant: TenantConfig): OrganizationSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: tenant.brand.name,
    legalName: tenant.organization.legal_name,
    url: tenant.wordpress.base_url,
  };
}

export function buildBlogPostingSchema(input: SchemaInput): BlogPostingSchema {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.post.headline,
    description: input.post.description,
    image: input.post.imageUrl,
    datePublished: input.post.datePublished,
    author: buildPersonSchema(input.tenant, input.keyEntities),
    publisher: buildOrganizationSchema(input.tenant),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": input.post.url,
    },
    keywords: input.topic.target_keyword,
  };
}

export function buildBreadcrumbListSchema(input: SchemaInput): BreadcrumbListSchema {
  const baseUrl = input.tenant.wordpress.base_url;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${baseUrl}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: input.topic.pillar,
        item: `${baseUrl}/categorie/${input.topic.pillar}/`,
      },
      { "@type": "ListItem", position: 3, name: input.post.headline, item: input.post.url },
    ],
  };
}

export function buildAllSchemaJsonLd(input: SchemaInput): string {
  const blocks = [buildBlogPostingSchema(input), buildBreadcrumbListSchema(input)];
  return blocks
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join("\n");
}
