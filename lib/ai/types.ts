import { z } from "zod";

// Контракт между Слоем 1 (/lib/scenario) и Слоем 3 (/lib/ai) — не должен опираться на
// возможности конкретного провайдера (prompt caching, extended thinking и т.п.).
export const GenerationTaskSchema = z.object({
  tone: z.string(),
  forbiddenTopics: z.array(z.string()),
  allowedHints: z.array(z.string()),
  maxSentences: z.number().int().positive(),
  fewShotExamples: z.array(z.string()),
  // Краткое «состояние системы» (M, живые/мёртвые сегменты, последняя потеря) — ЯНУС в
  // генеративных ответах знает, что умирает (ТЗ 1.7). Готовый текст, собирается в
  // lib/janus/brief.ts; пустая строка = секция не добавляется в промпт.
  systemStateBrief: z.string(),
});

export type GenerationTask = z.infer<typeof GenerationTaskSchema>;
