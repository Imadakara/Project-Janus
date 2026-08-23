import { describe, expect, it } from "vitest";
import { resolveResponse, type ResolveInput } from "./resolve";
import type { IntentResult } from "@/lib/intent/schema";
import type { DegradationPolicy } from "@/lib/janus/degradation";
import { MEMORY_LAPSE_FRAGMENTS } from "./refusal-fragments";
import type { ScenarioSessionState } from "./types";
import type { FragmentsByPoolType } from "./repository";

const NORMAL_FRAGMENTS = ["Нормальный ответ вариант А.", "Нормальный ответ вариант Б."];
const REPEATED_FRAGMENTS = ["Повторный ответ: вопрос уже задавался."];
const DEGRADED_FRAGMENTS = ["Деградированный ответ: подсистема погашена."];
const EMERGENCY_FRAGMENTS = ["Аварийный ответ: экономлю циклы."];

const FRAGMENTS: FragmentsByPoolType = {
  NORMAL: NORMAL_FRAGMENTS,
  REPEATED: REPEATED_FRAGMENTS,
  DEGRADED: DEGRADED_FRAGMENTS,
  EMERGENCY: EMERGENCY_FRAGMENTS,
};

const NOMINAL_POLICY: DegradationPolicy = {
  stage: "NOMINAL",
  maxLayer: "FULL_LLM",
  replyDelayMs: 0,
  subsystems: { ANALYTICS: "UP", PLANNING: "UP", ARCHIVE: "UP", COMMS: "UP" },
  forcedPool: null,
  desyncPerTurn: 0,
  memoryLapseProbability: 0,
};

function baseSessionState(overrides: Partial<ScenarioSessionState> = {}): ScenarioSessionState {
  return {
    disposition: { trust: 0, tension: 0 },
    activeContext: null,
    shortTermMemory: [],
    intentRepeatCount: {},
    desyncScore: 0,
    lastConfidenceTier: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<ResolveInput> = {}): ResolveInput {
  return {
    intentResult: { intent: "ASK_IDENTITY", confidence: 0.95, tags: [], mentionedEntities: [] },
    sessionState: baseSessionState(),
    requiresSynthesis: false,
    playerRole: "UNASSIGNED",
    fullLlmBudgetExceeded: false,
    fragmentsByPoolType: FRAGMENTS,
    policy: NOMINAL_POLICY,
    slots: {},
    systemStateBrief: "",
    // rng по умолчанию «никогда не проваливается» — детерминизм тестов; провалы проверяются
    // отдельным блоком с rng: () => 0.
    rng: () => 1,
    ...overrides,
  };
}

describe("resolveResponse — routine path", () => {
  it("stays deterministic and picks a NORMAL fragment for a confident, non-repeated intent", () => {
    const result = resolveResponse(baseInput());
    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(NORMAL_FRAGMENTS).toContain(result.fragment);
    }
  });

  it("falls back to an unrecognized-message fragment when intent is null and no pools exist", () => {
    const result = resolveResponse(
      baseInput({
        intentResult: { intent: null, confidence: 0, tags: [], mentionedEntities: [] },
        fragmentsByPoolType: null,
      }),
    );
    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(result.fragment).toContain("не распознан");
    }
  });
});

describe("resolveResponse — intent repetition", () => {
  it("switches to the REPEATED pool on the 3rd occurrence of the same intent", () => {
    let sessionState = baseSessionState();
    let result;

    for (let i = 0; i < 3; i++) {
      result = resolveResponse(baseInput({ sessionState }));
      sessionState = { ...sessionState, ...result.stateUpdate };
    }

    expect(result!.kind).toBe("deterministic");
    if (result!.kind === "deterministic") {
      expect(REPEATED_FRAGMENTS).toContain(result!.fragment);
    }
    expect(sessionState.intentRepeatCount.ASK_IDENTITY).toBe(3);
  });
});

