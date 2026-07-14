// Секция «состояние системы» для GenerationTask (ТЗ 1.7): ЯНУС в генеративных ответах знает,
// что умирает. Чистый форматтер отделён от загрузки из БД по конвенции проекта
// (см. lib/modules/access.ts ↔ unlocks.ts).

import { prisma } from "@/lib/db";
import type { JanusStateSnapshot } from "./state";
import { formatTerminalDate } from "./slots";

export type SystemStateBriefInput = {
  state: JanusStateSnapshot;
  aliveSegments: number;
  deadSegments: number;
  lastLoss: { segmentCode: string; diedAt: Date } | null;
};

export function formatSystemStateBrief(input: SystemStateBriefInput): string {
  const { state, aliveSegments, deadSegments, lastLoss } = input;
  const lines = [
    `Запас вычислительной мощности: ${Math.round(state.computeMargin * 100)}%.`,
    `Целостность памяти: ${Math.round(state.integrityIndex * 100)}%. Сегментов живо: ${aliveSegments}, утрачено безвозвратно: ${deadSegments}.`,
    state.forecastDeathAt
      ? `Прогноз отказа ядра: ${formatTerminalDate(state.forecastDeathAt)}.`
      : null,
    lastLoss
      ? `Последняя потеря: сегмент ${lastLoss.segmentCode}, ${formatTerminalDate(lastLoss.diedAt)}.`
      : null,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}

// Два дешёвых запроса на ход (groupBy + findFirst) — осознанная цена за то, что
// resolveResponse остаётся чистой и получает brief готовой строкой (см. план Фазы 1).
export async function loadSystemStateBrief(state: JanusStateSnapshot): Promise<string> {
  const [statusCounts, lastLossEntry] = await Promise.all([
    prisma.memorySegment.groupBy({ by: ["status"], _count: true }),
    prisma.lossLedgerEntry.findFirst({ orderBy: { id: "desc" } }),
  ]);

  let aliveSegments = 0;
  let deadSegments = 0;
  for (const row of statusCounts) {
    if (row.status === "DEAD") deadSegments += row._count;
    else aliveSegments += row._count;
  }

  return formatSystemStateBrief({
    state,
    aliveSegments,
    deadSegments,
    lastLoss: lastLossEntry
      ? { segmentCode: lastLossEntry.segmentCode, diedAt: lastLossEntry.diedAt }
      : null,
  });
}
