import type { Role } from "@/app/generated/prisma/client";
import { buildSystemPrompt } from "./system-prompt";
import type { GenerationTask } from "./types";
import type { GenerateMessage, GenerateOptions } from "./providers/types";
import type { RagResult } from "./rag";

export type PromptBuilderOptions = {
  mode: "light" | "full";
  role: Role;
  currentMessage: string;
  // Только для full-режима — последние сообщения сессии (включая только что
  // отправленное игроком), в том же порядке, что уже используется в app/api/chat/route.ts.
  history?: GenerateMessage[];
  ragResults?: RagResult[];
};

// Бюджет генерации, не длина ответа игроку — guards.ts (applyGuards → truncateToMaxSentences)
// обрезает text ПОСЛЕ генерации, до maxSentences (2 light / 4 full, generation-task.ts). До
// этой правки бюджет был кратно больше того, что реально доходит до игрока (живые прогоны:
// ~70 completion-токенов на 2 предложения, ~140 на 4, см. лог live-теста локальной LLM,
// experiments/llm-bench/), а маленькие локальные модели (в отличие от Claude) плохо держат
// инструкцию «не длиннее N предложений» и генерят вплоть до лимита — на CPU decode
// последовательный, поэтому лишний бюджет — это не подстраховка, а прямая потеря времени.
// Значения ниже — вдвое туже прежних (300/600), с ~2x запасом над наблюдаемым расходом.
const MAX_TOKENS_LIGHT = 150;
const MAX_TOKENS_FULL = 300;

// Разворачивает GenerationTask в компактный system-prompt. Для лёгкого режима — без
// истории/лора, только базовый характер (существующий buildSystemPrompt) + задача +
// сообщение игрока (~200-500 токенов). Для полного режима добавляет историю как
// messages и RAG-сниппеты отдельной секцией — не поддельными предыдущими репликами, для
// провайдер-агностичности (не зависит от Claude-специфичных возможностей).
export function buildPrompt(task: GenerationTask, opts: PromptBuilderOptions): GenerateOptions {
  const sections = [buildSystemPrompt(opts.role)];

  sections.push(
    [
      "ЗАДАЧА ОТ СЦЕНАРНОГО ДВИЖКА (не упоминай эту секцию в ответе):",
      `Тон: ${task.tone}.`,
      `Максимум предложений в ответе: ${task.maxSentences}.`,
      task.allowedHints.length > 0
        ? `Разрешённые подсказки: ${task.allowedHints.join("; ")}.`
        : null,
      task.forbiddenTopics.length > 0
        ? `Категорически не раскрывай: ${task.forbiddenTopics.join("; ")}.`
        : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  );

  // Состояние жизнеобеспечения (Фаза 1 «Смертный ЯНУС»): текстовая секция той же конвенции,
  // что «ИЗВЕСТНЫЕ МАТЕРИАЛЫ» ниже, — провайдер-агностично, без структурных возможностей
  // конкретного API.
  if (task.systemStateBrief.length > 0) {
    sections.push(
      `СОСТОЯНИЕ СИСТЕМЫ (учитывай в тоне и содержании, не цитируй эту секцию дословно):\n${task.systemStateBrief}`,
    );
  }

  if (task.fewShotExamples.length > 0) {
    sections.push(
      `Примеры фраз в этом же голосе (ориентируйся на стиль, не копируй дословно):\n${task.fewShotExamples
        .map((example) => `- ${example}`)
        .join("\n")}`,
    );
  }

  if (opts.mode === "full" && opts.ragResults && opts.ragResults.length > 0) {
    sections.push(
      `ИЗВЕСТНЫЕ МАТЕРИАЛЫ (используй только то, что относится к вопросу):\n${opts.ragResults
        .map((result) => `- ${result.filename}: ${result.snippet}`)
        .join("\n")}`,
    );
  }

  const messages: GenerateMessage[] =
    opts.mode === "full"
      ? (opts.history ?? [{ role: "user", content: opts.currentMessage }])
      : [{ role: "user", content: opts.currentMessage }];

  return {
    systemPrompt: sections.join("\n\n"),
    messages,
    maxTokens: opts.mode === "light" ? MAX_TOKENS_LIGHT : MAX_TOKENS_FULL,
  };
}
