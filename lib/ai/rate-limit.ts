import { isRateLimited } from "@/lib/rate-limit";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

export function isChatRateLimited(playerId: string): boolean {
  return isRateLimited(`chat:${playerId}`, WINDOW_MS, MAX_REQUESTS_PER_WINDOW);
}

// Отдельный бюджетный лимит на самый дорогой путь (Слой 3, полный режим) — не даёт
// одному настойчивому игроку раскрутить самый дорогой путь, независимо от общего
// чат-рейт-лимита выше. При превышении lib/scenario/resolve.ts возвращает
// детерминированный внутриигровой отказ, а не тихий отказ в обслуживании.
const FULL_LLM_WINDOW_MS = 60 * 60_000;
const MAX_FULL_LLM_PER_WINDOW = 10;

export function isFullLlmBudgetExceeded(playerId: string): boolean {
  return isRateLimited(`full-llm:${playerId}`, FULL_LLM_WINDOW_MS, MAX_FULL_LLM_PER_WINDOW);
}
