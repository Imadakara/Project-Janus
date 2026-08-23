import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt-builder";

// Задача: task.systemStateBrief — обязательное поле GenerationTask (см. lib/ai/types.ts),
// остальные поля минимальны, они не участвуют в этих ассертах.
const BASE_TASK = {
  tone: "нейтральный",
  forbiddenTopics: [],
  allowedHints: [],
  maxSentences: 4,
  fewShotExamples: [],
  systemStateBrief: "",
};

describe("buildPrompt — бюджет генерации (maxTokens)", () => {
  it("light-режим ограничен вдвое туже прежнего лимита", () => {
    const result = buildPrompt(
      { ...BASE_TASK, maxSentences: 2 },
      { mode: "light", role: "UNASSIGNED", currentMessage: "Кто ты?" },
    );

    // 150, не 300 — см. комментарий в prompt-builder.ts: decode на CPU последовательный,
    // лишний бюджет — прямая потеря времени, а не подстраховка (маленькие локальные модели
    // генерят вплоть до лимита вместо того, чтобы остановиться на maxSentences).
    expect(result.maxTokens).toBe(150);
  });

  it("full-режим ограничен вдвое туже прежнего лимита", () => {
    const result = buildPrompt(BASE_TASK, {
      mode: "full",
      role: "UNASSIGNED",
      currentMessage: "Расскажи о себе.",
    });

    expect(result.maxTokens).toBe(300);
  });
});