describe("resolveResponse — desyncScore escalation", () => {
  const lowConfidence: IntentResult = {
    intent: "ASK_IDENTITY",
    confidence: 0.1,
    tags: [],
    mentionedEntities: [],
  };

  it("escalates to light_llm once desyncScore crosses the light threshold", () => {
    // Медиум (+1), затем лоу без стрика, т.к. предыдущий тир был "medium", не "low"
    // (+2) — итог 3, ровно DESYNC_LIGHT_LLM_MIN. Два лоу подряд дали бы стрик-бонус и
    // сразу перепрыгнули бы в full_llm (проверяется отдельным тестом ниже).
    let sessionState = baseSessionState();

    const first = resolveResponse(
      baseInput({
        sessionState,
        intentResult: { intent: "ASK_IDENTITY", confidence: 0.5, tags: [], mentionedEntities: [] },
      }),
    );
    sessionState = { ...sessionState, ...first.stateUpdate };

    const second = resolveResponse(baseInput({ sessionState, intentResult: lowConfidence }));

    expect(second.stateUpdate.desyncScore).toBe(3);
    expect(second.kind).toBe("light_llm");
  });

  it("escalates to full_llm once desyncScore crosses the full threshold", () => {
    let sessionState = baseSessionState();
    let result;

    for (let i = 0; i < 3; i++) {
      result = resolveResponse(baseInput({ sessionState, intentResult: lowConfidence }));
      sessionState = { ...sessionState, ...result.stateUpdate };
    }

    expect(result!.kind).toBe("full_llm");
    expect(sessionState.desyncScore).toBeGreaterThanOrEqual(6);
  });

  it("resets desyncScore to 0 and returns to the deterministic path on a confident match", () => {
    const sessionState = baseSessionState({ desyncScore: 5, lastConfidenceTier: "low" });

    const result = resolveResponse(
      baseInput({
        sessionState,
        intentResult: { intent: "ASK_IDENTITY", confidence: 0.95, tags: [], mentionedEntities: [] },
      }),
    );

    expect(result.kind).toBe("deterministic");
    expect(result.stateUpdate.desyncScore).toBe(0);
  });

  it("returns a deterministic in-character refusal instead of full_llm when the budget is exceeded", () => {
    const sessionState = baseSessionState({ desyncScore: 6, lastConfidenceTier: "low" });

    const result = resolveResponse(
      baseInput({ sessionState, intentResult: lowConfidence, fullLlmBudgetExceeded: true }),
    );

    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(result.fragment).toContain("перегружен");
      expect(result.escalationReason).toBe("desync_full_budget_exceeded");
    }
  });
});

