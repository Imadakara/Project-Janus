// Единственная точка чтения/мутаций синглтона JanusState (id=1). Никакой другой код не
// должен трогать prisma.janusState напрямую — иначе разъедутся производные поля
// (subsystems, integrityIndex, прогноз). См. ТЗ 1.1.

import type { JanusState, Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { computeCoreForecast } from "./forecast";
import { computeIntegrityIndex } from "./integrity";
import { resolveSubsystemStatuses, type SubsystemKey, type SubsystemStatus } from "./subsystems";

export const JANUS_STATE_ID = 1;

export type JanusStateSnapshot = {
  computeMargin: number;
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

// В Фазе 1 M — ручной рычаг с дебаг-панели; в Фазе 3 сюда же будет писать живой расчёт по
// флоту узлов. Статусы подсистем — производные от M, персистятся вместе с ним, чтобы
// PULS/vitals читали снапшот, а не пересчитывали политику.
export async function setComputeMargin(computeMargin: number): Promise<JanusStateSnapshot> {
  const subsystems = resolveSubsystemStatuses(computeMargin);
  const row = await prisma.janusState.upsert({
    where: { id: JANUS_STATE_ID },
    create: { id: JANUS_STATE_ID, computeMargin, subsystems },
    update: { computeMargin, subsystems },
  });
  return toSnapshot(row);
}

// Пересчёт производных от реестра сегментов: integrityIndex + прогноз отказа ядра.
// Вызывается при любом изменении sharesAlive/смерти сегмента (ТЗ 1.4) и по staleness-порогу
// из GET /api/terminal/vitals (замена «периодически» без джоб-раннера).
export async function recomputeDerivedStateTx(tx: PrismaTx): Promise<void> {
  const segments = await tx.memorySegment.findMany({
    select: { status: true, tier: true, sharesAlive: true, k: true },
  });

  const state = await tx.janusState.upsert({
    where: { id: JANUS_STATE_ID },
    create: { id: JANUS_STATE_ID },
    update: {},
  });

  const integrityIndex = computeIntegrityIndex(segments);
  const forecast = computeCoreForecast(
    segments.filter((segment) => segment.tier === "CORE"),
    state.lambdaEstimate,
    new Date(),
  );

  await tx.janusState.update({
    where: { id: JANUS_STATE_ID },
    data: {
      integrityIndex,
      forecastDeathAt: forecast.deathAt,
      forecastP10At: forecast.p10At,
    },
  });
}

export async function recomputeDerivedState(): Promise<JanusStateSnapshot> {
  await recomputeDerivedStateTx(prisma);
  return getJanusState();
}
