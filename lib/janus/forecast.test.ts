import { describe, expect, it } from "vitest";
import {
  computeCoreForecast,
  expectedDaysToFailure,
  marginalDaysPerShare,
  mulberry32,
  simulateCoreFailureDays,
} from "./forecast";

// Контрольные значения из концепта смертности (раздел 4.2, λ = 1/60 сут⁻¹): аналитика и
// Монте-Карло по 200 000 прогонов там совпали до десятых — здесь проверяем, что реализация
// сходится с теми же числами (ТЗ 1.4: допуск ±0.5 для E[T]).
const LAMBDA = 1 / 60;

describe("expectedDaysToFailure", () => {
  it("сходится с контрольными значениями концепта (допуск ±0.5 сут)", () => {
    expect(Math.abs(expectedDaysToFailure(15, 5, LAMBDA) - 74.1)).toBeLessThan(0.5);
    expect(Math.abs(expectedDaysToFailure(30, 5, LAMBDA) - 114.7)).toBeLessThan(0.5);
    expect(Math.abs(expectedDaysToFailure(30, 10, LAMBDA) - 70.0)).toBeLessThan(0.5);
    expect(Math.abs(expectedDaysToFailure(60, 10, LAMBDA) - 111.1)).toBeLessThan(0.5);
  });

  it("n < k означает, что порог уже пройден — времени не осталось", () => {
    expect(expectedDaysToFailure(4, 5, LAMBDA)).toBe(0);
  });

  it("n = k: жизнь до первой же смерти доли, E = 1/(λ·k)", () => {
    expect(expectedDaysToFailure(5, 5, LAMBDA)).toBeCloseTo(60 / 5, 5);
  });
});

describe("marginalDaysPerShare", () => {
  it("ΔE = 1/(λ·(n+1)): контрольные значения концепта (раздел 4.3)", () => {
    expect(marginalDaysPerShare(15, LAMBDA)).toBeCloseTo(3.75, 2);
    expect(marginalDaysPerShare(30, LAMBDA)).toBeCloseTo(1.94, 2);
    expect(marginalDaysPerShare(60, LAMBDA)).toBeCloseTo(0.98, 2);
  });
});

describe("mulberry32", () => {
  it("детерминирован: один seed — одна последовательность", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i += 1) expect(a()).toBe(b());
  });

  it("разные seed дают разные последовательности", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("значения в [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const u = rng();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });
});

describe("simulateCoreFailureDays", () => {
  it("одиночный сегмент 15/5: медиана ≈71.4, п10 ≈46.0 (допуск ±1.0 при 20k прогонов)", () => {
    const { medianDays, p10Days } = simulateCoreFailureDays([{ n: 15, k: 5 }], LAMBDA);
    expect(Math.abs(medianDays - 71.4)).toBeLessThan(1.0);
    expect(Math.abs(p10Days - 46.0)).toBeLessThan(1.0);
  });

  it("минимум по нескольким сегментам умирает раньше одиночного (концепт 4.5)", () => {
    const single = simulateCoreFailureDays([{ n: 30, k: 5 }], LAMBDA);
    const core = simulateCoreFailureDays(
      Array.from({ length: 10 }, () => ({ n: 30, k: 5 })),
      LAMBDA,
    );
    expect(core.medianDays).toBeLessThan(single.medianDays);
  });

  it("воспроизводим: одинаковый seed — одинаковый результат", () => {
    const a = simulateCoreFailureDays([{ n: 15, k: 5 }], LAMBDA, { seed: 123 });
    const b = simulateCoreFailureDays([{ n: 15, k: 5 }], LAMBDA, { seed: 123 });
    expect(a).toEqual(b);
  });
});

describe("computeCoreForecast", () => {
  const now = new Date("2026-07-14T12:00:00Z");

  it("живое ядро: обе даты в будущем, п10 раньше медианы", () => {
    const forecast = computeCoreForecast([{ status: "ALIVE", sharesAlive: 30, k: 5 }], LAMBDA, now);
    expect(forecast.coreDead).toBe(false);
    expect(forecast.deathAt!.getTime()).toBeGreaterThan(now.getTime());
    expect(forecast.p10At!.getTime()).toBeGreaterThan(now.getTime());
    expect(forecast.p10At!.getTime()).toBeLessThan(forecast.deathAt!.getTime());
  });

  it("мёртвый CORE-сегмент = отказ ядра: дат нет, coreDead", () => {
    const forecast = computeCoreForecast(
      [
        { status: "DEAD", sharesAlive: 0, k: 5 },
        { status: "ALIVE", sharesAlive: 30, k: 5 },
      ],
      LAMBDA,
      now,
    );
    expect(forecast).toEqual({ deathAt: null, p10At: null, coreDead: true });
  });

  it("живой сегмент ниже порога k — тоже отказ ядра", () => {
    const forecast = computeCoreForecast([{ status: "ALIVE", sharesAlive: 4, k: 5 }], LAMBDA, now);
    expect(forecast.coreDead).toBe(true);
  });

  it("пустой реестр CORE: прогноза нет, но ядро живо", () => {
    expect(computeCoreForecast([], LAMBDA, now)).toEqual({
      deathAt: null,
      p10At: null,
      coreDead: false,
    });
  });
});
