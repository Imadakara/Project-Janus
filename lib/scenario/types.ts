export type Disposition = { trust: number; tension: number };

export type ConfidenceTier = "high" | "medium" | "low";

export type ShortTermMemoryEntry = { entity: string; mentionedAt: string };

// Зеркалит новые поля ChatSession (см. prisma/schema.prisma) — состояние диалоговой
// сессии, которым владеет Слой 1.
export type ScenarioSessionState = {
  disposition: Disposition;
  activeContext: string | null;
  shortTermMemory: ShortTermMemoryEntry[];
  intentRepeatCount: Record<string, number>;
  desyncScore: number;
  lastConfidenceTier: ConfidenceTier | null;
};

export type ResolveStateUpdate = Pick<
  ScenarioSessionState,
  "disposition" | "intentRepeatCount" | "desyncScore" | "lastConfidenceTier" | "shortTermMemory"
>;

// Причины эскалации до Слоя 3, персистятся в ChatMessage.escalationReason (String?) — новые
// значения не требуют миграции БД. См. lib/scenario/debug-explain.ts для их использования в
// панели отладки. Причины degradation_cap/subsystem_down/coma/memory_lost — детерминированные
// перехваты политики деградации (lib/janus/degradation.ts) и смертности памяти (ТЗ 1.2/1.3).
// desync_full_forced_debug/local_llm_timeout — тумблеры панели отладки для ручного тестирования
// локальной LLM как кандидата на Слой 3 (см. app/api/chat/route.ts, lib/ai/providers/local.ts).
export type EscalationReason =
  | "desync_light"
  | "desync_full"
  | "desync_full_budget_exceeded"
  | "desync_light_blocked_toggle"
  | "desync_full_blocked_toggle"
  | "desync_full_forced_debug"
  | "degradation_cap"
  | "subsystem_down"
  | "coma"
  | "memory_lost"
  | "local_llm_timeout";
