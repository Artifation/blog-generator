import { GoogleGenAI } from "@google/genai";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types.ts";
import { GEMINI_TIMEOUT_MS, withTimeout } from "./timeout.ts";

export function createGeminiProvider(apiKey: string): LLMProvider {
  const client = new GoogleGenAI({ apiKey });

  return {
    name: "gemini",
    async call(req: LLMRequest): Promise<LLMResponse> {
      // Bij useSearch: enable Google-Search grounding. URIs die het model bezoekt
      // komen terug in groundingMetadata.groundingChunks[].web.uri — gebruikt
      // door Researcher om hallucinated URLs te filteren.
      // NB: grounding is incompatibel met sommige JSON response_mime_types, dus
      // we leveren JSON via prompt-instructie, niet via responseSchema.
      const config: Record<string, unknown> = {
        maxOutputTokens: req.maxTokens,
        temperature: req.temperature ?? 1.0,
      };
      if (req.useSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      // The genai SDK has no built-in per-call deadline, so bound wall-clock
      // here — otherwise a hung request blocks the whole pipeline run.
      const res = await withTimeout(
        client.models.generateContent({
          model: req.model,
          contents: [
            { role: "user", parts: [{ text: `${req.systemPrompt}\n\n${req.userPrompt}` }] },
          ],
          config,
        }),
        GEMINI_TIMEOUT_MS,
        `gemini.generateContent(${req.model})`,
      );

      // Extract grounded URIs uit eerste candidate's groundingMetadata (Gemini 2.x).
      const groundedUrls: string[] = [];
      const candidates = (res as { candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> } }> }).candidates;
      const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      for (const c of chunks) {
        const uri = c.web?.uri;
        if (uri) groundedUrls.push(uri);
      }

      // Gemini 2.5 bills "thinking" tokens at the output rate but reports them
      // separately from candidatesTokenCount — include them so cost tracking
      // isn't undercounted.
      const usageMeta = res.usageMetadata as
        | { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
        | undefined;
      return {
        text: res.text ?? "",
        inputTokens: usageMeta?.promptTokenCount ?? 0,
        outputTokens: (usageMeta?.candidatesTokenCount ?? 0) + (usageMeta?.thoughtsTokenCount ?? 0),
        model: req.model,
        provider: "gemini",
        groundedUrls: groundedUrls.length > 0 ? groundedUrls : undefined,
      };
    },
  };
}
