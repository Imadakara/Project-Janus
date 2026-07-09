import type { GenerateOptions, GenerateResult, LlmProvider } from "./types";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

// Целевой self-hosted провайдер (Qwen/аналог на vLLM) за OpenAI-совместимым
// /v1/chat/completions. В MVP — рабочий каркас без реального сервера для end-to-end
// теста (закупка/разворачивание GPU-сервера вне рамок ТЗ) — конфигурация, запрос,
// разбор ответа уже реализованы и покрыты тестами через мок fetch.
export class LocalLlmProvider implements LlmProvider {
  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const baseUrl = process.env.LOCAL_LLM_BASE_URL;
    const model = process.env.LOCAL_LLM_MODEL;
    if (!baseUrl || !model) {
      throw new Error("LOCAL_LLM_BASE_URL/LOCAL_LLM_MODEL не заданы для LLM_PROVIDER=local");
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens,
        messages: [{ role: "system", content: opts.systemPrompt }, ...opts.messages],
      }),
    });

    if (!response.ok) {
      throw new Error(`LocalLlmProvider: сервер ответил ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const text = (data.choices?.[0]?.message?.content ?? "").trim();

    return {
      text,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      model,
    };
  }
}
