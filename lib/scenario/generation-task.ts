import type { GenerationTask } from "@/lib/ai/types";
import type { IntentResult } from "@/lib/intent/schema";
import type { Disposition } from "./types";

// MVP-эвристика тона по disposition. TODO: калибровать/заменить финальной моделью от
// нарративного дизайнера.
function describeTone(disposition: Disposition): string {
  if (disposition.tension >= 3) return "недоверчивый, отвечай короткими фразами";
  if (disposition.trust >= 3) return "чуть более открытый, но по-прежнему сдержанный";
  return "нейтральный, формальный, по протоколу";
}

// MVP-заглушка списка запретных тем — TODO: финальный список секретов сеттинга от
// нарративного дизайнера.
const FORBIDDEN_TOPICS = ["пароль доступа", "точное местоположение объекта"];

export function buildGenerationTask(
  intentResult: IntentResult,
  mode: "light" | "full",
  disposition: Disposition,
  fewShotExamples: string[],
): GenerationTask {
  return {
    tone: describeTone(disposition),
    forbiddenTopics: FORBIDDEN_TOPICS,
    allowedHints: intentResult.intent
      ? [`Похоже, вопрос относится к теме: ${intentResult.intent}.`]
      : [],
    maxSentences: mode === "light" ? 2 : 4,
    fewShotExamples: fewShotExamples.slice(0, 3),
  };
}
