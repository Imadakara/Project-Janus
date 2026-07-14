// Слоты для {{slotName}}-подстановки в детерминированных репликах (lib/scenario/fragments.ts):
// живые числа из JanusState вместо статичного текста (ТЗ 1.7 — механизм слотов существовал,
// но нигде не вызывался; включается здесь). Чистый модуль без БД.

import type { Role } from "@/app/generated/prisma/client";
import { ROLE_LABELS } from "@/lib/auth/role";
import type { JanusStateSnapshot } from "./state";

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
): Record<string, string> {
  return {
    forecastDeathAt: state.forecastDeathAt
      ? formatTerminalDate(state.forecastDeathAt)
      : "НЕ ОПРЕДЕЛЁН",
    integrityIndex: `${Math.round(state.integrityIndex * 100)}%`,
    playerRole: ROLE_LABELS[playerRole],
  };
}
