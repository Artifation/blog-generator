export type LLMProviderName = "anthropic" | "gemini" | "groq";

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
  temperature?: number;
  jsonSchema?: object;
  /** Gemini: activeer Google-Search grounding zodat URLs uit live SERP komen
   * ipv uit het model's parametric memory (= hallucinaties). Andere providers negeren. */
  useSearch?: boolean;
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: LLMProviderName;
  /** Gemini grounding: live URIs die het model heeft bezocht voor deze response.
   * Gebruikt door Researcher om hallucinated URLs te filteren. */
  groundedUrls?: string[];
  /** True when the model hit its output cap (stop_reason=max_tokens /
   * finishReason=MAX_TOKENS / finish_reason=length). The JSON is then incomplete,
   * so runAgent fails fast instead of retrying the identical (doomed) request. */
  truncated?: boolean;
}

export interface LLMProvider {
  name: LLMProviderName;
  call(req: LLMRequest): Promise<LLMResponse>;
}
