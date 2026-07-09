import { describe, expect, it } from "vitest";
import { applyDispositionDelta } from "./disposition";

describe("applyDispositionDelta", () => {
  it("increases trust on politeness", () => {
    const result = applyDispositionDelta({ trust: 0, tension: 0 }, ["polite"]);
    expect(result).toEqual({ trust: 1, tension: 0 });
  });

  it("decreases trust and increases tension on rudeness", () => {
    const result = applyDispositionDelta({ trust: 0, tension: 0 }, ["rude"]);
    expect(result).toEqual({ trust: -1, tension: 2 });
  });

  it("stacks deltas from multiple tags", () => {
    const result = applyDispositionDelta({ trust: 0, tension: 0 }, ["polite", "negation"]);
    expect(result).toEqual({ trust: 1, tension: 1 });
  });

  it("ignores unknown tags and leaves disposition unchanged", () => {
    const result = applyDispositionDelta({ trust: 2, tension: 1 }, ["interrogation"]);
    expect(result).toEqual({ trust: 2, tension: 1 });
  });
});
