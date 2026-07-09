import type { GenerationTask } from "./types";

// Разбивка по предложениям — грубая эвристика (. ! ? как разделители), достаточная для
// MVP-подстраховки, не лингвистический парсер.
function truncateToMaxSentences(text: string, maxSentences: number): string {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  return sentences.slice(0, maxSentences).join("").trim();
}

// Защита в глубину: секреты и так не должны попадать в контекст, это подстраховка на
// случай, если модель домыслит запрещённую тему. При совпадении заменяем ВЕСЬ ответ на
// общую внутриигровую отговорку — точечная редактура рискует оставить куски контекста,
// намекающие на то же самое.
const DEFLECTION_FRAGMENT =
  "[TODO: заменить финальным текстом от нарративного дизайнера] Этот вопрос выходит за рамки того, что я готов обсуждать.";

export function applyGuards(text: string, task: GenerationTask): string {
  const hasForbiddenTopic = task.forbiddenTopics.some((topic) =>
    text.toLowerCase().includes(topic.toLowerCase()),
  );

  if (hasForbiddenTopic) {
    return DEFLECTION_FRAGMENT;
  }

  return truncateToMaxSentences(text, task.maxSentences);
}
