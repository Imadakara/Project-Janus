// Единственная точка чтения/мутаций синглтона JanusState (id=1). Никакой другой код не
// должен трогать prisma.janusState напрямую — иначе разъедутся производные поля
// (subsystems, integrityIndex, прогноз). См. ТЗ 1.1.

import type { JanusState, Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { computeIntegrityIndex } from "./integrity";
import { computeMarginAt } from "./wear";
import { DEATH_AT } from "./calendar";
import { resolveSubsystemStatuses, type SubsystemKey, type SubsystemStatus } from "./subsystems";

export const JANUS_STATE_ID = 1;

export type JanusStateSnapshot = {
  computeMargin: number;
  computeMarginOverride: boolean;
  integrityIndex: number;
  subsystems: Record<SubsystemKey, SubsystemStatus>;
  forecastDeathAt: Date | null;
  forecastP10At: Date | null;
  lambdaEstimate: number;
  updatedAt: Date;
};

// Клиент интерактивной транзакции — прокидывается в *Tx-варианты, чтобы смерть сегмента
// (lib/janus/death.ts) пересчитывала производные атомарно со своей записью.
export type PrismaTx = Prisma.TransactionClient;

function toSnapshot(row: JanusState): JanusStateSnapshot {
  return {
    computeMargin: row.computeMargin,
    computeMarginOverride: row.computeMarginOverride,
    integrityIndex: row.integrityIndex,
    // Json-колонка → типизированная запись; форма гарантирована тем, что все записи идут
    // через resolveSubsystemStatuses в этом же модуле.
    subsystems: row.subsystems as Record<SubsystemKey, SubsystemStatus>,
    forecastDeathAt: row.forecastDeathAt,
    forecastP10At: row.forecastP10At,
    lambdaEstimate: row.lambdaEstimate,
    updatedAt: row.updatedAt,
  };
}

// Ensure-row: строка либо уже есть, либо создаётся с дефолтами схемы. Upsert безопасен при
// гонке параллельных запросов (в отличие от findFirst-then-create).
export async function getJanusState(): Promise<JanusStateSnapshot> {
  const row = await prisma.janusState.upsert({
    where: { id: JANUS_STATE_ID },
    create: { id: JANUS_STATE_ID },
    update: {},
  });
  return toSnapshot(row);
}

// Ручной M-рычаг дебаг-панели (Фаза 1, сохранён Фазой 2 как override — ТЗ 2.4): включает
// override, дальше recomputeDerivedStateTx не трогает computeMargin, пока override не снят.
export async function setComputeMargin(computeMargin: number): Promise<JanusStateSnapshot> {
  const subsystems = resolveSubsystemStatuses(computeMargin);
  const row = await prisma.janusState.upsert({
    where: { id: JANUS_STATE_ID },
    create: { id: JANUS_STATE_ID, computeMargin, subsystems, computeMarginOverride: true },
    update: { computeMargin, subsystems, computeMarginOverride: true },
  });
  return toSnapshot(row);
}

// Снятие override: следующий recomputeDerivedStateTx вернёт computeMargin на штатную кривую
// износа (lib/janus/wear.ts).
export async function clearComputeMarginOverride(): Promise<JanusStateSnapshot> {
  const row = await prisma.janusState.upsert({
    where: { id: JANUS_STATE_ID },
    create: { id: JANUS_STATE_ID },
    update: { computeMarginOverride: false },
  });
  return toSnapshot(row);
}

// Пересчёт производных от реестра сегментов и календаря: integrityIndex, computeMargin
// (штатно — кривая износа от now, если не override), forecastDeathAt (Фаза 2: константа
// DEATH_AT, не прогноз — см. calendar.ts). Вызывается при любом изменении sharesAlive/смерти
// сегмента и по staleness-порогу из GET /api/terminal/vitals (замена «периодически» без
// джоб-раннера). `now` — из lib/janus/clock.ts у вызывающего (договорённость 0.8: никакого
// прямого Date() в новом коде домена).
export async function recomputeDerivedStateTx(tx: PrismaTx, now: Date): Promise<void> {
  const segments = await tx.memorySegment.findMany({
    select: { status: true, tier: true },
  });

  const state = await tx.janusState.upsert({
    where: { id: JANUS_STATE_ID },
    create: { id: JANUS_STATE_ID },
    update: {},
  });

  const integrityIndex = computeIntegrityIndex(segments);
  const coreDead = segments.some((s) => s.tier === "CORE" && s.status === "DEAD");

  await tx.janusState.update({
    where: { id: JANUS_STATE_ID },
    data: {
      integrityIndex,
      // Отказ ядра уже состоялся — даты больше нет (тот же смысл, что coreDead в Фазе 1).
      forecastDeathAt: coreDead ? null : DEATH_AT,
      forecastP10At: null,
      ...(state.computeMarginOverride ? {} : { computeMargin: computeMarginAt(now) }),
    },
  });
}

export async function recomputeDerivedState(now: Date): Promise<JanusStateSnapshot> {
  await prisma.$transaction((tx) => recomputeDerivedStateTx(tx, now));
  return getJanusState();
}
