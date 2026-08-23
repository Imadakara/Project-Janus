// Единственная точка получения времени в домене (ТЗ, договорённость 0.8): прямой
// new Date()/Date.now() в новом коде домена запрещён — иначе девятимесячную активную фазу
// невозможно ни протестировать, ни промотать дебаг-рычагом (2.11). В проде — системное время;
// офсет пишется только с дебаг-панели и в проде всегда 0.

import { prisma } from "@/lib/db";
import { JANUS_STATE_ID } from "./state";

export async function now(): Promise<Date> {
  const row = await prisma.janusState.findUnique({
    where: { id: JANUS_STATE_ID },
    select: { debugTimeOffsetMs: true },
  });
  const offsetMs = row ? Number(row.debugTimeOffsetMs) : 0;
  return new Date(Date.now() + offsetMs);
}

export async function getDebugTimeOffsetMs(): Promise<number> {
  const row = await prisma.janusState.findUnique({
    where: { id: JANUS_STATE_ID },
    select: { debugTimeOffsetMs: true },
  });
  return row ? Number(row.debugTimeOffsetMs) : 0;
}

export async function setDebugTimeOffsetMs(offsetMs: number): Promise<void> {
  await prisma.janusState.upsert({
    where: { id: JANUS_STATE_ID },
    create: { id: JANUS_STATE_ID, debugTimeOffsetMs: BigInt(Math.round(offsetMs)) },
    update: { debugTimeOffsetMs: BigInt(Math.round(offsetMs)) },
  });
}
