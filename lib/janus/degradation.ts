// Политика деградации — таблица из концепта смертности (раздел 5) как код (ТЗ 1.2).
// Чистая функция от снапшота JanusState: вычисляется в app/api/chat/route.ts на каждый ход
// и прокидывается в resolveResponse() (lib/scenario/resolve.ts). Все пороги — константы
// этого модуля, менять в одном месте и только «вперёд и публично» (концепт, раздел 6).

import type { JanusStateSnapshot } from "./state";
import { resolveSubsystemStatuses, type SubsystemKey, type SubsystemStatus } from "./subsystems";

export type DegradationStage = "NOMINAL" | "QUEUED" | "SUBSYSTEMS_DOWN" | "EMERGENCY" | "COMA";
export type MaxLayer = "DETERMINISTIC" | "LIGHT_LLM" | "FULL_LLM";

export type DegradationPolicy = {
  stage: DegradationStage;
  // Жёсткий потолок эскалации: resolveResponse не поднимется выше, эскалация сверх потолка
  // перехватывается с escalationReason "degradation_cap" (паттерн тумблера «Use LLM»).
  maxLayer: MaxLayer;
  // Диегетика очереди: задержка «печати» ответа, применяется клиентом чата.
  replyDelayMs: number;
  subsystems: Record<SubsystemKey, SubsystemStatus>;
  // EMERGENCY-стадия принудительно переводит детерминированные ответы в аварийный пул;
  // DEGRADED-пул не форсится глобально — он пер-подсистемный (subsystemForIntent).
  forcedPool: "EMERGENCY" | null;
  // Вклад деградации ПАМЯТИ (integrityIndex) в спутанность речи: добавка к desyncScore
  // за ход и вероятность «провала» — замены детерминированной реплики на пул провалов.
  desyncPerTurn: 0 | 1 | 2;
  memoryLapseProbability: number;
};

// Пороги стадий по M — публичная таблица концепта (раздел 5).
export const M_NOMINAL_MIN = 1.0;
export const M_QUEUED_MIN = 0.7;
export const M_SUBSYSTEMS_MIN = 0.4;
export const M_EMERGENCY_MIN = 0.2;

// Максимальная задержка «печати»: растёт линейно от 0 (M=1.0) до максимума (M=0.7) и ниже
// по полосам не убывает — терминал «думает» тем дольше, чем хуже системе.
export const REPLY_DELAY_MAX_MS = 4000;

// Пороги вклада памяти (integrityIndex) в спутанность. Ниже INTEGRITY_DESYNC_1 деградация
// «слышна» (+1 desync/ход, редкие провалы), ниже INTEGRITY_DESYNC_2 — явная (+2, частые).
export const INTEGRITY_DESYNC_1 = 0.8;
export const INTEGRITY_DESYNC_2 = 0.5;
export const MEMORY_LAPSE_P1 = 0.1;
export const MEMORY_LAPSE_P2 = 0.25;

function resolveStage(computeMargin: number): DegradationStage {
  if (computeMargin >= M_NOMINAL_MIN) return "NOMINAL";
  if (computeMargin >= M_QUEUED_MIN) return "QUEUED";
  if (computeMargin >= M_SUBSYSTEMS_MIN) return "SUBSYSTEMS_DOWN";
  if (computeMargin >= M_EMERGENCY_MIN) return "EMERGENCY";
  return "COMA";
}

function resolveReplyDelayMs(computeMargin: number): number {
  if (computeMargin >= M_NOMINAL_MIN) return 0;
  if (computeMargin < M_QUEUED_MIN) return REPLY_DELAY_MAX_MS;
  // Линейная интерполяция внутри полосы очередей [0.7, 1.0).
  const t = (M_NOMINAL_MIN - computeMargin) / (M_NOMINAL_MIN - M_QUEUED_MIN);
  return Math.round(REPLY_DELAY_MAX_MS * t);
}

const STAGE_MAX_LAYER: Record<DegradationStage, MaxLayer> = {
  NOMINAL: "FULL_LLM",
  QUEUED: "FULL_LLM",
  SUBSYSTEMS_DOWN: "FULL_LLM",
  // Аварийный режим: бюджет full_llm = 0 (концепт: «переход на меньшую модель» — в Фазе 1
  // честно моделируется потолком light_llm).
  EMERGENCY: "LIGHT_LLM",
  COMA: "DETERMINISTIC",
};

export function resolveDegradationPolicy(state: JanusStateSnapshot): DegradationPolicy {
  const stage = resolveStage(state.computeMargin);

  let desyncPerTurn: 0 | 1 | 2 = 0;
  let memoryLapseProbability = 0;
  if (state.integrityIndex < INTEGRITY_DESYNC_2) {
    desyncPerTurn = 2;
    memoryLapseProbability = MEMORY_LAPSE_P2;
  } else if (state.integrityIndex < INTEGRITY_DESYNC_1) {
    desyncPerTurn = 1;
    memoryLapseProbability = MEMORY_LAPSE_P1;
  }

  return {
    stage,
    maxLayer: STAGE_MAX_LAYER[stage],
    replyDelayMs: resolveReplyDelayMs(state.computeMargin),
    // Статусы считаются от M напрямую (не из state.subsystems): политика — чистая функция
    // одного снапшота, персистентная копия в JanusState нужна читателям вне хода (PULS).
    subsystems: resolveSubsystemStatuses(state.computeMargin),
    forcedPool: stage === "EMERGENCY" ? "EMERGENCY" : null,
    desyncPerTurn,
    memoryLapseProbability,
  };
}
