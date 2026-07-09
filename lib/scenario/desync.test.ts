import { describe, expect, it } from "vitest";
import { calculateDesyncScore, confidenceTier } from "./desync";
import type { IntentResult } from "@/lib/intent/schema";

function intentResult(overrides: Partial<IntentResult> = {}): IntentResult {
  return {
    intent: "ASK_IDENTITY",
    confidence: 0.5,
    tags: [],
    mentionedEntities: [],
    ...overrides,
  };
}

describe("confidenceTier", () => {
  it("classifies confidence into high/medium/low tiers", () => {
    expect(confidenceTier(0.9)).toBe("high");
    expect(confidenceTier(0.6)).toBe("high");
    expect(confidenceTier(0.5)).toBe("medium");
    expect(confidenceTier(0.35)).toBe("medium");
    expect(confidenceTier(0.1)).toBe("low");
  });
});

describe("calculateDesyncScore", () => {
  it("resets to 0 on a confident (high-tier) match, regardless of prior score", () => {
    const result = calculateDesyncScore(
      { desyncScore: 5, lastConfidenceTier: "low" },
      intentResult({ confidence: 0.95 }),
      false,
    );
    expect(result).toEqual({ desyncScore: 0, lastConfidenceTier: "high" });
  });

  it("adds +1 for a medium-confidence result", () => {
    const result = calculateDesyncScore(
      { desyncScore: 0, lastConfidenceTier: null },
      intentResult({ confidence: 0.5 }),
      false,
    );
    expect(result).toEqual({ desyncScore: 1, lastConfidenceTier: "medium" });
  });

  it("adds +2 for a first low-confidence result (no streak yet)", () => {
    const result = calculateDesyncScore(
      { desyncScore: 0, lastConfidenceTier: null },
      intentResult({ confidence: 0.1 }),
      false,
    );
    expect(result).toEqual({ desyncScore: 2, lastConfidenceTier: "low" });
  });

  it("adds +4 (streak bonus) for a second consecutive low-confidence result", () => {
    const result = calculateDesyncScore(
      { desyncScore: 2, lastConfidenceTier: "low" },
      intentResult({ confidence: 0.1 }),
      false,
    );
    expect(result).toEqual({ desyncScore: 6, lastConfidenceTier: "low" });
  });

  it("does not apply the streak bonus when the previous tier was medium, not low", () => {
    const result = calculateDesyncScore(
      { desyncScore: 1, lastConfidenceTier: "medium" },
      intentResult({ confidence: 0.1 }),
      false,
    );
    expect(result).toEqual({ desyncScore: 3, lastConfidenceTier: "low" });
  });

  it("adds +2 for a dissatisfaction (negation) tag", () => {
    const result = calculateDesyncScore(
      { desyncScore: 0, lastConfidenceTier: null },
      intentResult({ confidence: 0.5, tags: ["negation"] }),
      false,
    );
    expect(result.desyncScore).toBe(3); // +1 medium, +2 negation
  });

  it("adds +3 for requiresSynthesis, bypassing the streak logic", () => {
    const result = calculateDesyncScore(
      { desyncScore: 0, lastConfidenceTier: "medium" },
      intentResult({ confidence: 0.5 }),
      true,
    );
    expect(result.desyncScore).toBe(4); // +1 medium, +3 synthesis
  });
});
