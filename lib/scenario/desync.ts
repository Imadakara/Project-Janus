import type { IntentResult } from "@/lib/intent/schema";
import { CONFIDENCE_LOW, CONFIDENCE_MEDIUM } from "./thresholds";
import type { ConfidenceTier } from "./types";

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= CONFIDENCE_MEDIUM) return "high";
  if (confidence >= CONFIDENCE_LOW) return "medium";
  return "low";
}

export type DesyncInput = {
  desyncScore: number;
  lastConfidenceTier: ConfidenceTier | null;
};

export type DesyncOutput = {
  desyncScore: number;
  lastConfidenceTier: ConfidenceTier;
};

// Таблица сигналов из ТЗ (см. Фаза 4.3):
// - confidence ниже среднего порога: +1
// - confidence ниже низкого порога (фактически не распознано): +2
// - второй подряд низкоуверенный результат: +2 (стрик, не сумма одиночных)
// - тег недовольства ответом (negation): +2
// - требуется синтез нескольких материалов: +3, минуя стрик
// - уверенное совпадение (tier "high"): сброс в 0, остальные сигналы для этого
//   сообщения игнорируются — уверенный матч значит, что система поняла запрос.
export function calculateDesyncScore(
  prev: DesyncInput,
  intentResult: IntentResult,
  requiresSynthesis: boolean,
): DesyncOutput {
  const tier = confidenceTier(intentResult.confidence);

  if (tier === "high") {
    return { desyncScore: 0, lastConfidenceTier: tier };
  }

  let score = prev.desyncScore;

  if (tier === "medium") {
    score += 1;
  } else {
    score += 2;
    if (prev.lastConfidenceTier === "low") {
      score += 2;
    }
  }

  if (intentResult.tags.includes("negation")) {
    score += 2;
  }

  if (requiresSynthesis) {
    score += 3;
  }

  return { desyncScore: score, lastConfidenceTier: tier };
}
