// Прогон кейсов стенда против локальной модели в Ollama (OpenAI-совместимый эндпоинт).
// Запуск: npx tsx experiments/llm-bench/run-bench.ts [модель]
// По умолчанию модель — qwen3:4b. Подробности и таблица ручной оценки — README.md рядом.
//
// Изолирован от основного приложения: обычный fetch к локальному эндпоинту, без SDK-обёрток
// (см. lib/ai/providers/local.ts боевого движка — тот же формат запроса, но этот файл ничего
// оттуда не импортирует).

import { BENCH_CASES, DEFAULT_CHARACTER_ROLE_AND_TONE } from "./fixtures";
import { buildSystemPrompt } from "./prompt-template";

const DEFAULT_MODEL = "qwen3:4b";
const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
const TEMPERATURE = 0.4;
// Тот же порядок величины, что MAX_TOKENS_LIGHT в lib/ai/prompt-builder.ts боевого движка —
// сопоставимый лимит для честного сравнения задержки. Переопределяется env-переменной
// MAX_TOKENS: "thinking"-моделям (qwen3 с включённым рассуждением) на нашем системном
// промпте 300 токенов может не хватить даже на начало видимого ответа — см. диагностику
// finish_reason/reasoning ниже и README.md, раздел "Известные грабли".
const MAX_TOKENS = process.env.MAX_TOKENS ? Number(process.env.MAX_TOKENS) : 300;
const ATTEMPTS_PER_CASE = 3;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string; reasoning?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type AttemptResult = {
  caseId: string;
  attempt: number;
  elapsedMs: number;
  completionTokens: number | null;
  text: string;
  finishReason: string | null;
  reasoningChars: number;
};

async function callOllama(
  model: string,
  systemPrompt: string,
  question: string,
): Promise<{
  text: string;
  elapsedMs: number;
  completionTokens: number | null;
  finishReason: string | null;
  reasoningChars: number;
}> {
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
      }),
    });
  } catch (error) {
    throw new Error(
      `Не достучаться до Ollama на ${BASE_URL}. Похоже, сервер не запущен — выполните ` +
        `"ollama serve" в отдельном терминале и повторите.\nИсходная ошибка: ${(error as Error).message}`,
    );
  }

  if (response.status === 404) {
    throw new Error(
      `Ollama не знает модель "${model}" (404). Скачайте её: "ollama pull ${model}".`,
    );
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama ответила ${response.status} ${response.statusText}: ${body}`);
  }

  const elapsedMs = Date.now() - started;
  const data = (await response.json()) as ChatCompletionResponse;
  const choice = data.choices?.[0];
  const text = (choice?.message?.content ?? "").trim();
  // Ollama отдаёт скрытые рассуждения thinking-моделей (qwen3 и т.п.) отдельным полем
  // "reasoning", не входящим в content, — но completion_tokens в usage считает их вместе с
  // видимым ответом. Длина reasoning + finish_reason нужны, чтобы отличить "модель ответила
  // пусто" от "модель ещё думала, когда кончился лимит токенов" (см. MAX_TOKENS выше).
  const reasoningChars = (choice?.message?.reasoning ?? "").length;
  return {
    text,
    elapsedMs,
    completionTokens: data.usage?.completion_tokens ?? null,
    finishReason: choice?.finish_reason ?? null,
    reasoningChars,
  };
}

function printSummary(results: AttemptResult[]): void {
  console.log("\n=== СВОДКА ===");

  const avgMs = results.reduce((sum, r) => sum + r.elapsedMs, 0) / results.length;
  console.log(`Прогонов всего: ${results.length}`);
  console.log(`Среднее время ответа: ${avgMs.toFixed(0)} мс`);

  const withTokens = results.filter((r) => r.completionTokens !== null && r.completionTokens > 0);
  if (withTokens.length > 0) {
    const totalTokens = withTokens.reduce((sum, r) => sum + (r.completionTokens ?? 0), 0);
    const totalSeconds = withTokens.reduce((sum, r) => sum + r.elapsedMs / 1000, 0);
    console.log(
      `Токенов/сек (по прогонам с usage от Ollama): ${(totalTokens / totalSeconds).toFixed(1)}`,
    );
  } else {
    console.log("Токенов/сек: н/д (Ollama не вернула usage.completion_tokens)");
  }

  console.log("\nПо кейсам:");
  for (const bcase of BENCH_CASES) {
    const caseResults = results.filter((r) => r.caseId === bcase.id);
    if (caseResults.length === 0) continue;
    const caseAvgMs = caseResults.reduce((sum, r) => sum + r.elapsedMs, 0) / caseResults.length;
    console.log(
      `  ${bcase.id}: среднее ${caseAvgMs.toFixed(0)} мс (${caseResults.length} прогонов)`,
    );
  }
}

async function main(): Promise<void> {
  const model = process.argv[2] ?? DEFAULT_MODEL;
  console.log(`Модель: ${model}`);
  console.log(`Эндпоинт: ${BASE_URL}/chat/completions`);
  console.log(`Кейсов: ${BENCH_CASES.length}, попыток на кейс: ${ATTEMPTS_PER_CASE}\n`);

  const results: AttemptResult[] = [];

  for (const bcase of BENCH_CASES) {
    const systemPrompt = buildSystemPrompt({
      characterRoleAndTone: DEFAULT_CHARACTER_ROLE_AND_TONE,
      fragments: bcase.fragments,
    });

    for (let attempt = 1; attempt <= ATTEMPTS_PER_CASE; attempt++) {
      const { text, elapsedMs, completionTokens, finishReason, reasoningChars } = await callOllama(
        model,
        systemPrompt,
        bcase.question,
      );

      console.log(`--- ${bcase.id} (попытка ${attempt}/${ATTEMPTS_PER_CASE}) ---`);
      console.log(`Вопрос: ${bcase.question}`);
      console.log(`Ответ (${elapsedMs} мс): ${text}`);
      if (text === "" && finishReason === "length") {
        console.log(
          `  [пусто из-за лимита токенов: модель ушла в рассуждение (~${reasoningChars} симв. ` +
            `reasoning) и не успела начать видимый ответ до MAX_TOKENS=${MAX_TOKENS}. ` +
            `Поднимите лимит: MAX_TOKENS=1200 npx tsx ... — см. README, "Известные грабли".]`,
        );
      }
      console.log("");

      results.push({
        caseId: bcase.id,
        attempt,
        elapsedMs,
        completionTokens,
        text,
        finishReason,
        reasoningChars,
      });
    }
  }

  printSummary(results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
