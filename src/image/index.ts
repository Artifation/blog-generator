import { generateImageWithFal } from "./fal.ts";
import { generateImageWithCloudflare } from "./cloudflare.ts";

export interface ImageGenInput {
  prompt: string;
  negative_prompt: string;
  fetchImpl?: typeof fetch;
}

export interface ImageGenEnv {
  FAL_API_KEY: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
}

export async function generateBlogImage(
  input: ImageGenInput,
  env: ImageGenEnv
): Promise<{ url: string; bytes: Buffer; contentType: string; fallbackUsed: boolean }> {
  let lastErr: Error | undefined;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await generateImageWithFal({ ...input, apiKey: env.FAL_API_KEY });
      return { ...r, fallbackUsed: false };
    } catch (err) {
      lastErr = err as Error;
    }
  }
  if (env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
    const r = await generateImageWithCloudflare({
      ...input,
      apiKey: env.CF_API_TOKEN,
      accountId: env.CF_ACCOUNT_ID,
    });
    return { ...r, fallbackUsed: true };
  }
  throw new Error(`Image generation failed: ${lastErr?.message}`);
}
