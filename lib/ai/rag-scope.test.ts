import { describe, expect, it } from "vitest";
import { needsRagSearch } from "./rag-scope";

describe("needsRagSearch", () => {
  it("нераспознанный intent (null) — безопасный дефолт, RAG выполняется", () => {
    expect(needsRagSearch(null)).toBe(true);
  });

  it("intent про содержимое архива — RAG выполняется", () => {
    expect(needsRagSearch("ASK_HISTORY")).toBe(true);
    expect(needsRagSearch("REPORT_ARCHIVE_FOUND")).toBe(true);
  });

  it("intent про системное состояние/характер ЯНУСа — RAG пропускается", () => {
    expect(needsRagSearch("ASK_IDENTITY")).toBe(false);
    expect(needsRagSearch("ASK_CAPABILITIES")).toBe(false);
    expect(needsRagSearch("ASK_TRUST")).toBe(false);
    expect(needsRagSearch("SMALLTALK_GENERIC")).toBe(false);
    expect(needsRagSearch("ASK_VITALS")).toBe(false);
    expect(needsRagSearch("ASK_LOSSES")).toBe(false);
    expect(needsRagSearch("ASK_DEATH_DATE")).toBe(false);
    expect(needsRagSearch("ASK_PRIORITY")).toBe(false);
    expect(needsRagSearch("ASK_WHY_CONTACT")).toBe(false);
  });

  it("незнакомый (будущий) intent, не добавленный в deny-list — RAG выполняется", () => {
    expect(needsRagSearch("SOME_FUTURE_INTENT")).toBe(true);
  });
});
