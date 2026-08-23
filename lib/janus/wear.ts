// Износ вычислительных блоков объекта как функция времени (ТЗ 2.4). Заменяет ручной
// M-рычаг Фазы 1 как штатный источник computeMargin; рычаг дебаг-панели остаётся
// override'ом поверх (см. lib/janus/state.ts). Чистая функция от времени (calendar.ts) и
// сидированного PRNG (тот же mulberry32, что расписание/прогноз) — детерминирована,
// тестируется без БД.

import { mulberry32 } from "./forecast";
import { DEATH_AT, EPOCH_AT, SCHEDULE_SEED, elapsedFraction } from "./calendar";

// Базовая кривая (ТЗ 2.4): 1.00 в начале, плавно к ≈0.45 к 90% фазы, затем к ≈0.30 к
// последним суткам. Кома (M < 0.2) штатно не наступает — минимум базовой кривой 0.30
// заведомо выше порога комы политики деградации (M_EMERGENCY_MIN = 0.2, degradation.ts).
const PLATEAU_FRACTION = 0.9;
const BASE_START = 1.0;
const BASE_AT_PLATEAU = 0.45;
const BASE_AT_END = 0.3;

function baseMargin(fraction: number): number {
  if (fraction <= PLATEAU_FRACTION) {
    const t = fraction / PLATEAU_FRACTION;
    return BASE_START - (BASE_START - BASE_AT_PLATEAU) * t;
  }
  const t = (fraction - PLATEAU_FRACTION) / (1 - PLATEAU_FRACTION);
  return BASE_AT_PLATEAU - (BASE_AT_PLATEAU - BASE_AT_END) * t;
}

// «Сбои питания»: детерминированные просадки длительностью в часы, привязанные к суткам
// активной фазы (день = seed для rng этих суток — воспроизводимо, но не предсказуемо на
// глаз). DIP_MAGNITUDE — на сколько снижается M во время просадки; результат не может уйти
// ниже DIP_FLOOR, чтобы просадка сама по себе не имитировала комбинацию деградации.
const DIP_PROBABILITY_PER_DAY = 0.08;
const DIP_DURATION_HOURS = 3;
const DIP_MAGNITUDE = 0.12;
const DIP_FLOOR = 0.25;

function dayDip(now: Date): number {
  const dayIndex = Math.floor((now.getTime() - EPOCH_AT.getTime()) / 86_400_000);
  if (dayIndex < 0) return 0;
  const rng = mulberry32(SCHEDULE_SEED + dayIndex + 1);
  const occurs = rng() < DIP_PROBABILITY_PER_DAY;
  if (!occurs) return 0;

  const startHour = rng() * 24;
  const hourOfDay = ((now.getTime() - EPOCH_AT.getTime()) / 3_600_000) % 24;
  const withinDip = hourOfDay >= startHour && hourOfDay < startHour + DIP_DURATION_HOURS;
  return withinDip ? DIP_MAGNITUDE : 0;
}

export function computeMarginAt(now: Date): number {
  const fraction = elapsedFraction(now);
  const base = baseMargin(fraction);
  const dip = now.getTime() >= EPOCH_AT.getTime() && now.getTime() < DEATH_AT.getTime()
    ? dayDip(now)
    : 0;
  return Math.max(DIP_FLOOR, base - dip);
}
