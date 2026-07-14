import { describe, expect, it } from "vitest";
import { REPLY_DELAY_MAX_MS, resolveDegradationPolicy, type DegradationStage } from "./degradation";
import type { JanusStateSnapshot } from "./state";
import { resolveSubsystemStatuses, subsystemForIntent } from "./subsystems";

function snapshot(overrides: Partial<JanusStateSnapshot> = {}): JanusStateSnapshot {
  return {
    computeMargin: 1.0,
    integrityIndex: 1.0,
    subsystems: { ANALYTICS: "UP", PLANNING: "UP", ARCHIVE: "UP", COMMS: "UP" },
    forecastDeathAt: null,
    forecastP10At: null,
    lambdaEstimate: 1 / 60,
    updatedAt: new Date("2026-07-14T12:00:00Z"),
    ...overrides,
  };
}

describe("resolveDegradationPolicy: стадии по таблице концепта (раздел 5)", () => {
  const cases: Array<[number, DegradationStage]> = [
    [1.2, "NOMINAL"],
    [1.0, "NOMINAL"],
    [0.99, "QUEUED"],
    [0.7, "QUEUED"],
    [0.69, "SUBSYSTEMS_DOWN"],
    [0.4, "SUBSYSTEMS_DOWN"],
    [0.39, "EMERGENCY"],
    [0.2, "EMERGENCY"],
    [0.19, "COMA"],
    [0, "COMA"],
  ];

  it.each(cases)("M=%f → %s", (computeMargin, stage) => {
    expect(resolveDegradationPolicy(snapshot({ computeMargin })).stage).toBe(stage);
  });

  it("потолок слоя: EMERGENCY режет full_llm, кома — всё генеративное", () => {
    expect(resolveDegradationPolicy(snapshot({ computeMargin: 1.0 })).maxLayer).toBe("FULL_LLM");
    expect(resolveDegradationPolicy(snapshot({ computeMargin: 0.3 })).maxLayer).toBe("LIGHT_LLM");
    expect(resolveDegradationPolicy(snapshot({ computeMargin: 0.1 })).maxLayer).toBe(
      "DETERMINISTIC",
    );
  });

  it("forcedPool EMERGENCY только на аварийной стадии", () => {
    expect(resolveDegradationPolicy(snapshot({ computeMargin: 0.3 })).forcedPool).toBe("EMERGENCY");
    expect(resolveDegradationPolicy(snapshot({ computeMargin: 0.5 })).forcedPool).toBeNull();
    expect(resolveDegradationPolicy(snapshot({ computeMargin: 0.1 })).forcedPool).toBeNull();
  });
});

describe("resolveDegradationPolicy: replyDelayMs", () => {
  it("монотонно не убывает с падением M", () => {
    const margins = [1.0, 0.9, 0.8, 0.7, 0.5, 0.3, 0.1];
    const delays = margins.map(
      (computeMargin) => resolveDegradationPolicy(snapshot({ computeMargin })).replyDelayMs,
    );
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
  });

  it("границы: 0 при номинале, максимум ниже полосы очередей", () => {
    expect(resolveDegradationPolicy(snapshot({ computeMargin: 1.0 })).replyDelayMs).toBe(0);
    expect(resolveDegradationPolicy(snapshot({ computeMargin: 0.5 })).replyDelayMs).toBe(
      REPLY_DELAY_MAX_MS,
    );
  });
});

describe("resolveDegradationPolicy: вклад памяти (integrityIndex)", () => {
  it("целостность ≥ 0.8 — речь чистая", () => {
    const policy = resolveDegradationPolicy(snapshot({ integrityIndex: 0.9 }));
    expect(policy.desyncPerTurn).toBe(0);
    expect(policy.memoryLapseProbability).toBe(0);
  });

  it("ниже 0.8 — спутанность +1, редкие провалы", () => {
    const policy = resolveDegradationPolicy(snapshot({ integrityIndex: 0.7 }));
    expect(policy.desyncPerTurn).toBe(1);
    expect(policy.memoryLapseProbability).toBeGreaterThan(0);
  });

  it("ниже 0.5 — спутанность +2, частые провалы", () => {
    const low = resolveDegradationPolicy(snapshot({ integrityIndex: 0.4 }));
    const mid = resolveDegradationPolicy(snapshot({ integrityIndex: 0.7 }));
    expect(low.desyncPerTurn).toBe(2);
    expect(low.memoryLapseProbability).toBeGreaterThan(mid.memoryLapseProbability);
  });
});

describe("resolveSubsystemStatuses: порядок гашения ANALYTICS → PLANNING → ARCHIVE → COMMS", () => {
  it("выше полосы 0.4–0.7 всё живо", () => {
    expect(resolveSubsystemStatuses(0.8)).toEqual({
      ANALYTICS: "UP",
      PLANNING: "UP",
      ARCHIVE: "UP",
      COMMS: "UP",
    });
  });

  it("гаснут по одному по мере падения M", () => {
    expect(resolveSubsystemStatuses(0.65).ANALYTICS).toBe("DOWN");
    expect(resolveSubsystemStatuses(0.65).PLANNING).toBe("UP");
    expect(resolveSubsystemStatuses(0.6).PLANNING).toBe("DOWN");
    expect(resolveSubsystemStatuses(0.6).ARCHIVE).toBe("UP");
    expect(resolveSubsystemStatuses(0.5).ARCHIVE).toBe("DOWN");
    expect(resolveSubsystemStatuses(0.5).COMMS).toBe("UP");
    expect(resolveSubsystemStatuses(0.45).COMMS).toBe("DOWN");
  });

  it("ниже 0.4 погашены все", () => {
    expect(Object.values(resolveSubsystemStatuses(0.3))).toEqual(["DOWN", "DOWN", "DOWN", "DOWN"]);
  });
});

describe("subsystemForIntent", () => {
  it("замэпленные интенты возвращают свою подсистему", () => {
    expect(subsystemForIntent("ASK_HISTORY")).toBe("ARCHIVE");
    expect(subsystemForIntent("SMALLTALK_GENERIC")).toBe("COMMS");
  });

  it("виталы, самоосознание и нераспознанное — вне подсистем", () => {
    expect(subsystemForIntent("ASK_IDENTITY")).toBeNull();
    expect(subsystemForIntent("ASK_VITALS")).toBeNull();
    expect(subsystemForIntent(null)).toBeNull();
  });
});
