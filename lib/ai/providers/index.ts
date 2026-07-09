import { ClaudeProvider } from "./claude";
import { LocalLlmProvider } from "./local";
import type { LlmProvider } from "./types";

let provider: LlmProvider | null = null;

// Активный провайдер выбирается через LLM_PROVIDER в .env (claude по умолчанию), без
// правок вызывающего кода (/lib/scenario, app/api/chat/route.ts).
export function getLlmProvider(): LlmProvider {
  if (!provider) {
    provider = process.env.LLM_PROVIDER === "local" ? new LocalLlmProvider() : new ClaudeProvider();
  }
  return provider;
}
