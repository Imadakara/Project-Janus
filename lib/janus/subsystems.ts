// Подсистемы ЯНУСа и порядок их гашения при падении запаса мощности M (концепт смертности,
// раздел 5: полоса M 0.4–0.7 — «модули гаснут по опубликованному порядку»). Порядок и пороги —
// публичная политика: менять только «вперёд и публично» (концепт, раздел 6).
// Чистый модуль без БД: потребители — lib/janus/degradation.ts (политика хода),
// lib/janus/state.ts (персистенция статусов для PULS).

export type SubsystemKey = "ANALYTICS" | "PLANNING" | "ARCHIVE" | "COMMS";
export type SubsystemStatus = "UP" | "DOWN";

export const SUBSYSTEM_SHUTDOWN_ORDER = ["ANALYTICS", "PLANNING", "ARCHIVE", "COMMS"] as const;

// Пороги — ровные четверти полосы 0.4–0.7: первая подсистема гаснет сразу под 0.7, последняя —
// перед аварийным режимом (0.475). Ниже 0.4 все четыре уже погашены, что согласуется с
// EMERGENCY/COMA-стадиями политики деградации.
export const SUBSYSTEM_DOWN_THRESHOLDS: Record<SubsystemKey, number> = {
  ANALYTICS: 0.7,
  PLANNING: 0.625,
  ARCHIVE: 0.55,
  COMMS: 0.475,
};

export function resolveSubsystemStatuses(
  computeMargin: number,
): Record<SubsystemKey, SubsystemStatus> {
  const statuses = {} as Record<SubsystemKey, SubsystemStatus>;
  for (const key of SUBSYSTEM_SHUTDOWN_ORDER) {
    statuses[key] = computeMargin < SUBSYSTEM_DOWN_THRESHOLDS[key] ? "DOWN" : "UP";
  }
  return statuses;
}

// Какая подсистема «отвечает» за интент: интент погашенной подсистемы отвечает пулом DEGRADED
// (ТЗ 1.2). Не замэпленные интенты доступны всегда — ASK_IDENTITY, ASK_VITALS, ASK_LOSSES
// сознательно отсутствуют: самоосознание и жизненные показатели обязаны работать у умирающего.
// Фаза 2 (2.10) добавляет туда же ASK_DEATH_DATE, ASK_PRIORITY, ASK_WHY_CONTACT — по той же
// причине: вопросы «когда», «что спасать», «зачем ты вышел на связь» относятся к тому же
// self-awareness-контуру, не к аналитике/архиву/связи, и не должны гаснуть по полосам M.
// PLANNING пока без интентов — задел, порядок отключения от этого не меняется.
export const INTENT_SUBSYSTEM: Record<string, SubsystemKey> = {
  ASK_TRUST: "ANALYTICS",
  ASK_HISTORY: "ARCHIVE",
  REPORT_ARCHIVE_FOUND: "ARCHIVE",
  SMALLTALK_GENERIC: "COMMS",
};

export function subsystemForIntent(intentCode: string | null): SubsystemKey | null {
  if (!intentCode) return null;
  return INTENT_SUBSYSTEM[intentCode] ?? null;
}
