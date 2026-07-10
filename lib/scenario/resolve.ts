import type { Role } from "@/app/generated/prisma/client";
import type { GenerationTask } from "@/lib/ai/types";
import type { IntentResult } from "@/lib/intent/schema";
import { calculateDesyncScore } from "./desync";
import { applyDispositionDelta } from "./disposition";
import { pickFragment } from "./fragments";
import { buildGenerationTask } from "./generation-task";
import { nextRepeatCount, shouldUseRepeatedPool } from "./intent-repeat";
import { nextShortTermMemory } from "./memory";
import type { FragmentsByPoolType } from "./repository";
import { DESYNC_FULL_LLM_MIN, DESYNC_LIGHT_LLM_MIN } from "./thresholds";
import type { EscalationReason, ResolveStateUpdate, ScenarioSessionState } from "./types";

// Заглушки на случай, когда intent не распознан вовсе (нет ResponsePool для null) или
// когда бюджет full_llm исчерпан — фиксированный внутриигровой отказ вместо тихого
// отказа в обслуживании. TODO: заменить финальным текстом от нарративного дизайнера.
const UNRECOGNIZED_FRAGMENTS = [
  "[TODO: заменить финальным текстом от нарративного дизайнера] Запрос не распознан. Уточните формулировку.",
];
const BUDGET_REFUSAL_FRAGMENTS = [
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
};

export function resolveResponse(input: ResolveInput): ResolveOutput {
  const {
    intentResult,
    sessionState,
    requiresSynthesis,
    fullLlmBudgetExceeded,
    fragmentsByPoolType,
  } = input;

  const disposition = applyDispositionDelta(sessionState.disposition, intentResult.tags);
  const { desyncScore, lastConfidenceTier } = calculateDesyncScore(
    { desyncScore: sessionState.desyncScore, lastConfidenceTier: sessionState.lastConfidenceTier },
    intentResult,
    requiresSynthesis,
  );

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

  if (desyncScore >= DESYNC_FULL_LLM_MIN) {
    if (fullLlmBudgetExceeded) {
      return {
        kind: "deterministic",
        fragment: pickFragment(BUDGET_REFUSAL_FRAGMENTS),
        stateUpdate,
        escalationReason: "desync_full_budget_exceeded",
      };
    }
    return {
      kind: "full_llm",
      task: buildGenerationTask(intentResult, "full", disposition, fewShotExamples),
      stateUpdate,
      escalationReason: "desync_full",
    };
  }

  if (desyncScore >= DESYNC_LIGHT_LLM_MIN) {
    return {
      kind: "light_llm",
      task: buildGenerationTask(intentResult, "light", disposition, fewShotExamples),
      stateUpdate,
      escalationReason: "desync_light",
    };
  }

  const poolFragments = fragmentsByPoolType
    ? useRepeatedPool && fragmentsByPoolType.REPEATED.length > 0
      ? fragmentsByPoolType.REPEATED
      : fragmentsByPoolType.NORMAL
    : [];

  const fragment =
    poolFragments.length > 0 ? pickFragment(poolFragments) : pickFragment(UNRECOGNIZED_FRAGMENTS);

  return { kind: "deterministic", fragment, stateUpdate };
}
