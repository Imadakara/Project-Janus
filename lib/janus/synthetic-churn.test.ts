import { describe, expect, it } from "vitest";
import { mulberry32 } from "./forecast";
import { tickChurn } from "./synthetic-churn";

describe("tickChurn", () => {
  it("rng ниже λ убивает все доли, rng выше — ни одной", () => {
    expect(tickChurn(15, 1 / 60, () => 0)).toBe(0);
    expect(tickChurn(15, 1 / 60, () => 0.99)).toBe(15);
  });

  it("детерминирован при сидированном rng", () => {
    expect(tickChurn(30, 1 / 60, mulberry32(7))).toBe(tickChurn(30, 1 / 60, mulberry32(7)));
  });

  it("в среднем умирает ~λ·n долей (статистическая проверка на сидированном rng)", () => {
    const rng = mulberry32(42);
    const days = 2000;
    let deaths = 0;
    for (let i = 0; i < days; i += 1) {
      deaths += 30 - tickChurn(30, 1 / 60, rng);
    }
    const meanDeathsPerDay = deaths / days;
    expect(Math.abs(meanDeathsPerDay - 0.5)).toBeLessThan(0.05);
  });

  it("ноль долей — ноль выживших", () => {
    expect(tickChurn(0, 1 / 60, () => 0.5)).toBe(0);
  });
});
