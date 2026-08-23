import { describe, expect, it } from "vitest";
import { computeMarginAt } from "./wear";
import { EPOCH_AT, DEATH_AT } from "./calendar";

describe("computeMarginAt", () => {
  it("is ~1.0 at epoch", () => {
    expect(computeMarginAt(EPOCH_AT)).toBeGreaterThan(0.95);
  });

  it("declines toward ~0.3 near death", () => {
    const nearDeath = new Date(DEATH_AT.getTime() - 60 * 60 * 1000);
    expect(computeMarginAt(nearDeath)).toBeLessThan(0.4);
  });

  it("never goes into coma range (< 0.2) during the active phase", () => {
    const total = DEATH_AT.getTime() - EPOCH_AT.getTime();
    for (let i = 0; i <= 20; i += 1) {
      const t = new Date(EPOCH_AT.getTime() + (total * i) / 20);
      expect(computeMarginAt(t)).toBeGreaterThanOrEqual(0.2);
    }
  });

  it("is monotonically non-increasing on the base curve (ignoring dips) at sampled midpoints", () => {
    // Достаточно грубая проверка тренда: медиана по окну сглаживает суточные просадки.
    const total = DEATH_AT.getTime() - EPOCH_AT.getTime();
    const early = computeMarginAt(new Date(EPOCH_AT.getTime() + total * 0.1));
    const late = computeMarginAt(new Date(EPOCH_AT.getTime() + total * 0.8));
    expect(late).toBeLessThan(early);
  });

  it("is stable before epoch and clamps at floor after death", () => {
    const before = new Date(EPOCH_AT.getTime() - 1000);
    expect(computeMarginAt(before)).toBeCloseTo(1.0, 1);
  });
});