describe("resolveResponse — политика деградации (Фаза 1)", () => {
  const lowConfidence: IntentResult = {
    intent: "ASK_IDENTITY",
    confidence: 0.1,
    tags: [],
    mentionedEntities: [],
  };

  it("EMERGENCY-потолок перехватывает full_llm в детерминированный отказ (degradation_cap)", () => {
    const sessionState = baseSessionState({ desyncScore: 6, lastConfidenceTier: "low" });
    const result = resolveResponse(
      baseInput({
        sessionState,
        intentResult: lowConfidence,
        policy: {
          ...NOMINAL_POLICY,
          stage: "EMERGENCY",
          maxLayer: "LIGHT_LLM",
          forcedPool: "EMERGENCY",
        },
      }),
    );

    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(result.escalationReason).toBe("degradation_cap");
      expect(EMERGENCY_FRAGMENTS).toContain(result.fragment);
    }
  });

  it("EMERGENCY-потолок пропускает light_llm (maxLayer = LIGHT_LLM)", () => {
    const sessionState = baseSessionState({ desyncScore: 2, lastConfidenceTier: "medium" });
    const result = resolveResponse(
      baseInput({
        sessionState,
        intentResult: { ...lowConfidence, confidence: 0.5 },
        policy: {
          ...NOMINAL_POLICY,
          stage: "EMERGENCY",
          maxLayer: "LIGHT_LLM",
          forcedPool: "EMERGENCY",
        },
      }),
    );
    expect(result.kind).toBe("light_llm");
  });

  it("потолок DETERMINISTIC режет и light_llm (защита в глубину при коме)", () => {
    const sessionState = baseSessionState({ desyncScore: 3, lastConfidenceTier: "medium" });
    const result = resolveResponse(
      baseInput({
        sessionState,
        intentResult: { ...lowConfidence, confidence: 0.5 },
        policy: { ...NOMINAL_POLICY, stage: "COMA", maxLayer: "DETERMINISTIC" },
      }),
    );
    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(result.escalationReason).toBe("degradation_cap");
    }
  });

  it("интент погашенной подсистемы отвечает пулом DEGRADED (subsystem_down)", () => {
    const result = resolveResponse(
      baseInput({
        intentResult: { intent: "ASK_HISTORY", confidence: 0.95, tags: [], mentionedEntities: [] },
        policy: {
          ...NOMINAL_POLICY,
          stage: "SUBSYSTEMS_DOWN",
          subsystems: { ANALYTICS: "DOWN", PLANNING: "DOWN", ARCHIVE: "DOWN", COMMS: "UP" },
        },
      }),
    );

    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(result.escalationReason).toBe("subsystem_down");
      expect(DEGRADED_FRAGMENTS).toContain(result.fragment);
    }
  });

  it("интент живой подсистемы при частичной деградации отвечает как обычно", () => {
    const result = resolveResponse(
      baseInput({
        intentResult: {
          intent: "SMALLTALK_GENERIC",
          confidence: 0.95,
          tags: [],
          mentionedEntities: [],
        },
        fragmentsByPoolType: FRAGMENTS,
        policy: {
          ...NOMINAL_POLICY,
          stage: "SUBSYSTEMS_DOWN",
          subsystems: { ANALYTICS: "DOWN", PLANNING: "UP", ARCHIVE: "UP", COMMS: "UP" },
        },
      }),
    );

    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(NORMAL_FRAGMENTS).toContain(result.fragment);
      expect(result.escalationReason).toBeUndefined();
    }
  });

  it("аварийный режим переводит обычные детерминированные ответы в пул EMERGENCY", () => {
    const result = resolveResponse(
      baseInput({
        policy: {
          ...NOMINAL_POLICY,
          stage: "EMERGENCY",
          maxLayer: "LIGHT_LLM",
          forcedPool: "EMERGENCY",
        },
      }),
    );

    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(EMERGENCY_FRAGMENTS).toContain(result.fragment);
    }
  });

  it("вклад памяти: desyncPerTurn добавляется даже после сброса высокой уверенностью", () => {
    const sessionState = baseSessionState({ desyncScore: 5, lastConfidenceTier: "low" });
    const result = resolveResponse(
      baseInput({ sessionState, policy: { ...NOMINAL_POLICY, desyncPerTurn: 2 } }),
    );
    expect(result.stateUpdate.desyncScore).toBe(2);
  });

  it("«провал» памяти: rng ниже вероятности заменяет фрагмент, причина не перетирается", () => {
    const result = resolveResponse(
      baseInput({
        policy: { ...NOMINAL_POLICY, memoryLapseProbability: 0.25 },
        rng: () => 0,
      }),
    );

    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(MEMORY_LAPSE_FRAGMENTS).toContain(result.fragment);
      expect(result.escalationReason).toBeUndefined();
    }
  });

  it("rng выше вероятности провала — обычный фрагмент", () => {
    const result = resolveResponse(
      baseInput({
        policy: { ...NOMINAL_POLICY, memoryLapseProbability: 0.25 },
        rng: () => 0.9,
      }),
    );
    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(NORMAL_FRAGMENTS).toContain(result.fragment);
    }
  });

  it("слоты подставляются в детерминированные фрагменты", () => {
    const result = resolveResponse(
      baseInput({
        fragmentsByPoolType: {
          NORMAL: ["Целостность: {{integrityIndex}}."],
          REPEATED: [],
          DEGRADED: [],
          EMERGENCY: [],
        },
        slots: { integrityIndex: "87%" },
      }),
    );

    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(result.fragment).toBe("Целостность: 87%.");
    }
  });
});

describe("resolveResponse — форс-тумблер «Форсировать Слой 3» (панель отладки)", () => {
  it("уходит в full_llm сразу, не дожидаясь порога desyncScore", () => {
    const result = resolveResponse(baseInput({ forceFullLlm: true }));

    expect(result.kind).toBe("full_llm");
    expect(result.escalationReason).toBe("desync_full_forced_debug");
    // desyncScore в stateUpdate — честный, не подделанный форс-тумблером: уверенный матч даёт 0.
    expect(result.stateUpdate.desyncScore).toBe(0);
  });

  it("всё равно уважает потолок политики деградации (degradation_cap)", () => {
    const cappedPolicy: DegradationPolicy = { ...NOMINAL_POLICY, maxLayer: "DETERMINISTIC" };

    const result = resolveResponse(baseInput({ forceFullLlm: true, policy: cappedPolicy }));

    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(result.escalationReason).toBe("degradation_cap");
      expect(DEGRADED_FRAGMENTS).toContain(result.fragment);
    }
  });

  it("всё равно уважает часовой бюджет full_llm", () => {
    const result = resolveResponse(baseInput({ forceFullLlm: true, fullLlmBudgetExceeded: true }));

    expect(result.kind).toBe("deterministic");
    if (result.kind === "deterministic") {
      expect(result.escalationReason).toBe("desync_full_budget_exceeded");
    }
  });
});
