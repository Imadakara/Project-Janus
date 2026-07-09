import { describe, expect, it } from "vitest";
import { nextRepeatCount, shouldUseRepeatedPool } from "./intent-repeat";

describe("nextRepeatCount", () => {
  it("increments the counter for the given intent, leaving others untouched", () => {
    const result = nextRepeatCount({ ASK_IDENTITY: 1, ASK_TRUST: 5 }, "ASK_IDENTITY");
    expect(result).toEqual({ ASK_IDENTITY: 2, ASK_TRUST: 5 });
  });

  it("starts a new intent's counter at 1", () => {
    const result = nextRepeatCount({}, "ASK_HISTORY");
    expect(result).toEqual({ ASK_HISTORY: 1 });
  });
});

describe("shouldUseRepeatedPool", () => {
  it("stays on the NORMAL pool below the repeat threshold", () => {
    expect(shouldUseRepeatedPool(1)).toBe(false);
    expect(shouldUseRepeatedPool(2)).toBe(false);
  });

  it("switches to the REPEATED pool at the threshold and beyond", () => {
    expect(shouldUseRepeatedPool(3)).toBe(true);
    expect(shouldUseRepeatedPool(4)).toBe(true);
  });
});
