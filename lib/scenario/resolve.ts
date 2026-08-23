import type { Role } from "@/app/generated/prisma/client";
import type { GenerationTask } from "@/lib/ai/types";
import type { IntentResult } from "@/lib/intent/schema";
import type { DegradationPolicy, MaxLayer } from "@/lib/janus/degradation";
import { subsystemForIntent } from "@/lib/janus/subsystems";
import { calculateDesyncScore } from "./desync";
import { applyDispositionDelta } from "./disposition";
import { pickFragment } from "./fragments";
import { buildGenerationTask } from "./generation-task";
import { nextRepeatCount, shouldUseRepeatedPool } from "./intent-repeat";
import { nextShortTermMemory } from "./memory";
import { MEMORY_LAPSE_FRAGMENTS } from "./refusal-fragments";
import type { FragmentsByPoolType } from "./repository";
import { DESYNC_FULL_LLM_MIN, DESYNC_LIGHT_LLM_MIN } from "./thresholds";
import type { EscalationReason, ResolveStateUpdate, ScenarioSessionState } from "./types";

// Заглушки на случай, когда intent не распознан вовсе (нет ResponsePool для null) или
// когда бюджет full_llm исчерпан — фиксированный внутриигровой отказ вместо тихого
// отказа в обслуживании. TODO: заменить финальным текстом от нарративного дизайнера.
// Экспортированы (не module-private) — единственный источник истины для
// scripts/export-response-catalog.ts, не дублировать эти строки больше нигде.
export const UNRECOGNIZED_FRAGMENTS = [
  "[TODO: заменить финальным текстом от нарративного дизайнера] Запрос не распознан. Уточните формулировку.",
];
export const BUDGET_REFUSAL_FRAGMENTS = [
  "[TODO: заменить финальным текстом от нарративного дизайнера] Канал связи перегружен. Дальнейшие запросы временно отклоняются.",
];

export type ResolveOutput =
  | {
      kind: "deterministic";
      fragment: string;
      stateUpdate: ResolveStateUpdate;
      escalationReason?: EscalationReason;
    }
  | {
      kind: "light_llm";
      task: GenerationTask;
      stateUpdate: ResolveStateUpdate;
      escalationReason: EscalationReason;
    }
  | {
      kind: "full_llm";
      task: GenerationTask;
      stateUpdate: ResolveStateUpdate;
      escalationReason: EscalationReason;
    };

export type ResolveInput = {
  intentResult: IntentResult;
  sessionState: ScenarioSessionState;
  requiresSynthesis: boolean;
  playerRole: Role;
  fullLlmBudgetExceeded: boolean;
  // Заранее подтянутые из БД тексты фрагментов для сматченного intent'а (или null, если
  // intent не распознан) — см. lib/scenario/repository.ts.
  fragmentsByPoolType: FragmentsByPoolType | null;
  // Политика деградации на этот ход — вычисляется в роуте из JanusState
  // (lib/janus/degradation.ts). Кома до resolveResponse не доходит (перехват в роуте),
  // но потолок DETERMINISTIC здесь всё равно сработал бы — защита в глубину.
  policy: DegradationPolicy;
  // Живые значения для {{slotName}}-подстановки (lib/janus/slots.ts).
  slots: Record<string, string>;
  // Готовая секция «состояние системы» для генеративных слоёв (lib/janus/brief.ts).
  systemStateBrief: string;
  // Тумблер «Форсировать Слой 3» панели отладки (player.isDebug, см. app/api/chat/route.ts) —
  // пропускает ожидание desyncScore >= DESYNC_FULL_LLM_MIN, но не потолок политики деградации
  // и не часовой бюджет full_llm: ручное тестирование Слоя 3 должно видеть те же реальные
  // ограничения, только без утомительного набора сообщений для разгона desyncScore.
  forceFullLlm?: boolean;
  // Инъекция случайности для «провалов» памяти — тестируемость без моков Math.random.
  rng?: () => number;
};

