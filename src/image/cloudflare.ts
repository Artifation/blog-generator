import type { GenerateImageInput, GeneratedImage } from "./fal.ts";
import { composeBrandedPrompt } from "./fal.ts";
import { IMAGE_TIMEOUT_MS } from "../llm/timeout.ts";

export async function generateImageWithCloudflare(
  input: GenerateImageInput & { accountId: string }
): Promise<GeneratedImage> {
  const f = input.fetchImpl ?? fetch;
  const url = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const res = await f(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    // Use the SAME branded prompt + negative terms as the Fal/Gemini tiers so a
    // fallback image still matches brand style and suppresses the AI clichés.
    body: JSON.stringify({ prompt: composeBrandedPrompt(input.prompt, input.negative_prompt) }),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Cloudflare image gen failed: ${res.status}`);
  const json = (await res.json()) as { result: { image: string } };
  const bytes = Buffer.from(json.result.image, "base64");
  // flux-1-schnell returns a PNG (base64), not a JPEG.
  return { url: "cf://generated", bytes, contentType: "image/png" };
}
