import { GoogleGenAI } from "@google/genai";
import { composeBrandedPrompt } from "./fal.ts";
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

/**
 * Generate a 16:9 brand-styled image via Google Imagen 3.
 *
 * Imagen 3 has no separate negative_prompt field, so we inline the negatives
 * into the prompt the same way fal.ts does via composeBrandedPrompt(). The
 * model returns base64-encoded image bytes which we decode to a Buffer.
 *
 * Returned `url` is a data: URL so downstream code that uses it (e.g. for
 * logging or HTML preview) keeps working without needing a hosted CDN — the
 * pipeline persists the actual `bytes` to disk.
 */
export async function generateImageWithGemini(
  input: GenerateImageInput,
): Promise<GeneratedImage> {
  const client = new GoogleGenAI({ apiKey: input.apiKey });
  const finalPrompt = composeBrandedPrompt(input.prompt, input.negative_prompt);

  const response = await withTimeout(
    client.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: finalPrompt,
      config: {
        numberOfImages: 1,
        aspectRatio: "16:9",
        // Imagen 3 default safety level
      },
    }),
    IMAGE_TIMEOUT_MS,
    "gemini.generateImages(imagen-3)",
  );

  const generated = response.generatedImages?.[0];
  const imageBytes = generated?.image?.imageBytes;
  if (!imageBytes) {
    throw new Error("Gemini Imagen returned no image bytes");
  }

  const bytes = Buffer.from(imageBytes, "base64");
  const contentType = "image/png";
  // data: URL keeps the GeneratedImage.url contract truthful without needing
  // an upload step; pipeline writes `bytes` directly to disk.
  const url = `data:${contentType};base64,${imageBytes}`;

  return { url, bytes, contentType };
}
