export type GenerateMessage = { role: "user" | "assistant"; content: string };

export type GenerateOptions = {
  systemPrompt: string;
  messages: GenerateMessage[];
  maxTokens: number;
};

export type GenerateResult = {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

// Общий контракт Слоя 3 — /lib/scenario и prompt-builder.ts зависят только от него, не
// от того, какой провайдер активен (см. LLM_PROVIDER в .env).
export interface LlmProvider {
  generate(opts: GenerateOptions): Promise<GenerateResult>;
}
