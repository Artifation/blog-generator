import type { WordpressClient } from "./client.ts";

export interface UploadMediaInput {
  bytes: Buffer;
  contentType: string;
  filename: string;
  altText: string;
}

export interface UploadMediaResult {
  id: number;
  source_url: string;
}

export async function uploadMedia(
  client: WordpressClient,
  input: UploadMediaInput
): Promise<UploadMediaResult> {
  const created = await client.postBinary<UploadMediaResult>(
    "/wp-json/wp/v2/media",
    input.bytes,
    input.contentType,
    input.filename
  );
  await client.postJson(`/wp-json/wp/v2/media/${created.id}`, { alt_text: input.altText });
  return created;
}
