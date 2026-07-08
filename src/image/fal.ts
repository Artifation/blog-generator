import { fal } from "@fal-ai/client";
import { IMAGE_TIMEOUT_MS, withTimeout } from "../llm/timeout.ts";

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
  "A real, candid documentary photograph taken by a professional photographer on a full-frame DSLR with a 35mm lens. " +
  "An ordinary, calm Dutch small-business workplace on a normal working day. Soft natural daylight from a window, muted true-to-life colours, " +
  "real materials and textures, unposed and understated composition, shallow depth of field. It looks like a genuine everyday photo, not an advertisement. " +
  "Any computer, tablet or phone screens are switched off or show only plain simple text — never charts, dashboards, data visualisations, maps, glowing graphics, " +
  "holograms, neon light, blue digital glow or digital overlays. Nothing futuristic, nothing sci-fi, no digital effects";

export const BRAND_NEGATIVE_TERMS =
  "text, words, letters, watermarks, logos, brand names, signatures, cartoon, illustration, painting, sketch, vector art, 3d render, cgi, " +
  "futuristic, sci-fi, science fiction, cyberpunk, high-tech, digital overlay, holographic display, hologram, HUD, augmented reality overlay, " +
  "floating data, glowing screens, glowing lines, neon glow, neon colors, dramatic lighting, lens flare, oversaturation, " +
  "glowing molecular network, abstract connected nodes, dot-and-line network, glowing brain with circuits, " +
  "puzzle pieces with AI text, robotic handshake, generic AI cliché imagery, " +
  "deformed faces, distorted hands, cluttered background, amateur snapshot, low resolution, blurry";

export function composeBrandedPrompt(subjectPrompt: string, extraNegatives: string): string {
  const negatives = [BRAND_NEGATIVE_TERMS, extraNegatives].filter(Boolean).join(", ");
  return `${BRAND_STYLE_PREFIX}. ${subjectPrompt}. Avoid: ${negatives}.`;
}

export async function generateImageWithFal(input: GenerateImageInput): Promise<GeneratedImage> {
  fal.config({ credentials: input.apiKey });

  const finalPrompt = composeBrandedPrompt(input.prompt, input.negative_prompt);

  // fal.subscribe is a long-poll with no built-in deadline — bound it.
  const result = await withTimeout(
    fal.subscribe("fal-ai/flux-pro/v1.1-ultra", {
      input: {
        prompt: finalPrompt,
        num_images: 1,
        safety_tolerance: "2",
        output_format: "png",
        aspect_ratio: "16:9",
      },
    }),
    IMAGE_TIMEOUT_MS,
    "fal.subscribe(flux-pro)",
  );

  const url = (result as { data: { images: { url: string }[] } }).data.images[0]?.url;
  if (!url) throw new Error("Fal.ai returned no image URL");

  const f = input.fetchImpl ?? fetch;
  const res = await f(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const arr = await res.arrayBuffer();

  return {
    url,
    bytes: Buffer.from(arr),
    contentType: res.headers.get("content-type") ?? "image/png",
  };
}
