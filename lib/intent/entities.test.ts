import { describe, expect, it } from "vitest";
import { resolveMentionedEntities } from "./entities";

describe("resolveMentionedEntities", () => {
  it("finds a directly mentioned entity", () => {
    expect(resolveMentionedEntities("Расскажи про архив.", [])).toContain("АРХИВ");
  });

  it("resolves a pronoun to the last mentioned entity in short-term memory", () => {
    const memory = [{ entity: "АРХИВ", mentionedAt: new Date().toISOString() }];
    expect(resolveMentionedEntities("Она повреждена?", memory)).toContain("АРХИВ");
  });

  it("returns nothing when there's no entity and no usable pronoun context", () => {
    expect(resolveMentionedEntities("Привет.", [])).toEqual([]);
  });
});
