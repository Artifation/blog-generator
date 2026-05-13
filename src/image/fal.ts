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

// Hardcoded brand-style prefix — garandeert visuele consistentie over alle posts,
// onafhankelijk van imagePrompter LLM-output. Flux-Pro v1.1-Ultra heeft geen
// dedicated negative_prompt parameter, dus negatives gaan inline in de prompt.
export const BRAND_STYLE_PREFIX =
  "Editorial corporate photography, professional Dutch B2B business environment, modern office or industrial setting, blue and dark navy color palette with subtle accents, soft natural window light, shallow depth of field, clean minimalist composition, premium stock photography quality, photorealistic";

export const BRAND_NEGATIVE_TERMS =
  "text, words, letters, watermarks, logos, brand names, signatures, cartoon, illustration, painting, sketch, deformed faces, distorted hands, oversaturation, neon colors, cluttered background, amateur snapshot, low resolution, blurry";

export function composeBrandedPrompt(subjectPrompt: string, extraNegatives: string): string {
  const negatives = [BRAND_NEGATIVE_TERMS, extraNegatives].filter(Boolean).join(", ");
  return `${BRAND_STYLE_PREFIX}. ${subjectPrompt}. Avoid: ${negatives}.`;
}

export async function generateImageWithFal(input: GenerateImageInput): Promise<GeneratedImage> {
  fal.config({ credentials: input.apiKey });

  const finalPrompt = composeBrandedPrompt(input.prompt, input.negative_prompt);

  const result = await fal.subscribe("fal-ai/flux-pro/v1.1-ultra", {
    input: {
      prompt: finalPrompt,
      num_images: 1,
      safety_tolerance: "2",
      output_format: "png",
      aspect_ratio: "16:9",
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
