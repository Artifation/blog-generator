import type { GenerateImageInput, GeneratedImage } from "./fal.ts";

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
    body: JSON.stringify({ prompt: input.prompt }),
  });
  if (!res.ok) throw new Error(`Cloudflare image gen failed: ${res.status}`);
  const json = (await res.json()) as { result: { image: string } };
  const bytes = Buffer.from(json.result.image, "base64");
  return { url: "cf://generated", bytes, contentType: "image/jpeg" };
}
