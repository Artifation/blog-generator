export type LLMProviderName = "anthropic" | "gemini" | "groq";

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
  temperature?: number;
  jsonSchema?: object;
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: LLMProviderName;
}

export interface LLMProvider {
  name: LLMProviderName;
  call(req: LLMRequest): Promise<LLMResponse>;
}
