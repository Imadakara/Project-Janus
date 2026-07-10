import { describe, expect, it } from "vitest";
import { resolveResponse, type ResolveInput } from "./resolve";
import type { IntentResult } from "@/lib/intent/schema";
import type { ScenarioSessionState } from "./types";
import type { FragmentsByPoolType } from "./repository";

const NORMAL_FRAGMENTS = ["Нормальный ответ вариант А.", "Нормальный ответ вариант Б."];
const REPEATED_FRAGMENTS = ["Повторный ответ: вопрос уже задавался."];

const FRAGMENTS: FragmentsByPoolType = { NORMAL: NORMAL_FRAGMENTS, REPEATED: REPEATED_FRAGMENTS };

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
