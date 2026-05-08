import { fal } from "@fal-ai/client";

export interface GenerateImageInput {
  prompt: string;
  negative_prompt: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface GeneratedImage {
  url: string;
  bytes: Buffer;
  contentType: string;
}

export async function generateImageWithFal(input: GenerateImageInput): Promise<GeneratedImage> {
  fal.config({ credentials: input.apiKey });

  const result = await fal.subscribe("fal-ai/flux-pro/v1.1-ultra", {
    input: {
      prompt: input.prompt,
      num_images: 1,
      safety_tolerance: "2",
      output_format: "png",
      aspect_ratio: "1:1",
    },
  });

  const url = (result as { data: { images: { url: string }[] } }).data.images[0]?.url;
  if (!url) throw new Error("Fal.ai returned no image URL");

  const f = input.fetchImpl ?? fetch;
  const res = await f(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const arr = await res.arrayBuffer();

  return {
    url,
    bytes: Buffer.from(arr),
    contentType: res.headers.get("content-type") ?? "image/png",
  };
}
