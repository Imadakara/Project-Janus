import { CHAT_MODEL, getAnthropicClient } from "@/lib/ai/client";
import type { GenerateOptions, GenerateResult, LlmProvider } from "./types";

// Оборачивает существующий синглтон-клиент lib/ai/client.ts, не заменяет его. Любая
// Claude-специфичная оптимизация (prompt caching, extended thinking) остаётся внутри
// этого файла — не часть общего контракта LlmProvider.
export class ClaudeProvider implements LlmProvider {
  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: opts.maxTokens,
      system: opts.systemPrompt,
      messages: opts.messages.map((message) => ({ role: message.role, content: message.content })),
    });

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();

    return {
      text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: CHAT_MODEL,
    };
  }
}
