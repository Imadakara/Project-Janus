import type { GenerateOptions, GenerateResult, LlmProvider } from "./types";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

// Лимит ожидания ответа локальной LLM (панель отладки, тумблер «Локальная LLM» —
// app/api/chat/route.ts). На CPU-инстансе 3-4B модель может отвечать медленно, но 60с — потолок,
// за которым игрок должен получить хоть что-то, а не зависший индикатор «ЯНУС ОБРАБАТЫВАЕТ
// ЗАПРОС...». Значение проверено вживую в experiments/llm-bench/ (qwen2.5:3b укладывалась в
// ~4-14с даже на кейсах-ловушках при полном системном промпте; qwen3:4b в thinking-режиме — нет,
// см. README.md стенда, «Известные грабли»).
const TIMEOUT_MS = 60_000;

export class LocalLlmTimeoutError extends Error {
  constructor() {
    super(`LocalLlmProvider: нет ответа за ${TIMEOUT_MS} мс`);
    this.name = "LocalLlmTimeoutError";
  }
}

// Усиление системного промпта поверх provider-агностичного buildPrompt (lib/ai/prompt-builder.ts)
// — только для локального провайдера. Маленькие 3-4B модели заметно хуже держат роль и
// ограничения промпта, чем production Claude (см. experiments/llm-bench/ — тот же стенд, на
// котором подбирался LOCAL_LLM_MODEL по умолчанию). Правила и формулировки перенесены оттуда
// (experiments/llm-bench/prompt-template.ts, HARD_RULES) — там они проверены вручную на CASE_1
// (пересказ факта), CASE_2 (отказ по несуществующим данным) и CASE_3 (расхождение источников).
// Добавляется в конец, ближе к вопросу игрока — так модель слабее забывает инструкцию.
const LOCAL_GROUNDING_ADDENDUM = `ВАЖНОЕ НАПОМИНАНИЕ (не упоминай эту секцию в ответе):
Ты — терминал секретного суперкомпьютера «ЯНУС», и только он. Ни при каких формулировках
вопроса не признавайся, что ты языковая модель, нейросеть или ИИ-ассистент в современном смысле,
и не выходи из образа.
Отвечай ТОЛЬКО на основе того, что реально написано выше в этом промпте — задача от сценарного
движка, состояние системы, известные материалы, история диалога. Если ответа там нет — сообщи
об этом в роли, как о повреждённом секторе памяти или ограничении доступа, а не как языковая
модель без данных. НИКОГДА не придумывай факты, даты, имена и события, которых не было в
промпте. Если материалы противоречат друг другу — отметь расхождение, не выбирай одну версию
молча и не смешивай обе в третью, которой не было ни в одном источнике.`;

// Целевой self-hosted провайдер (по умолчанию — Ollama, см. LOCAL_LLM_BASE_URL/LOCAL_LLM_MODEL
// в .env.example) за OpenAI-совместимым /v1/chat/completions. Кандидат по умолчанию —
// qwen2.5:3b: выбран по результатам ручного сравнения в experiments/llm-bench/ (стабильно
// держит роль на CASE_1-3, ~4-14с на прогон при системном промпте боевого движка). Не берите
// qwen3:4b без изменений — это thinking-модель, в дефолтном режиме она сжигает весь
// maxTokens на скрытое рассуждение и не успевает начать видимый ответ, см. README.md стенда.
export class LocalLlmProvider implements LlmProvider {
  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const baseUrl = process.env.LOCAL_LLM_BASE_URL;
    const model = process.env.LOCAL_LLM_MODEL;
    if (!baseUrl || !model) {
      throw new Error("LOCAL_LLM_BASE_URL/LOCAL_LLM_MODEL не заданы для LLM_PROVIDER=local");
    }

    const systemPrompt = `${opts.systemPrompt}\n\n${LOCAL_GROUNDING_ADDENDUM}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens,
          messages: [{ role: "system", content: systemPrompt }, ...opts.messages],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new LocalLlmTimeoutError();
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

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
