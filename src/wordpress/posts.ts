import type { WordpressClient } from "./client.ts";

export interface CreatePostInput {
  title: string;
  content: string;
  slug: string;
  excerpt: string;
  featuredMediaId: number;
  categories: number[];
  tags: number[];
  meta?: Record<string, string>;  // arbitrary post meta — Yoast SEO velden e.d.
}

export interface CreatePostResult {
  id: number;
  link: string;
}

export async function createDraftPost(
  client: WordpressClient,
  input: CreatePostInput
): Promise<CreatePostResult> {
  const body: Record<string, unknown> = {
    status: "draft",
    title: input.title,
    content: input.content,
    excerpt: input.excerpt,
    slug: input.slug,
    featured_media: input.featuredMediaId,
    categories: input.categories,
    tags: input.tags,
  };
  if (input.meta && Object.keys(input.meta).length > 0) {
    body.meta = input.meta;
  }
  return client.postJson<CreatePostResult>("/wp-json/wp/v2/posts", body);
}

export function buildEditUrl(baseUrl: string, postId: number): string {
  return `${baseUrl}/wp-admin/post.php?post=${postId}&action=edit`;
}

export interface WpPost {
  id: number;
  link: string;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  date: string;
}

export async function getPost(client: WordpressClient, id: number): Promise<WpPost> {
  return client.get<WpPost>(`/wp-json/wp/v2/posts/${id}`);
}

export async function updatePostContent(
  client: WordpressClient,
  id: number,
  newContent: string
): Promise<{ id: number; link: string }> {
  return client.patchJson<{ id: number; link: string }>(
    `/wp-json/wp/v2/posts/${id}`,
    { content: newContent }
  );
}

export async function listRecentPosts(
  client: WordpressClient,
  limit: number = 50
): Promise<WpPost[]> {
  return client.get<WpPost[]>(
    `/wp-json/wp/v2/posts?per_page=${limit}&status=publish&orderby=date&order=desc&_fields=id,link,slug,title,content,date`
  );
}
