// Генератор предопубликованного расписания распада (ТЗ 2.2). Чистая функция, детерминирована
// целиком входными данными — воспроизводима внешним скриптом по публичному снапшоту (Фаза 3),
// как и прогноз Фазы 1 (lib/janus/forecast.ts, тот же mulberry32). Алгоритм фиксируется
// навсегда и версионируется отдельно (calendar.ts::SCHEDULE_ALGORITHM_VERSION) — менять
// формулу без бампа версии запрещено (концепт, раздел 6).

import { mulberry32 } from "./forecast";

export type ScheduleSegmentInput = {
  code: string;
  tier: "CORE" | "PERIPHERAL";
  isImmortalUntilDeath?: boolean;
};

export type ScheduleEntry = { segmentCode: string; dieAt: Date };

function assignTierDates(
  segments: ScheduleSegmentInput[],
  epoch: Date,
  total: number,
  seed: number,
  curve: (u: number) => number,
): ScheduleEntry[] {
  const rng = mulberry32(seed);
  const sortedU = segments.map(() => rng()).sort((a, b) => a - b);
  return segments.map((segment, i) => ({
    segmentCode: segment.code,
    dieAt: new Date(epoch.getTime() + total * curve(sortedU[i])),
  }));
}

// Периферия: равномерно по всему окну. Ядро: начинает уходить примерно с 62% фазы, с
// ускорением к финалу (степень 1.6) — держит ядро живым дольше, чем периферию.
const PERIPHERAL_CURVE = (u: number) => u;
const CORE_CURVE = (u: number) => 0.62 + 0.36 * Math.pow(u, 1.6);

export function buildSchedule(opts: {
  segments: ScheduleSegmentInput[];
  epoch: Date;
  deathAt: Date;
  seed: number;
}): ScheduleEntry[] {
  const { epoch, deathAt, seed } = opts;
  const total = deathAt.getTime() - epoch.getTime();

  const peripheral = opts.segments.filter(
    (s) => s.tier === "PERIPHERAL" && !s.isImmortalUntilDeath,
  );
  const core = opts.segments.filter((s) => s.tier === "CORE" && !s.isImmortalUntilDeath);

  const entries = [
    ...assignTierDates(peripheral, epoch, total, seed, PERIPHERAL_CURVE),
    ...assignTierDates(core, epoch, total, seed, CORE_CURVE),
  ];

  entries.sort((a, b) => a.dieAt.getTime() - b.dieAt.getTime());
  return entries;
}

// Каноническая сериализация — по образцу lib/janus/ledger.ts::computeEntryHash: фиксированный
// порядок полей, а не сериализация объекта Prisma-строки как есть, чтобы повторный прогон
// скрипта давал побайтово одинаковый файл вне зависимости от порядка обхода БД.
export function serializeSchedule(entries: ScheduleEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.dieAt.getTime() - b.dieAt.getTime());
  const rows = sorted.map((e) => [e.segmentCode, e.dieAt.toISOString()]);
  return JSON.stringify(rows, null, 2) + "\n";
}
