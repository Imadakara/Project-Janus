import { describe, expect, it } from "vitest";
import { computeIntegrityIndex } from "./integrity";

describe("computeIntegrityIndex", () => {
  it("пустой реестр = 1.0 (нечему деградировать)", () => {
    expect(computeIntegrityIndex([])).toBe(1.0);
  });

  it("все живы = 1.0, все мертвы = 0.0", () => {
    const segments = [
      { status: "ALIVE", tier: "CORE" },
      { status: "ALIVE", tier: "PERIPHERAL" },
    ] as const;
    expect(computeIntegrityIndex([...segments])).toBe(1.0);
    expect(
      computeIntegrityIndex([
        { status: "DEAD", tier: "CORE" },
        { status: "DEAD", tier: "PERIPHERAL" },
      ]),
    ).toBe(0.0);
  });

  it("CORE весит вдвое: смерть ядра бьёт по индексу сильнее периферии", () => {
    const coreDead = computeIntegrityIndex([
      { status: "DEAD", tier: "CORE" },
      { status: "ALIVE", tier: "PERIPHERAL" },
    ]);
    const peripheralDead = computeIntegrityIndex([
      { status: "ALIVE", tier: "CORE" },
      { status: "DEAD", tier: "PERIPHERAL" },
    ]);
    expect(coreDead).toBeCloseTo(1 / 3, 5);
    expect(peripheralDead).toBeCloseTo(2 / 3, 5);
    expect(coreDead).toBeLessThan(peripheralDead);
  });

  it("DEGRADED даёт половину веса", () => {
    expect(
      computeIntegrityIndex([
        { status: "DEGRADED", tier: "PERIPHERAL" },
        { status: "ALIVE", tier: "PERIPHERAL" },
      ]),
    ).toBeCloseTo(0.75, 5);
  });
});
