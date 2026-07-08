import { describe, expect, it } from "vitest";
import { assignRandomRole, ROLE_LABELS } from "./role";

const ASSIGNABLE_ROLES = ["ARCHIVIST", "TECHNICIAN", "SECURITY_OFFICER"];

describe("assignRandomRole", () => {
  it("always returns one of the three MVP roles", () => {
    for (let i = 0; i < 50; i++) {
      expect(ASSIGNABLE_ROLES).toContain(assignRandomRole());
    }
  });

  it("has a human-readable label for every assignable role", () => {
    for (const role of ASSIGNABLE_ROLES) {
      expect(ROLE_LABELS[role as keyof typeof ROLE_LABELS]).toBeTruthy();
    }
  });
});
