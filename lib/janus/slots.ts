// Слоты для {{slotName}}-подстановки в детерминированных репликах (lib/scenario/fragments.ts):
// живые числа из JanusState вместо статичного текста (ТЗ 1.7 — механизм слотов существовал,
// но нигде не вызывался; включается здесь). Чистый модуль без БД.

import type { Role } from "@/app/generated/prisma/client";
import { ROLE_LABELS } from "@/lib/auth/role";
import { prisma } from "@/lib/db";
import { DEATH_AT, remaining } from "./calendar";
import { getSalvageState } from "./salvage";
import type { JanusStateSnapshot } from "./state";

const DAY_MS = 24 * 60 * 60 * 1000;
// «2-3 сегмента» по ТЗ 2.9 — верхняя граница диапазона.
const TOP_PRIORITY_COUNT = 3;

// Фиксированный форматтер ДД.ММ.ГГГГ ЧЧ:ММ (UTC) — не toLocaleString: вывод не должен
// зависеть от локали/таймзоны среды исполнения (важно для тестов и воспроизводимости).
export function formatTerminalDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

export function buildChatSlots(
  state: JanusStateSnapshot,
  playerRole: Role,
  now: Date,
): Record<string, string> {
  return {
    forecastDeathAt: state.forecastDeathAt
      ? formatTerminalDate(state.forecastDeathAt)
      : "НЕ ОПРЕДЕЛЁН",
    integrityIndex: `${Math.round(state.integrityIndex * 100)}%`,
    playerRole: ROLE_LABELS[playerRole],
    // Фаза 2 (2.10): {{deathAt}} — константа календаря (lib/janus/calendar.ts), не гаснет
    // вместе с forecastDeathAt при отказе ядра (см. state.ts::recomputeDerivedStateTx).
    deathAt: formatTerminalDate(DEATH_AT),
    remainingDays: String(Math.ceil(remaining(now) / DAY_MS)),
  };
}

// Слоты, требующие обращения к БД (2.9 — приоритеты, 2.10 — доля спасённого/последняя
// утрата) — отдельно от чистого buildChatSlots по конвенции проекта (см. brief.ts:
// formatSystemStateBrief/loadSystemStateBrief).
export async function loadDynamicSlots(): Promise<Record<string, string>> {
  const [salvage, lastLoss, priorityCandidates] = await Promise.all([
    getSalvageState(),
    prisma.lossLedgerEntry.findFirst({ orderBy: { id: "desc" } }),
    prisma.memorySegment.findMany({
      where: { salvagedAt: null, status: { not: "DEAD" } },
      include: { decayEvent: true },
    }),
  ]);

  const topPriorityTitles = [...priorityCandidates]
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const aDieAt = a.decayEvent?.dieAt.getTime() ?? Infinity;
      const bDieAt = b.decayEvent?.dieAt.getTime() ?? Infinity;
      return aDieAt - bDieAt;
    })
    .slice(0, TOP_PRIORITY_COUNT)
    .map((segment) => segment.title);

  return {
    salvagedPercent: `${Math.round(salvage.percent * 100)}%`,
    lastLossTitle: lastLoss?.title ?? "ПОТЕРЬ ПОКА НЕ БЫЛО",
    topPriorityTitles:
      topPriorityTitles.length > 0 ? topPriorityTitles.join(", ") : "ВСЁ ВАЖНОЕ УЖЕ ВЫНЕСЕНО",
  };
}
