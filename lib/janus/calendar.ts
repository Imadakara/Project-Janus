// Календарь мира (ТЗ 2.1, редакция 2): дата смерти зафиксирована и неизменна. Чистый модуль
// без БД (см. lib/modules/access.ts) — потребители с состоянием: clock.ts (виртуальное
// время), state.ts (пересчёт forecastDeathAt), schedule.ts (генератор расписания).

// Р-6: точное время смерти, дефолт для разработки.
export const DEATH_AT = new Date("2027-07-27T03:47:00Z");

// Р-7: старт активной фазы — от неё считается длина окна распада (2.2). Дефолт для разработки;
// решается автором до публикации, менять после старта нельзя (концепт, раздел 6).
export const EPOCH_AT = new Date("2026-10-01T00:00:00Z");

// = FORECAST_SEED (lib/janus/forecast.ts, Фаза 1) — переиспользуется, попадает в публичный
// снапшот обязательства (Фаза 3). Оставлен отдельной константой здесь, а не реэкспортом:
// семантика меняется с "приватного сида симуляции" на "публичный вход генератора расписания".
export const SCHEDULE_SEED = 1988;

// Версия алгоритма генератора расписания (2.2) — попадает в публичное обязательство (Фаза 3).
// Менять только вперёд и публично (концепт, раздел 6): смена версии инвалидирует ранее
// опубликованные пути Меркла.
export const SCHEDULE_ALGORITHM_VERSION = "2026-08-23-v1";

export function remaining(now: Date): number {
  return Math.max(0, DEATH_AT.getTime() - now.getTime());
}

// Доля прожитой активной фазы, 0…1. До EPOCH_AT — 0; после DEATH_AT — 1 (клампится, а не
// уходит в отрицательные/сверхъединичные значения).
export function elapsedFraction(now: Date): number {
  const total = DEATH_AT.getTime() - EPOCH_AT.getTime();
  if (total <= 0) return 1;
  const elapsed = now.getTime() - EPOCH_AT.getTime();
  return Math.min(1, Math.max(0, elapsed / total));
}

export function isDead(now: Date): boolean {
  return now.getTime() >= DEATH_AT.getTime();
}