const LAYER_RANK: Record<MaxLayer, number> = { DETERMINISTIC: 0, LIGHT_LLM: 1, FULL_LLM: 2 };

// Фрагмент детерминированного отказа при перехвате эскалации потолком политики: в аварийном
// режиме — аварийный пул, при погашенных подсистемах — деградированный; фоллбэки вниз до
// заглушки, чтобы отказ никогда не был пустым.
function pickDegradationFragment(
  policy: DegradationPolicy,
  fragments: FragmentsByPoolType | null,
  slots: Record<string, string>,
): string {
  const preferred =
    policy.forcedPool === "EMERGENCY" ? (fragments?.EMERGENCY ?? []) : (fragments?.DEGRADED ?? []);
  if (preferred.length > 0) return pickFragment(preferred, slots);
  const normal = fragments?.NORMAL ?? [];
  if (normal.length > 0) return pickFragment(normal, slots);
  return pickFragment(UNRECOGNIZED_FRAGMENTS, slots);
}

export function resolveResponse(input: ResolveInput): ResolveOutput {
  const {
    intentResult,
    sessionState,
    requiresSynthesis,
    fullLlmBudgetExceeded,
    fragmentsByPoolType,
    policy,
    slots,
    systemStateBrief,
  } = input;
  const rng = input.rng ?? Math.random;

  const disposition = applyDispositionDelta(sessionState.disposition, intentResult.tags);
  const desyncFromIntent = calculateDesyncScore(
    { desyncScore: sessionState.desyncScore, lastConfidenceTier: sessionState.lastConfidenceTier },
    intentResult,
    requiresSynthesis,
  );
  // Вклад деградации памяти: спутанность копится независимо от качества мэтчинга — игрок
  // слышит умирание (концепт, раздел 5). При восстановлении системы накопленный desync даст
  // всплеск LLM-ходов — осознанно («отходит после болезни»), параметр калибровки.
  const desyncScore = desyncFromIntent.desyncScore + policy.desyncPerTurn;
  const lastConfidenceTier = desyncFromIntent.lastConfidenceTier;

  const intentRepeatCount = intentResult.intent
    ? nextRepeatCount(sessionState.intentRepeatCount, intentResult.intent)
    : sessionState.intentRepeatCount;
  const repeatCount = intentResult.intent ? (intentRepeatCount[intentResult.intent] ?? 0) : 0;
  const useRepeatedPool = shouldUseRepeatedPool(repeatCount);

  const stateUpdate: ResolveStateUpdate = {
    disposition,
    intentRepeatCount,
    desyncScore,
    lastConfidenceTier,
    shortTermMemory: nextShortTermMemory(
      sessionState.shortTermMemory,
      intentResult.mentionedEntities,
    ),
  };

  const fewShotExamples = fragmentsByPoolType?.NORMAL ?? [];

  // «Провал» памяти: детерминированный итог с вероятностью memoryLapseProbability заменяется
  // репликой спутанности; причина хода при этом не перетирается — телеметрия честная.
  const withLapse = (output: ResolveOutput): ResolveOutput => {
    if (output.kind !== "deterministic") return output;
    if (policy.memoryLapseProbability <= 0 || rng() >= policy.memoryLapseProbability) {
      return output;
    }
    return { ...output, fragment: pickFragment(MEMORY_LAPSE_FRAGMENTS, slots) };
  };

  // Форс-тумблер отладки — проверяется до нормального порога desyncScore, но после его
  // расчёта (stateUpdate.desyncScore остаётся честным, сессия не портится принудительным
  // ходом). Потолок политики и бюджет full_llm всё равно соблюдаются, как в органической
  // эскалации ниже — иначе дебаг-режим тестировал бы недостижимую в проде конфигурацию.
  if (input.forceFullLlm) {
    if (LAYER_RANK.FULL_LLM > LAYER_RANK[policy.maxLayer]) {
      return withLapse({
        kind: "deterministic",
        fragment: pickDegradationFragment(policy, fragmentsByPoolType, slots),
        stateUpdate,
        escalationReason: "degradation_cap",
      });
    }
    if (fullLlmBudgetExceeded) {
      return withLapse({
        kind: "deterministic",
        fragment: pickFragment(BUDGET_REFUSAL_FRAGMENTS, slots),
        stateUpdate,
        escalationReason: "desync_full_budget_exceeded",
      });
    }
    return {
      kind: "full_llm",
      task: buildGenerationTask(intentResult, "full", disposition, fewShotExamples, systemStateBrief),
      stateUpdate,
      escalationReason: "desync_full_forced_debug",
    };
  }

  if (desyncScore >= DESYNC_FULL_LLM_MIN) {
    // Потолок политики деградации — перехват до вызова провайдера, по паттерну тумблера
    // «Use LLM» в app/api/chat/route.ts (ТЗ 1.2).
    if (LAYER_RANK.FULL_LLM > LAYER_RANK[policy.maxLayer]) {
      return withLapse({
        kind: "deterministic",
        fragment: pickDegradationFragment(policy, fragmentsByPoolType, slots),
        stateUpdate,
        escalationReason: "degradation_cap",
      });
    }
    if (fullLlmBudgetExceeded) {
      return withLapse({
        kind: "deterministic",
        fragment: pickFragment(BUDGET_REFUSAL_FRAGMENTS, slots),
        stateUpdate,
        escalationReason: "desync_full_budget_exceeded",
      });
    }
    return {
      kind: "full_llm",
      task: buildGenerationTask(
        intentResult,
        "full",
        disposition,
        fewShotExamples,
        systemStateBrief,
      ),
      stateUpdate,
      escalationReason: "desync_full",
    };
  }

  if (desyncScore >= DESYNC_LIGHT_LLM_MIN) {
    if (LAYER_RANK.LIGHT_LLM > LAYER_RANK[policy.maxLayer]) {
      return withLapse({
        kind: "deterministic",
        fragment: pickDegradationFragment(policy, fragmentsByPoolType, slots),
        stateUpdate,
        escalationReason: "degradation_cap",
      });
    }
    return {
      kind: "light_llm",
      task: buildGenerationTask(
        intentResult,
        "light",
        disposition,
        fewShotExamples,
        systemStateBrief,
      ),
      stateUpdate,
      escalationReason: "desync_light",
    };
  }

  // Детерминированная ветка. Интент погашенной подсистемы отвечает деградированным пулом:
  // тема технически недоступна, и это слышно (ТЗ 1.2, таблица M 0.4-0.7).
  const subsystem = subsystemForIntent(intentResult.intent);
  if (subsystem && policy.subsystems[subsystem] === "DOWN") {
    const degraded = fragmentsByPoolType?.DEGRADED ?? [];
    return withLapse({
      kind: "deterministic",
      fragment:
        degraded.length > 0
          ? pickFragment(degraded, slots)
          : pickFragment(UNRECOGNIZED_FRAGMENTS, slots),
      stateUpdate,
      escalationReason: "subsystem_down",
    });
  }

  // Аварийный режим переводит обычные детерминированные ответы в аварийный пул (если он
  // есть у интента) — короткие реплики, отказ от сложных тем.
  const emergency = fragmentsByPoolType?.EMERGENCY ?? [];
  if (policy.forcedPool === "EMERGENCY" && emergency.length > 0) {
    return withLapse({
      kind: "deterministic",
      fragment: pickFragment(emergency, slots),
      stateUpdate,
    });
  }

  const poolFragments = fragmentsByPoolType
    ? useRepeatedPool && fragmentsByPoolType.REPEATED.length > 0
      ? fragmentsByPoolType.REPEATED
      : fragmentsByPoolType.NORMAL
    : [];

  const fragment =
    poolFragments.length > 0
      ? pickFragment(poolFragments, slots)
      : pickFragment(UNRECOGNIZED_FRAGMENTS, slots);

  return withLapse({ kind: "deterministic", fragment, stateUpdate });
}
