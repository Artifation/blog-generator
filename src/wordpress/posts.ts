import type { WordpressClient } from "./client.ts";

export interface CreatePostInput {
  title: string;
  content: string;
  slug: string;
  excerpt: string;
  featuredMediaId: number;
  categories: number[];
  tags: number[];
}

export interface CreatePostResult {
  id: number;
  link: string;
}

export async function createDraftPost(
  client: WordpressClient,
  input: CreatePostInput
): Promise<CreatePostResult> {
  return client.postJson<CreatePostResult>("/wp-json/wp/v2/posts", {
    status: "draft",
    title: input.title,
    content: input.content,
    excerpt: input.excerpt,
    slug: input.slug,
    featured_media: input.featuredMediaId,
    categories: input.categories,
    tags: input.tags,
  });
}

export function buildEditUrl(baseUrl: string, postId: number): string {
  return `${baseUrl}/wp-admin/post.php?post=${postId}&action=edit`;
}
