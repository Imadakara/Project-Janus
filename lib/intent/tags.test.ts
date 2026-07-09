import { describe, expect, it } from "vitest";
import { extractTags } from "./tags";

describe("extractTags", () => {
  it("detects interrogation from a question mark", () => {
    expect(extractTags("Кто ты?")).toContain("interrogation");
  });

  it("detects negation/dissatisfaction markers", () => {
    expect(extractTags("Я не про это спрашивал")).toContain("negation");
  });

  it("detects rudeness markers", () => {
    expect(extractTags("Ты тупая железка")).toContain("rude");
  });

  it("detects politeness markers", () => {
    expect(extractTags("Спасибо за ответ")).toContain("polite");
  });

  it("returns no tags for a neutral statement", () => {
    expect(extractTags("Понятно.")).toEqual([]);
  });
});
