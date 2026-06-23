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
  // The image is already uploaded; alt_text is a follow-up PATCH. Don't let its
  // failure abort the whole publish — log and continue.
  try {
    await client.postJson(`/wp-json/wp/v2/media/${created.id}`, { alt_text: input.altText });
  } catch (err) {
    console.warn(
      JSON.stringify({ stage: "uploadMedia", warning: `alt_text PATCH failed: ${(err as Error).message}` }),
    );
  }
  return created;
}
