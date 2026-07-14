// Прогноз даты отказа ядра — процесс чистой гибели из концепта смертности (раздел 4.2):
// жизнь каждой доли ~ Exp(λ), сегмент умирает при падении живых долей ниже порога k.
// Ожидание считается аналитически, перцентили — Монте-Карло с СИДИРОВАННЫМ PRNG: прогноз
// обязан быть воспроизводим внешним скриптом по публичному снапшоту (Фаза 2), поэтому
// никакого Math.random здесь нет. Чистая математика без БД — по конвенции проекта
// (см. lib/modules/access.ts); потребитель с БД — lib/janus/state.ts.

// Seed и число прогонов — константы: попадают в публичный снапшот Фазы 2, менять только
// «вперёд и публично» (концепт, раздел 6).
export const FORECAST_SEED = 1988;
export const FORECAST_RUNS = 20_000;

// mulberry32 — минимальный детерминированный PRNG (32-бит state), выбран по ТЗ 1.4:
// собственная реализация вместо зависимости, воспроизводится в любом языке одной функцией.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// E[T] = (1/λ) · Σ_{j=k}^{n} 1/j — ожидаемое время (в сутках) до падения ниже k при n живых
// долях. n < k означает, что сегмент уже за порогом — времени не осталось.
export function expectedDaysToFailure(n: number, k: number, lambdaPerDay: number): number {
  if (n < k) return 0;
  let sum = 0;
  for (let j = k; j <= n; j += 1) sum += 1 / j;
  return sum / lambdaPerDay;
}

// ΔE = 1/(λ·(n+1)) — маржинальный вклад одной новой доли в ожидание жизни сегмента.
// Отдельная функция намеренно: квитанции вклада Фазы 2 используют её же (ТЗ 1.4).
export function marginalDaysPerShare(n: number, lambdaPerDay: number): number {
  return 1 / (lambdaPerDay * (n + 1));
}

export type SegmentSurvival = { n: number; k: number };

// Один прогон: время смерти сегмента = Σ Exp(j·λ) по j от n вниз до k (гипоэкспоненциальное
// распределение); прогноз ядра = минимум по всем CORE-сегментам (смерть любого = смерть
// ЯНУСа, концепт 4.5). Возвращает медиану и 10-й перцентиль в сутках.
export function simulateCoreFailureDays(
  segments: SegmentSurvival[],
  lambdaPerDay: number,
  opts: { runs?: number; seed?: number } = {},
): { medianDays: number; p10Days: number } {
  const runs = opts.runs ?? FORECAST_RUNS;
  const rng = mulberry32(opts.seed ?? FORECAST_SEED);

  const samples = new Array<number>(runs);
  for (let run = 0; run < runs; run += 1) {
    let minDays = Infinity;
    for (const segment of segments) {
      if (segment.n < segment.k) {
        minDays = 0;
        continue;
      }
      let days = 0;
      for (let j = segment.n; j >= segment.k; j -= 1) {
        // Exp(rate): u ∈ [0, 1) ⇒ 1-u ∈ (0, 1], логарифм определён.
        days += -Math.log(1 - rng()) / (j * lambdaPerDay);
      }
      if (days < minDays) minDays = days;
    }
    samples[run] = minDays;
  }

  samples.sort((a, b) => a - b);
  return {
    medianDays: samples[Math.floor(runs * 0.5)],
    p10Days: samples[Math.floor(runs * 0.1)],
  };
}

export type CoreForecastSegment = {
  status: "ALIVE" | "DEGRADED" | "DEAD";
  sharesAlive: number;
  k: number;
};

export type CoreForecast = {
  deathAt: Date | null;
  p10At: Date | null;
  coreDead: boolean;
};

// Прогноз по текущему реестру CORE-сегментов. Любой мёртвый (или упавший ниже k) CORE —
// отказ ядра уже состоялся: дат больше нет, флаг coreDead. Без CORE-сегментов прогноза нет
// (нечему умирать) — обе даты null, но ядро живо.
export function computeCoreForecast(
  coreSegments: CoreForecastSegment[],
  lambdaPerDay: number,
  now: Date,
): CoreForecast {
  const coreDead = coreSegments.some(
    (segment) => segment.status === "DEAD" || segment.sharesAlive < segment.k,
  );
  if (coreDead) return { deathAt: null, p10At: null, coreDead: true };
  if (coreSegments.length === 0) return { deathAt: null, p10At: null, coreDead: false };

  const { medianDays, p10Days } = simulateCoreFailureDays(
    coreSegments.map((segment) => ({ n: segment.sharesAlive, k: segment.k })),
    lambdaPerDay,
  );

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return {
    deathAt: new Date(now.getTime() + medianDays * MS_PER_DAY),
    p10At: new Date(now.getTime() + p10Days * MS_PER_DAY),
    coreDead: false,
  };
}
