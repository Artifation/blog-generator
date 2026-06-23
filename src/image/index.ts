import { generateImageWithFal } from "./fal.ts";
import { generateImageWithGemini } from "./gemini.ts";
import { generateImageWithCloudflare } from "./cloudflare.ts";

export interface ImageGenInput {
  prompt: string;
  negative_prompt: string;
  fetchImpl?: typeof fetch;
}

export interface ImageGenEnv {
  FAL_API_KEY?: string;
  GEMINI_API_KEY?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
}

export async function generateBlogImage(
  input: ImageGenInput,
  env: ImageGenEnv,
): Promise<{ url: string; bytes: Buffer; contentType: string; fallbackUsed: boolean }> {
  let lastErr: Error | undefined;

  // Tier 1: Fal.ai Flux Pro — highest quality, used when site has Fal key.
  if (env.FAL_API_KEY) {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await generateImageWithFal({ ...input, apiKey: env.FAL_API_KEY });
        return { ...r, fallbackUsed: false };
      } catch (err) {
        lastErr = err as Error;
      }
    }
  }

  // Tier 2: Gemini Imagen 3 — works with the same Gemini key the rest of the
  // pipeline already needs, no separate provider account required.
  if (env.GEMINI_API_KEY) {
    try {
      const r = await generateImageWithGemini({ ...input, apiKey: env.GEMINI_API_KEY });
      return { ...r, fallbackUsed: env.FAL_API_KEY ? true : false };
    } catch (err) {
      lastErr = err as Error;
    }
  }

  // Tier 3: Cloudflare Workers AI — last-resort if user has CF configured.
  if (env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
    const r = await generateImageWithCloudflare({
      ...input,
      apiKey: env.CF_API_TOKEN,
      accountId: env.CF_ACCOUNT_ID,
    });
    return { ...r, fallbackUsed: true };
  }

  throw new Error(
    `Image generation failed: no provider succeeded. Last error: ${lastErr?.message ?? "no provider configured (need FAL_API_KEY or GEMINI_API_KEY)"}`,
  );
}
