import { describe, expect, it } from "vitest";
import { applyGuards } from "./guards";
import type { GenerationTask } from "./types";

function task(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    tone: "нейтральный",
    forbiddenTopics: [],
    allowedHints: [],
    maxSentences: 2,
    fewShotExamples: [],
    ...overrides,
  };
}

describe("applyGuards", () => {
  it("truncates the response to maxSentences", () => {
    const text = "Первое предложение. Второе предложение. Третье предложение.";
    const result = applyGuards(text, task({ maxSentences: 2 }));
    expect(result).toBe("Первое предложение. Второе предложение.");
  });

  it("replaces the whole response with a deflection when a forbidden topic is mentioned", () => {
    const text = "Пароль доступа хранится в секторе B.";
    const result = applyGuards(
      text,
      task({ forbiddenTopics: ["пароль доступа"], maxSentences: 5 }),
    );
    expect(result).not.toContain("сектор");
    expect(result.length).toBeGreaterThan(0);
  });

  it("leaves a clean response under the sentence limit unchanged", () => {
    const text = "Короткий ответ.";
    const result = applyGuards(text, task({ maxSentences: 3 }));
    expect(result).toBe("Короткий ответ.");
  });
});
