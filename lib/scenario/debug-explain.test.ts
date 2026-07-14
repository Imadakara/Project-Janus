import { describe, expect, it } from "vitest";
import { explainTurn, formatTurnTag, isBlockedByToggle } from "./debug-explain";

describe("explainTurn", () => {
  it("explains a deterministic reply with a matched intent", () => {
    const text = explainTurn({
      handledByLayer: "DETERMINISTIC",
      matchedIntent: "ASK_IDENTITY",
      intentConfidence: 0.95,
      escalationReason: null,
      desyncScore: 0,
    });
    expect(text).toContain("ASK_IDENTITY");
    expect(text).toContain("0.95");
  });

  it("explains a deterministic fallback when no intent matched", () => {
    const text = explainTurn({
      handledByLayer: "DETERMINISTIC",
      matchedIntent: null,
      intentConfidence: 0,
      escalationReason: null,
      desyncScore: 1,
    });
    expect(text).toContain("не распознан");
  });

  it("explains a budget-exceeded refusal", () => {
    const text = explainTurn({
      handledByLayer: "DETERMINISTIC",
      matchedIntent: "ASK_IDENTITY",
      intentConfidence: 0.1,
      escalationReason: "desync_full_budget_exceeded",
      desyncScore: 8,
    });
    expect(text).toContain("FULL_LLM");
    expect(text).toContain("бюджет");
  });

  it("explains a light escalation", () => {
    const text = explainTurn({
      handledByLayer: "LIGHT_LLM",
      matchedIntent: "SMALLTALK_GENERIC",
      intentConfidence: 0.2,
      escalationReason: "desync_light",
      desyncScore: 3,
    });
    expect(text).toContain("light-режим");
  });

  it("explains a full escalation", () => {
    const text = explainTurn({
      handledByLayer: "FULL_LLM",
      matchedIntent: "ASK_IDENTITY",
      intentConfidence: 0.35,
      escalationReason: "desync_full",
      desyncScore: 8,
    });
    expect(text).toContain("full-режим");
    expect(text).toContain("RAG");
  });

  it("explains a light escalation blocked by the Use LLM toggle", () => {
    const text = explainTurn({
      handledByLayer: "DETERMINISTIC",
      matchedIntent: "SMALLTALK_GENERIC",
      intentConfidence: 0.2,
      escalationReason: "desync_light_blocked_toggle",
      desyncScore: 3,
    });
    expect(text).toContain("LIGHT_LLM");
    expect(text).toContain("Use LLM");
  });

  it("explains a full escalation blocked by the Use LLM toggle", () => {
    const text = explainTurn({
      handledByLayer: "DETERMINISTIC",
      matchedIntent: "ASK_IDENTITY",
      intentConfidence: 0.35,
      escalationReason: "desync_full_blocked_toggle",
      desyncScore: 8,
    });
    expect(text).toContain("FULL_LLM");
    expect(text).toContain("Use LLM");
  });

  it("falls back to a placeholder when desyncScore is unknown (historical message)", () => {
    const text = explainTurn({
      handledByLayer: "DETERMINISTIC",
      matchedIntent: "ASK_IDENTITY",
      intentConfidence: 0.9,
      escalationReason: null,
      desyncScore: null,
    });
    expect(text).toContain("н/д");
  });
});

describe("formatTurnTag", () => {
  it("renders a compact tag with all raw fields", () => {
    const tag = formatTurnTag({
      handledByLayer: "FULL_LLM",
      matchedIntent: "ASK_IDENTITY",
      intentConfidence: 0.35,
      escalationReason: "desync_full",
      desyncScore: 8,
      policyStage: "NOMINAL",
    });
    expect(tag).toBe(
      "LAYER=FULL_LLM intent=ASK_IDENTITY conf=0.35 desync=8 escalation=desync_full policy=NOMINAL",
    );
  });

  it("исторические ходы без стадии политики показывают прочерк", () => {
    const tag = formatTurnTag({
      handledByLayer: "DETERMINISTIC",
      matchedIntent: null,
      intentConfidence: null,
      escalationReason: null,
      desyncScore: null,
    });
    expect(tag).toContain("policy=—");
  });
});

describe("isBlockedByToggle", () => {
  it("identifies both blocked-toggle reasons", () => {
    expect(isBlockedByToggle("desync_light_blocked_toggle")).toBe(true);
    expect(isBlockedByToggle("desync_full_blocked_toggle")).toBe(true);
    expect(isBlockedByToggle("desync_full")).toBe(false);
    expect(isBlockedByToggle(null)).toBe(false);
  });
});
