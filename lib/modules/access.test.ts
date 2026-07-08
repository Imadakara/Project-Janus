import { describe, expect, it } from "vitest";
import { hasModuleAccess } from "./access";

describe("hasModuleAccess", () => {
  it("returns true when the required module is unlocked", () => {
    expect(hasModuleAccess(["FILE_MANAGER", "TEXT_VIEWER"], "TEXT_VIEWER")).toBe(true);
  });

  it("returns false when the required module is not unlocked", () => {
    expect(hasModuleAccess(["FILE_MANAGER", "TEXT_VIEWER"], "MAP_VIEWER")).toBe(false);
  });

  it("returns false for an empty unlock list", () => {
    expect(hasModuleAccess([], "TEXT_VIEWER")).toBe(false);
  });
});
